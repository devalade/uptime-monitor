import { describe, test } from "node:test";
import assert from "node:assert/strict";
import application from "~/bootstrap/app";
import { isPublicPath } from "~/app/http/auth";
import { getMonitorById, listMonitors, recordCheckOutcome } from "~/app/services/monitor-service";
import { createMaintenanceWindow, listCurrentAndUpcomingMaintenance } from "~/app/services/maintenance";
import { listStatusPosts } from "~/app/services/status-posts";
import { listAlertChannelRows } from "~/app/services/alert-channels";
import type { AppDatabase } from "~/app/contracts/database";
import { addMonitor, createTestDatabase } from "./helpers";

const ORIGIN = "http://localhost";

function client(db: AppDatabase) {
	const app = application({ db });
	return {
		get: (path: string) => app.fetch(new Request(`${ORIGIN}${path}`)),
		post: (path: string, fields: Record<string, string | string[]> = {}) => {
			const body = new FormData();
			for (const [name, value] of Object.entries(fields)) {
				for (const item of Array.isArray(value) ? value : [value]) body.append(name, item);
			}
			return app.fetch(new Request(`${ORIGIN}${path}`, { method: "POST", body, headers: { Referer: `${ORIGIN}/` } }));
		},
		request: (path: string, init: RequestInit) => app.fetch(new Request(`${ORIGIN}${path}`, init)),
	};
}

describe("public paths", () => {
	test("status page, feed, badges, health and pings are public; nothing else is", () => {
		for (const path of ["/status", "/status/feed.xml", "/status/badge/abc.svg", "/api/health", "/api/health/ping/tok", "/api/health/ping/tok/fail"]) {
			assert.ok(isPublicPath(path), path);
		}
		for (const path of ["/", "/statusx", "/api/healthz", "/api/health/other", "/monitors/1", "/alerts", "/api/mcp"]) {
			assert.ok(!isPublicPath(path), path);
		}
	});
});

describe("admin pages render", () => {
	test("every page loads with monitors of each type", async () => {
		const db = await createTestDatabase();
		const http = await addMonitor(db, { name: "Website", keyword: "Welcome", requestHeaders: "X-Key: 1" });
		const tcp = await addMonitor(db, { name: "Postgres", type: "tcp", url: "db.example.com:5432" });
		await addMonitor(db, { name: "Mail DNS", type: "dns", url: "example.com", dnsRecordType: "MX" });
		const heartbeat = await addMonitor(db, { name: "Backups", type: "heartbeat", url: "" });
		await recordCheckOutcome(db, http, { status: "up", statusCode: 200, responseTimeMs: 120 });
		await recordCheckOutcome(db, (await getMonitorById(db, http.id))!, { status: "down", statusCode: 500, responseTimeMs: 80, errorMessage: "boom" });
		await createMaintenanceWindow(db, { title: "DB upgrade", startsAt: Date.now() - 1000, endsAt: Date.now() + 3_600_000, monitorIds: [tcp.id] });
		const app = client(db);

		for (const path of ["/", "/?filter=down", `/monitors/${http.id}`, `/monitors/${tcp.id}`, `/monitors/${heartbeat.id}`, "/maintenance", "/incidents", "/alerts", "/reports", "/reports?month=2026-01", "/settings", "/status"]) {
			const response = await app.get(path);
			assert.equal(response.status, 200, path);
			const html = await response.text();
			assert.match(html, /<\/html>/, path);
			assert.doesNotMatch(html, /undefined|\[object Object\]/, `${path} leaks a JS value`);
		}

		const heartbeatPage = await (await app.get(`/monitors/${heartbeat.id}`)).text();
		assert.ok(heartbeatPage.includes(`/api/health/ping/${heartbeat.heartbeat_token}`), "shows the ping URL");
		const tcpPage = await (await app.get(`/monitors/${tcp.id}`)).text();
		assert.match(tcpPage, /tcp:\/\/db\.example\.com:5432/);
		assert.match(tcpPage, /maintenance window/);
	});
});

