import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MemoryTransport } from "@sdxc/mail/memory";
import { RequestContext } from "remix/router";
import application from "~/bootstrap/app";
import { adminAuth } from "~/app/http/auth";
import {
	buildOpsgenieRequest,
	buildPushoverRequest,
	buildTwilioRequest,
	buildWebhookRequest,
	loadAlertChannels,
	type AlertSettings,
	type IncidentAlertPayload,
} from "~/app/services/alerting";
import { createAlertChannel, parseAlertChannelInput } from "~/app/services/alert-channels";
import { createApiKey, revokeApiKey, verifyApiKey } from "~/app/services/api-keys";
import { findDueMonitors, getMonitorById, hasSubMinuteMonitors, recordCheckOutcome } from "~/app/services/monitor-service";
import { parseMonitorInput } from "~/app/services/monitor-input";
import { getMonthlyReport, reportToCsv } from "~/app/services/reports";
import { getStatusPageSettings, parseStatusPageSettings, saveStatusPageSettings, defaultStatusPageSettings } from "~/app/services/settings";
import { confirmSubscription, notifySubscribers, subscribe, unsubscribe } from "~/app/services/subscribers";
import { refreshDailyStats } from "~/app/services/uptime-stats";
import { incidents, monitorResults, statusSubscribers } from "~/database/schema";
import type { CheckOutcome } from "~/app/services/checker";
import { addMonitor, createTestDatabase, stubFetch } from "./helpers";

const WEBHOOK = "https://hooks.example.test/alerts";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are checked field by field
const readJson = async (response: Response) => (await response.json()) as Record<string, any>;
const down: IncidentAlertPayload = {
	monitor: { id: "m1", name: "API", url: "https://api.test/health" },
	previousStatus: "up",
	currentStatus: "down",
	reason: "Expected HTTP 200 but received 500",
	timestamp: Date.UTC(2026, 9, 3, 12),
};
const recovered: IncidentAlertPayload = { ...down, previousStatus: "down", currentStatus: "up", reason: "Back" };

function mailSettings(): { alerts: AlertSettings; transport: MemoryTransport } {
	const transport = new MemoryTransport();
	return { transport, alerts: { mailer: { transport, from: "status@example.com" }, publicUrl: "https://status.example.com" } };
}