describe("monitor forms", () => {
	test("create a heartbeat, then edit it", async () => {
		const db = await createTestDatabase();
		const app = client(db);

		const created = await app.post("/monitors", { type: "heartbeat", name: "Cron", interval_seconds: "3600", grace_seconds: "600", is_public: "on" });
		assert.equal(created.status, 303);
		const [monitor] = await listMonitors(db);
		assert.equal(created.headers.get("Location"), `/monitors/${monitor.id}`);
		assert.equal(monitor.type, "heartbeat");

		const edited = await app.post(`/monitors/${monitor.id}`, {
			type: "heartbeat",
			name: "Nightly cron",
			interval_seconds: "86400",
			grace_seconds: "900",
			failure_threshold: "2",
			reminder_minutes: "60",
			alert_mode: "all",
		});
		assert.equal(edited.status, 303);
		const updated = await getMonitorById(db, monitor.id);
		assert.equal(updated?.name, "Nightly cron");
		assert.equal(updated?.interval_seconds, 86400);
		assert.ok(!updated?.is_public, "unticked checkbox");
		assert.equal(updated?.heartbeat_token, monitor.heartbeat_token, "editing keeps the ping URL");
	});

	test("an invalid edit re-renders the page with the dialog open", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		const response = await client(db).post(`/monitors/${monitor.id}`, { type: "http", url: "ftp://nope" });

		assert.equal(response.status, 400);
		const html = await response.text();
		assert.match(html, /id="edit-monitor-modal"[^>]*data-open-on-load/);
		assert.match(html, /Use an http:\/\/ or https:\/\/ address/);
		assert.equal((await getMonitorById(db, monitor.id))?.url, "https://api.test/health", "nothing saved");
	});

	test("an invalid create keeps the values and shows the errors", async () => {
		const db = await createTestDatabase();
		const response = await client(db).post("/monitors", { type: "tcp", tcp_target: "nohost" });
		assert.equal(response.status, 400);
		const html = await response.text();
		assert.match(html, /value="nohost"/);
		assert.match(html, /Use host:port/);
	});
});

describe("maintenance, incidents and alert pages", () => {
	test("schedule and end a maintenance window", async () => {
		const db = await createTestDatabase();
		const app = client(db);
		const inAnHour = new Date(Date.now() + 3_600_000).toISOString().slice(0, 16);
		const inTwoHours = new Date(Date.now() + 7_200_000).toISOString().slice(0, 16);

		const response = await app.post("/maintenance", { title: "Upgrade", starts_at: inAnHour, ends_at: inTwoHours, tz_offset: "0", scope: "all" });
		assert.equal(response.status, 303);
		const [window] = await listCurrentAndUpcomingMaintenance(db);
		assert.equal(window.title, "Upgrade");

		await app.post(`/maintenance/${window.id}/end`);
		assert.equal((await listCurrentAndUpcomingMaintenance(db)).length, 0, "an upcoming window is cancelled");
	});

	test("open an incident, post an update and delete it", async () => {
		const db = await createTestDatabase();
		const app = client(db);

		assert.equal((await app.post("/incidents", { title: "Slow checkout", impact: "minor", status: "investigating", message: "Looking" })).status, 303);
		const [{ post }] = await listStatusPosts(db);
		assert.equal((await app.post(`/incidents/${post.id}/updates`, { status: "resolved", message: "Fixed" })).status, 303);
		const [{ post: resolved, updates }] = await listStatusPosts(db);
		assert.equal(resolved.status, "resolved");
		assert.equal(updates.length, 2);

		const status = await (await app.get("/status")).text();
		assert.match(status, /Slow checkout/);

		await app.post(`/incidents/${post.id}/delete`);
		assert.equal((await listStatusPosts(db)).length, 0);
	});

	test("add, turn off and delete an alert channel", async () => {
		const db = await createTestDatabase();
		const app = client(db);

		const bad = await app.post("/alerts", { type: "webhook", url: "http://x" });
		assert.equal(bad.status, 400);

		assert.equal((await app.post("/alerts", { type: "webhook", name: "Discord", url: "https://discord.com/api/webhooks/1/x" })).status, 303);
		const [channel] = await listAlertChannelRows(db);
		await app.post(`/alerts/${channel.id}/toggle`);
		assert.ok(!(await listAlertChannelRows(db))[0].is_enabled);
		await app.post(`/alerts/${channel.id}/delete`);
		assert.equal((await listAlertChannelRows(db)).length, 0);
	});
});