describe("more alert channel formats", () => {
	test("Microsoft Teams workflows get an Adaptive Card, Google Chat gets text", () => {
		const teams = JSON.parse(String(buildWebhookRequest("https://prod-01.westeurope.logic.azure.com/workflows/x", down).init.body));
		assert.equal(teams.type, "message");
		assert.equal(teams.attachments[0].contentType, "application/vnd.microsoft.card.adaptive");
		assert.match(teams.attachments[0].content.body[0].text, /DOWN: API/);

		const chat = JSON.parse(String(buildWebhookRequest("https://chat.googleapis.com/v1/spaces/x/messages?key=k", down).init.body));
		assert.match(chat.text, /DOWN: API/);
	});

	test("Pushover uses high priority for outages", () => {
		const request = buildPushoverRequest({ token: "t".repeat(30), user: "u".repeat(30) }, down);
		const body = JSON.parse(String(request.init.body));
		assert.equal(request.url, "https://api.pushover.net/1/messages.json");
		assert.equal(body.priority, 1);
		assert.equal(JSON.parse(String(buildPushoverRequest({ token: "t", user: "u" }, recovered).init.body)).priority, 0);
	});

	test("Opsgenie opens an alert and closes it by alias", () => {
		const open = buildOpsgenieRequest({ apiKey: "k", region: "eu" }, down);
		assert.equal(open.url, "https://api.eu.opsgenie.com/v2/alerts");
		assert.equal(new Headers(open.init.headers).get("Authorization"), "GenieKey k");
		const alias = JSON.parse(String(open.init.body)).alias;

		const close = buildOpsgenieRequest({ apiKey: "k", region: "eu" }, recovered);
		assert.equal(close.url, `https://api.eu.opsgenie.com/v2/alerts/${alias}/close?identifierType=alias`);
	});

	test("Twilio sends a form-encoded SMS with basic auth", () => {
		const request = buildTwilioRequest({ accountSid: "AC1", authToken: "secret", from: "+15550001111", to: "+22990000000" }, down);
		assert.equal(request.url, "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
		assert.equal(new Headers(request.init.headers).get("Authorization"), `Basic ${btoa("AC1:secret")}`);
		const form = new URLSearchParams(String(request.init.body));
		assert.equal(form.get("To"), "+22990000000");
		assert.match(form.get("Body") ?? "", /DOWN: API — Expected HTTP 200/);
	});

	test("email channels need a mail sender", async () => {
		assert.ok(!parseAlertChannelInput({ type: "email", email_to: "a@b.co" }).ok);
		assert.ok(parseAlertChannelInput({ type: "email", email_to: "a@b.co" }, { canEmail: true }).ok);

		const db = await createTestDatabase();
		await createAlertChannel(db, { name: "Ops mail", type: "email", config: { to: "ops@example.com" } });
		assert.equal((await loadAlertChannels(db)).length, 0, "skipped without a sender");
		const { alerts } = mailSettings();
		assert.equal((await loadAlertChannels(db, alerts))[0].kind, "email");
	});
});

describe("slowness alerts", () => {
	const slow: CheckOutcome = { status: "degraded", statusCode: 200, responseTimeMs: 4000, errorMessage: "Response time 4000ms exceeded threshold of 3000ms" };
	const fast: CheckOutcome = { status: "up", statusCode: 200, responseTimeMs: 100 };

	test("alert when a monitor turns slow and when it is back to normal, only if asked", async () => {
		const db = await createTestDatabase();
		const watched = await addMonitor(db, { alertOnDegraded: true });
		const quiet = await addMonitor(db, { name: "quiet" });
		const { webhooks } = stubFetch({ webhookUrl: WEBHOOK });
		const alerts: AlertSettings = { webhookUrl: WEBHOOK };

		let current = (await recordCheckOutcome(db, watched, fast, alerts)).monitor;
		current = (await recordCheckOutcome(db, current, slow, alerts)).monitor;
		current = (await recordCheckOutcome(db, current, slow, alerts)).monitor;
		await recordCheckOutcome(db, current, fast, alerts);
		let other = (await recordCheckOutcome(db, quiet, fast, alerts)).monitor;
		other = (await recordCheckOutcome(db, other, slow, alerts)).monitor;

		assert.deepEqual(
			webhooks.map((w) => JSON.parse(w.body).event),
			["monitor.degraded", "monitor.normal"],
		);
	});
});

describe("status page subscribers", () => {
	test("subscribe, confirm, get notified, unsubscribe", async () => {
		const db = await createTestDatabase();
		const { alerts, transport } = mailSettings();
		const mail = { mailer: alerts.mailer!, publicUrl: "https://status.example.com" };

		assert.equal(await subscribe(db, mail, "Person@Example.com"), "confirmation-sent");
		const [row] = await db.findMany(statusSubscribers);
		assert.equal(row.email, "person@example.com");
		assert.match(transport.last?.text ?? "", new RegExp(`/status/subscribe/confirm/${row.token}`));

		assert.equal(await subscribe(db, mail, "person@example.com"), "try-later", "one confirmation email per hour");
		assert.equal(await notifySubscribers(db, alerts, { subject: "x", text: "y" }), 0, "unconfirmed people get nothing");

		assert.ok(await confirmSubscription(db, row.token));
		assert.equal(await subscribe(db, mail, "person@example.com"), "already-subscribed");
		assert.equal(await notifySubscribers(db, alerts, { subject: "API is down", text: "Details" }), 1);
		assert.equal(transport.last?.subject, "[System Status] API is down");
		assert.match(transport.last?.text ?? "", /Unsubscribe: https:\/\/status\.example\.com\/status\/unsubscribe\//);
		assert.equal(transport.last?.unsubscribe?.url.toString(), `https://status.example.com/status/unsubscribe/${row.token}`);

		assert.ok(await unsubscribe(db, row.token));
		assert.equal(await notifySubscribers(db, alerts, { subject: "x", text: "y" }), 0);
	});

	test("outages of public monitors are emailed; private ones are not", async () => {
		const db = await createTestDatabase();
		const { alerts, transport } = mailSettings();
		await db.create(statusSubscribers, { id: "s1", email: "a@example.com", token: "t1", confirmed_at: Date.now(), confirmation_sent_at: null, created_at: Date.now() });
		const site = await addMonitor(db, { name: "Website" });
		const internal = await addMonitor(db, { name: "Internal", isPublic: false });
		const failed: CheckOutcome = { status: "down", statusCode: 500, responseTimeMs: 10, errorMessage: "boom" };

		const downSite = (await recordCheckOutcome(db, site, failed, alerts)).monitor;
		await recordCheckOutcome(db, internal, failed, alerts);
		await recordCheckOutcome(db, downSite, { status: "up", statusCode: 200, responseTimeMs: 10 }, alerts);

		assert.deepEqual(
			transport.messages.map((m) => m.subject),
			["[System Status] Website is down", "[System Status] Website has recovered"],
		);
		assert.doesNotMatch(transport.messages[0].text ?? "", /boom/, "no raw error details");
	});

	test("the status page offers the form only when email can be sent", async () => {
		const db = await createTestDatabase();
		const plain = await (await application({ db }).fetch(new Request("http://localhost/status"))).text();
		assert.doesNotMatch(plain, /Get email updates/);

		const { alerts } = mailSettings();
		const withMail = await (await application({ db, alerts }).fetch(new Request("http://localhost/status"))).text();
		assert.match(withMail, /action="\/status\/subscribe"/);

		const body = new FormData();
		body.set("email", "visitor@example.com");
		const response = await application({ db, alerts }).fetch(new Request("http://localhost/status/subscribe", { method: "POST", body }));
		assert.equal(response.status, 303);
		assert.match(response.headers.get("Location") ?? "", /subscribe=sent/);
	});
});

describe("REST API and keys", () => {
	test("keys are stored hashed, verified and revoked", async () => {
		const db = await createTestDatabase();
		const { key, row } = await createApiKey(db, "Grafana");
		assert.match(key, /^um_[A-Za-z0-9_-]{32}$/);
		assert.notEqual(row.key_hash, key);
		assert.equal(row.prefix, key.slice(0, 8));
		assert.ok(await verifyApiKey(db, key));
		assert.ok(!(await verifyApiKey(db, `${key}x`)));
		await revokeApiKey(db, row.id);
		assert.ok(!(await verifyApiKey(db, key)));
	});

	test("with Access configured, /api/v1 accepts a valid API key and nothing else", async () => {
		const guard = adminAuth({ access: { teamDomain: "team", audience: "aud" }, verifyApiKey: async (key) => key === "um_good" });
		const status = async (path: string, headers: Record<string, string> = {}) =>
			(await guard(new RequestContext(new Request(`https://up.test${path}`, { headers })), async () => new Response("ok"))).status;

		assert.equal(await status("/api/v1/monitors", { Authorization: "Bearer um_good" }), 200);
		assert.equal(await status("/api/v1/monitors", { Authorization: "Bearer um_bad" }), 401);
		assert.equal(await status("/api/v1/monitors"), 403);
		assert.equal(await status("/", { Authorization: "Bearer um_good" }), 403, "keys only open the API");
	});

	test("a status hostname serves only public pages", async () => {
		const guard = adminAuth({ access: { teamDomain: "team", audience: "aud" }, statusHostname: "status.example.com" });
		const run = (path: string) => guard(new RequestContext(new Request(`https://status.example.com${path}`)), async () => new Response("ok"));
		const root = await run("/");
		assert.equal(root.status, 302);
		assert.equal(root.headers.get("Location"), "https://status.example.com/status");
		assert.equal((await run("/status")).status, 200);
		assert.equal((await run("/alerts")).status, 404);
	});

	test("CRUD on monitors, incidents and Prometheus metrics", async () => {
		const db = await createTestDatabase();
		const app = application({ db });
		const call = (method: string, path: string, body?: unknown) =>
			app.fetch(
				new Request(`http://localhost${path}`, {
					method,
					headers: body ? { "Content-Type": "application/json" } : {},
					body: body ? JSON.stringify(body) : undefined,
				}),
			);

		const invalid = await call("POST", "/api/v1/monitors", { name: "x", url: "ftp://x" });
		assert.equal(invalid.status, 422);
		assert.ok((await readJson(invalid)).details.url);

		const created = await call("POST", "/api/v1/monitors", { name: "DNS", type: "dns", url: "example.com", dnsRecordType: "MX" });
		assert.equal(created.status, 201);
		const { monitor } = await readJson(created);
		assert.equal(monitor.type, "dns");
		assert.equal(monitor.settings.dnsRecordType, "MX");

		const patched = await call("PATCH", `/api/v1/monitors/${monitor.id}`, { intervalSeconds: 30, paused: true });
		const patchedBody = await readJson(patched);
		assert.equal(patchedBody.monitor.settings.intervalSeconds, 30);
		assert.equal(patchedBody.monitor.status, "paused");

		const list = await readJson(await call("GET", "/api/v1/monitors"));
		assert.equal(list.monitors.length, 1);
		assert.equal((await call("GET", `/api/v1/monitors/${monitor.id}`)).status, 200);
		assert.deepEqual(await readJson(await call("GET", "/api/v1/incidents")), { incidents: [] });

		const site = await addMonitor(db, { name: 'Web "site"' });
		await recordCheckOutcome(db, site, { status: "up", statusCode: 200, responseTimeMs: 42 });
		const metrics = await (await call("GET", "/api/v1/metrics")).text();
		assert.match(metrics, /# TYPE uptime_monitor_up gauge/);
		assert.match(metrics, new RegExp(`uptime_monitor_up\\{id="${site.id}",name="Web \\\\"site\\\\"",type="http"\\} 1`));
		assert.match(metrics, /uptime_monitor_response_time_ms\{[^}]+\} 42/);
		assert.match(metrics, /uptime_monitor_paused\{[^}]*name="DNS"[^}]*\} 1/);

		assert.equal((await call("DELETE", `/api/v1/monitors/${monitor.id}`)).status, 204);
		assert.equal((await call("GET", `/api/v1/monitors/${monitor.id}`)).status, 404);
	});
});

describe("monthly reports", () => {
	test("uptime, downtime and incidents per monitor, clipped to the month", async () => {
		const db = await createTestDatabase();
		const site = await addMonitor(db, { name: "=HYPERLINK(evil)" });
		const start = Date.UTC(2026, 8, 1);
		// 3 checks on 2026-09-10, one failed; an incident from 2026-08-31 23:30 to 2026-09-01 00:45.
		for (const [isUp, at] of [
			[true, Date.UTC(2026, 8, 10, 1)],
			[false, Date.UTC(2026, 8, 10, 2)],
			[true, Date.UTC(2026, 8, 10, 3)],
		] as const) {
			await db.create(monitorResults, {
				id: crypto.randomUUID(),
				monitor_id: site.id,
				response_status: 200,
				response_time_ms: 100,
				is_up: isUp,
				error_message: null,
				is_maintenance: false,
				created_at: at,
			});
		}
		await db.create(incidents, {
			id: "i1",
			monitor_id: site.id,
			started_at: start - 30 * 60_000,
			resolved_at: start + 45 * 60_000,
			cause: "boom",
			error_details: null,
			last_alerted_at: null,
			created_at: start,
		});
		await refreshDailyStats(db, start);

		const report = await getMonthlyReport(db, "2026-09", Date.UTC(2026, 9, 3));
		assert.ok(report);
		assert.equal(report.label, "September 2026");
		const [row] = report.rows;
		assert.equal(row.uptimePercentage, 66.67);
		assert.equal(row.totalChecks, 3);
		assert.equal(row.incidents, 1);
		assert.equal(row.downtimeMinutes, 45, "only the part inside September");

		const csv = reportToCsv(report);
		assert.match(csv, /^Monitor,Type,Uptime %/);
		assert.match(csv, /'=HYPERLINK\(evil\),http,66\.67,3,100,1,45,45/, "formulas are neutralised");

		assert.equal(await getMonthlyReport(db, "2026-13"), null);
	});
});

describe("status page settings", () => {
	test("saved settings brand the public page", async () => {
		const db = await createTestDatabase();
		assert.deepEqual(await getStatusPageSettings(db), defaultStatusPageSettings);

		const parsed = parseStatusPageSettings({ ...defaultStatusPageSettings, title: "Acme Status", accentColor: "#FF0000", logoUrl: "https://acme.test/logo.svg" });
		assert.ok(parsed.ok);
		await saveStatusPageSettings(db, parsed.value);
		await saveStatusPageSettings(db, { ...parsed.value, footer: "© Acme" });

		const html = await (await application({ db }).fetch(new Request("http://localhost/status"))).text();
		assert.match(html, /<title>Status \| Acme Status<\/title>/);
		assert.match(html, /--brand: #ff0000/);
		assert.match(html, /src="https:\/\/acme\.test\/logo\.svg"/);
		assert.match(html, /© Acme/);
	});

	test("rejects unsafe values", () => {
		const result = parseStatusPageSettings({ ...defaultStatusPageSettings, logoUrl: "javascript:alert(1)", accentColor: "red;}body{", homepageUrl: "http://x" });
		assert.ok(!result.ok);
		assert.deepEqual(Object.keys(result.errors).sort(), ["accentColor", "homepageUrl", "logoUrl"]);
	});
});

describe("30-second checks", () => {
	test("allowed for probes, not heartbeats, and picked up by the half-minute sweep", async () => {
		assert.ok(parseMonitorInput({ url: "https://a.test", interval_seconds: "30" }).ok);
		assert.ok(!parseMonitorInput({ type: "heartbeat", interval_seconds: "30" }).ok);

		const db = await createTestDatabase();
		assert.equal(await hasSubMinuteMonitors(db), false);
		const fast = await addMonitor(db, { name: "fast", intervalSeconds: 30 });
		const slow = await addMonitor(db, { name: "slow", intervalSeconds: 60 });
		assert.equal(await hasSubMinuteMonitors(db), true);

		// Both were checked at the top of the minute; half a minute later only the 30s one is due.
		const t0 = Date.now();
		await recordCheckOutcome(db, fast, { status: "up", statusCode: 200, responseTimeMs: 5 }, undefined, t0);
		await recordCheckOutcome(db, slow, { status: "up", statusCode: 200, responseTimeMs: 5 }, undefined, t0);
		const due = await findDueMonitors(db, t0 + 30_000);
		assert.deepEqual(due.map((m) => m.name), ["fast"]);
		assert.equal((await getMonitorById(db, fast.id))?.interval_seconds, 30);
	});
});