describe("public endpoints", () => {
	test("heartbeat pings work with any method; unknown tokens are 404", async () => {
		const db = await createTestDatabase();
		const heartbeat = await addMonitor(db, { name: "Cron", type: "heartbeat", url: "" });
		const app = client(db);

		assert.equal((await app.request(`/api/health/ping/${heartbeat.heartbeat_token}`, { method: "HEAD" })).status, 200);
		assert.equal((await app.request(`/api/health/ping/${heartbeat.heartbeat_token}`, { method: "POST", body: "log output" })).status, 200);
		assert.equal((await getMonitorById(db, heartbeat.id))?.last_status, "up");

		assert.equal((await app.get(`/api/health/ping/${heartbeat.heartbeat_token}/fail`)).status, 200);
		assert.equal((await getMonitorById(db, heartbeat.id))?.last_status, "down");

		assert.equal((await app.get("/api/health/ping/unknown")).status, 404);
	});

	test("badges for public monitors; private ones are 404", async () => {
		const db = await createTestDatabase();
		const site = await addMonitor(db, { name: "Website" });
		const secret = await addMonitor(db, { name: "Secret", isPublic: false });
		await recordCheckOutcome(db, site, { status: "up", statusCode: 200, responseTimeMs: 50 });
		const app = client(db);

		const status = await app.get(`/status/badge/${site.id}.svg`);
		assert.equal(status.status, 200);
		assert.equal(status.headers.get("Content-Type"), "image/svg+xml; charset=utf-8");
		assert.match(await status.text(), /Website: up/);

		const uptime = await (await app.get(`/status/badge/${site.id}.svg?type=uptime&days=7`)).text();
		assert.match(uptime, /uptime 7d: no data/, "no rollup yet");

		assert.equal((await app.get(`/status/badge/${secret.id}.svg`)).status, 404);
	});

	test("the RSS feed lists incidents and maintenance", async () => {
		const db = await createTestDatabase();
		const site = await addMonitor(db, { name: "Website" });
		await recordCheckOutcome(db, site, { status: "down", statusCode: 500, responseTimeMs: 50, errorMessage: "boom" });
		await createMaintenanceWindow(db, { title: "Upgrade & cleanup", startsAt: Date.now() + 60_000, endsAt: Date.now() + 120_000, monitorIds: null });

		const response = await client(db).get("/status/feed.xml");
		assert.equal(response.headers.get("Content-Type"), "application/rss+xml; charset=utf-8");
		const xml = await response.text();
		assert.match(xml, /<title>Website is down<\/title>/);
		assert.match(xml, /<title>Maintenance: Upgrade &amp; cleanup<\/title>/);
		assert.doesNotMatch(xml, /boom/, "raw failure details stay private");
	});
});

describe("escaping and cross-origin protection", () => {
	test("user-supplied text renders as text on every page", async () => {
		const db = await createTestDatabase();
		const evil = `<img src=x onerror="alert(1)">`;
		const http = await addMonitor(db, { name: evil });
		await recordCheckOutcome(db, http, { status: "down", statusCode: 500, responseTimeMs: 80, errorMessage: evil });
		await createMaintenanceWindow(db, { title: evil, startsAt: Date.now() - 1000, endsAt: Date.now() + 3_600_000, monitorIds: null });
		const app = client(db);

		const ownMarkupEscaped = /&lt;(?:div|span|time|a|p|b|svg|option|label|input|item|title|details|section|form)\b/;
		for (const path of ["/", `/monitors/${http.id}`, "/maintenance", "/reports", "/status", "/status/feed.xml"]) {
			const body = await (await app.get(path)).text();
			assert.ok(!body.includes("<img src=x"), `${path} renders the name as markup`);
			assert.ok(body.includes("&lt;img src=x onerror="), `${path} shows the escaped name`);
			assert.doesNotMatch(body, ownMarkupEscaped, `${path} escapes its own markup`);
		}

		const heartbeat = await addMonitor(db, { name: "Cron", type: "heartbeat", url: "" });
		const pages = await Promise.all([
			...["/?filter=down", `/monitors/${heartbeat.id}`, "/incidents", "/alerts", "/settings", "/status/unsubscribe/tok"].map((path) => app.get(path)),
			app.post("/monitors", { url: "nope" }),
			app.post(`/monitors/${http.id}`, { url: "nope" }),
			app.post("/maintenance", { title: "" }),
			app.post("/incidents", { title: "" }),
			app.post("/alerts", { type: "webhook", url: "nope" }),
			app.post("/settings/status-page", { logo_url: "http://insecure" }),
		]);
		for (const page of pages) assert.doesNotMatch(await page.text(), ownMarkupEscaped, page.url);
	});

	test("cross-site form posts are refused; heartbeat pings are not", async () => {
		const db = await createTestDatabase();
		const heartbeat = await addMonitor(db, { name: "Cron", type: "heartbeat", url: "" });
		const app = client(db);
		const crossSite = { "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example" };

		const forged = await app.request("/monitors", { method: "POST", headers: crossSite, body: new URLSearchParams({ url: "https://a.test" }) });
		assert.equal(forged.status, 403);
		assert.equal((await listMonitors(db)).length, 1, "nothing was created");

		const sameOrigin = await app.request("/monitors", { method: "POST", headers: { "Sec-Fetch-Site": "same-origin" }, body: new URLSearchParams({ url: "https://a.test" }) });
		assert.equal(sameOrigin.status, 303);

		const ping = await app.request(`/api/health/ping/${heartbeat.heartbeat_token}`, { method: "POST", headers: crossSite });
		assert.equal(ping.status, 200);
	});
});
