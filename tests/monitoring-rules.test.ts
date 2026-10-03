import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "remix/data-table";
import {
	calculate24hUptime,
	checkMonitor,
	getMonitorById,
	recordCheckOutcome,
	recordHeartbeatPing,
	setMonitorEnabled,
} from "~/app/services/monitor-service";
import { createMaintenanceWindow } from "~/app/services/maintenance";
import { createAlertChannel, toggleAlertChannel } from "~/app/services/alert-channels";
import { ENV_WEBHOOK_CHANNEL_ID, type AlertSettings } from "~/app/services/alerting";
import type { RegionalProbes } from "~/app/services/regional-probes";
import type { CheckOutcome } from "~/app/services/checker";
import { incidents } from "~/database/schema";
import type { AppDatabase } from "~/app/contracts/database";
import { addMonitor, createTestDatabase, ok, serverError, stubFetch } from "./helpers";

const WEBHOOK = "https://hooks.example.test/alerts";
const alerts: AlertSettings = { webhookUrl: WEBHOOK };
const noDelay = { confirmFailureDelayMs: 0 };
const MINUTE = 60_000;

const down: CheckOutcome = { status: "down", statusCode: 500, responseTimeMs: 20, errorMessage: "Expected HTTP 200 but received 500" };
const up: CheckOutcome = { status: "up", statusCode: 200, responseTimeMs: 20 };

const incidentsFor = (db: AppDatabase, monitorId: string) => db.findMany(incidents, { where: eq(incidents.monitor_id, monitorId) });

async function reload(db: AppDatabase, id: string) {
	const monitor = await getMonitorById(db, id);
	assert.ok(monitor);
	return monitor;
}

describe("heartbeat monitors", () => {
	async function addHeartbeat(db: AppDatabase) {
		return addMonitor(db, { name: "Nightly backup", type: "heartbeat", url: "", intervalSeconds: 3600, graceSeconds: 300 });
	}

	test("get a secret token and stay pending until the first ping", async () => {
		const db = await createTestDatabase();
		const heartbeat = await addHeartbeat(db);

		assert.equal(heartbeat.type, "heartbeat");
		assert.ok(heartbeat.heartbeat_token && heartbeat.heartbeat_token.length >= 20);
		assert.equal(heartbeat.url, "");

		const { monitor, outcome } = await checkMonitor(db, heartbeat, alerts);
		assert.equal(outcome, null, "nothing to check before the first ping");
		assert.equal(monitor.last_status, null);
		assert.equal((await incidentsFor(db, heartbeat.id)).length, 0);
	});

	test("a ping marks it up and schedules the next look after period + grace", async () => {
		const db = await createTestDatabase();
		const heartbeat = await addHeartbeat(db);
		const now = Date.now();

		const pinged = await recordHeartbeatPing(db, heartbeat.heartbeat_token ?? "", undefined, { now });

		assert.equal(pinged?.last_status, "up");
		assert.equal(pinged?.last_ping_at, now);
		assert.equal(pinged?.next_due_at, now + (3600 + 300) * 1000);
		assert.equal(pinged?.last_response_time_ms, null, "heartbeats have no response time");
	});

	test("a late ping takes it down, alerts, and the next ping recovers it", async () => {
		const db = await createTestDatabase();
		const heartbeat = await addHeartbeat(db);
		const { webhooks } = stubFetch({ webhookUrl: WEBHOOK });
		const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
		await recordHeartbeatPing(db, heartbeat.heartbeat_token ?? "", undefined, { now: twoHoursAgo });

		const { monitor, outcome, incident } = await checkMonitor(db, await reload(db, heartbeat.id), alerts);

		assert.equal(outcome?.status, "down");
		assert.match(outcome?.errorMessage ?? "", /No ping since/);
		assert.equal(monitor.last_status, "down");
		assert.ok(incident);
		assert.equal(JSON.parse(webhooks[0].body).event, "monitor.down");

		const recovered = await recordHeartbeatPing(db, heartbeat.heartbeat_token ?? "", alerts);
		assert.equal(recovered?.last_status, "up");
		assert.notEqual((await incidentsFor(db, heartbeat.id))[0].resolved_at, null);
		assert.equal(JSON.parse(webhooks[1].body).event, "monitor.recovered");
	});

	test("a ping that is not late yet changes nothing", async () => {
		const db = await createTestDatabase();
		const heartbeat = await addHeartbeat(db);
		await recordHeartbeatPing(db, heartbeat.heartbeat_token ?? "", undefined, { now: Date.now() - 10 * MINUTE });

		const { monitor, outcome } = await checkMonitor(db, await reload(db, heartbeat.id), alerts);

		assert.equal(outcome, null);
		assert.equal(monitor.last_status, "up");
	});

	test("the job can report a failure", async () => {
		const db = await createTestDatabase();
		const heartbeat = await addHeartbeat(db);

		const failed = await recordHeartbeatPing(db, heartbeat.heartbeat_token ?? "", undefined, { failed: true });

		assert.equal(failed?.last_status, "down");
		assert.equal((await incidentsFor(db, heartbeat.id))[0].cause, "The job reported a failure");
	});

	test("unknown tokens and HTTP monitors are not found; paused heartbeats only record the ping", async () => {
		const db = await createTestDatabase();
		assert.equal(await recordHeartbeatPing(db, "nope"), null);

		const heartbeat = await addHeartbeat(db);
		await setMonitorEnabled(db, heartbeat, false);
		const pinged = await recordHeartbeatPing(db, heartbeat.heartbeat_token ?? "", undefined, { failed: true });
		assert.equal(pinged?.last_status, null, "no status change while paused");
		assert.ok(pinged?.last_ping_at);
	});
});

describe("failure threshold", () => {
	test("the monitor goes down only after N failed checks in a row", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db, { failureThreshold: 3 });
		const { webhooks } = stubFetch({ webhookUrl: WEBHOOK });

		let current = (await recordCheckOutcome(db, monitor, up, alerts)).monitor;
		current = (await recordCheckOutcome(db, current, down, alerts)).monitor;
		current = (await recordCheckOutcome(db, current, down, alerts)).monitor;
		assert.equal(current.last_status, "up", "two failures are not enough");
		assert.equal(current.consecutive_failures, 2);
		assert.equal(webhooks.length, 0);

		current = (await recordCheckOutcome(db, current, down, alerts)).monitor;
		assert.equal(current.last_status, "down");
		assert.equal(webhooks.length, 1);
	});

	test("a passing check resets the count", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db, { failureThreshold: 2 });

		let current = (await recordCheckOutcome(db, monitor, down)).monitor;
		current = (await recordCheckOutcome(db, current, up)).monitor;
		current = (await recordCheckOutcome(db, current, down)).monitor;

		assert.equal(current.consecutive_failures, 1);
		assert.notEqual(current.last_status, "down");
	});
});

describe("reminders while down", () => {
	test("repeat the DOWN alert every N minutes, then RECOVERED once", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db, { reminderMinutes: 30 });
		const { webhooks } = stubFetch({ webhookUrl: WEBHOOK });
		const start = Date.now() - 2 * 3600 * 1000;

		let current = (await recordCheckOutcome(db, monitor, down, alerts, start)).monitor;
		current = (await recordCheckOutcome(db, current, down, alerts, start + 10 * MINUTE)).monitor;
		assert.equal(webhooks.length, 1, "no reminder before 30 minutes");

		current = (await recordCheckOutcome(db, current, down, alerts, start + 31 * MINUTE)).monitor;
		assert.equal(webhooks.length, 2);
		assert.equal(JSON.parse(webhooks[1].body).event, "monitor.still_down");
		assert.match(JSON.parse(webhooks[1].body).text, /STILL DOWN/);

		current = (await recordCheckOutcome(db, current, down, alerts, start + 45 * MINUTE)).monitor;
		assert.equal(webhooks.length, 2, "the next reminder waits another 30 minutes");

		await recordCheckOutcome(db, current, up, alerts, start + 50 * MINUTE);
		assert.equal(JSON.parse(webhooks[2].body).event, "monitor.recovered");
	});

	test("are off by default", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		const { webhooks } = stubFetch({ webhookUrl: WEBHOOK });
		const start = Date.now() - 5 * 3600 * 1000;

		let current = (await recordCheckOutcome(db, monitor, down, alerts, start)).monitor;
		current = (await recordCheckOutcome(db, current, down, alerts, start + 4 * 3600 * 1000)).monitor;

		assert.equal(webhooks.length, 1);
	});
});

describe("maintenance windows", () => {
	test("failures during maintenance open no incident, alert nobody and do not count against uptime", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		const { webhooks } = stubFetch({ webhookUrl: WEBHOOK });
		await createMaintenanceWindow(db, { title: "Upgrade", startsAt: Date.now() - MINUTE, endsAt: Date.now() + 30 * MINUTE, monitorIds: null });

		const { monitor: updated } = await recordCheckOutcome(db, monitor, down, alerts);

		assert.equal(updated.last_status, "down", "the status still shows the truth");
		assert.equal((await incidentsFor(db, monitor.id)).length, 0);
		assert.equal(webhooks.length, 0);
		assert.equal(await calculate24hUptime(db, monitor.id), null, "maintenance checks are left out");
	});

	test("an outage that outlasts the window opens an incident once the window ends", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		const { webhooks } = stubFetch({ webhookUrl: WEBHOOK });
		const now = Date.now();
		await createMaintenanceWindow(db, { title: "Upgrade", startsAt: now - 60 * MINUTE, endsAt: now - 5 * MINUTE, monitorIds: null });

		const during = (await recordCheckOutcome(db, monitor, down, alerts, now - 30 * MINUTE)).monitor;
		assert.equal(webhooks.length, 0);

		await recordCheckOutcome(db, during, down, alerts, now);
		assert.equal((await incidentsFor(db, monitor.id)).length, 1);
		assert.equal(webhooks.length, 1);
	});

	test("a window can cover only some monitors", async () => {
		const db = await createTestDatabase();
		const covered = await addMonitor(db, { name: "covered" });
		const other = await addMonitor(db, { name: "other" });
		stubFetch({ webhookUrl: WEBHOOK });
		await createMaintenanceWindow(db, { title: "DB", startsAt: Date.now() - MINUTE, endsAt: Date.now() + MINUTE * 10, monitorIds: [covered.id] });

		await recordCheckOutcome(db, covered, down, alerts);
		await recordCheckOutcome(db, other, down, alerts);

		assert.equal((await incidentsFor(db, covered.id)).length, 0);
		assert.equal((await incidentsFor(db, other.id)).length, 1);
	});
});

describe("alert routing", () => {
	test("dashboard channels receive alerts alongside environment ones", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		await createAlertChannel(db, { name: "Ops Telegram", type: "telegram", config: { botToken: "123:abcdefghijklmnopqrstuvwxyz", chatId: "-100" } });
		const telegram: { url: string; body: string }[] = [];
		const { webhooks } = stubFetch({
			webhookUrl: WEBHOOK,
			site: [
				(request) => {
					telegram.push({ url: request.url, body: request.body });
					return Response.json({ ok: true });
				},
			],
		});

		await recordCheckOutcome(db, monitor, down, alerts);

		assert.equal(webhooks.length, 1);
		assert.equal(telegram.length, 1);
		assert.equal(telegram[0].url, "https://api.telegram.org/bot123:abcdefghijklmnopqrstuvwxyz/sendMessage");
		assert.equal(JSON.parse(telegram[0].body).chat_id, "-100");
		assert.match(JSON.parse(telegram[0].body).text, /DOWN: API/);
	});

	test("a monitor can be limited to some channels", async () => {
		const db = await createTestDatabase();
		const pager = await createAlertChannel(db, { name: "PagerDuty", type: "pagerduty", config: { routingKey: "a".repeat(32) } });
		const monitor = await addMonitor(db, { alertChannelIds: [pager.id] });
		const pagerduty: unknown[] = [];
		const { webhooks } = stubFetch({
			webhookUrl: WEBHOOK,
			site: [
				(request) => {
					pagerduty.push(JSON.parse(request.body));
					return new Response("{}", { status: 202 });
				},
			],
		});

		const downMonitor = (await recordCheckOutcome(db, monitor, down, alerts)).monitor;
		await recordCheckOutcome(db, downMonitor, up, alerts);

		assert.equal(webhooks.length, 0, "the environment webhook was not selected");
		assert.deepEqual(
			pagerduty.map((event) => (event as { event_action: string }).event_action),
			["trigger", "resolve"],
		);
		const [trigger, resolve] = pagerduty as { dedup_key: string }[];
		assert.equal(trigger.dedup_key, resolve.dedup_key, "both land on one PagerDuty incident");
	});

	test("the environment webhook can be selected by its id; turned-off channels get nothing", async () => {
		const db = await createTestDatabase();
		const off = await createAlertChannel(db, { name: "Old hook", type: "webhook", config: { url: "https://old.example.test/hook" } });
		await toggleAlertChannel(db, off.id);
		const monitor = await addMonitor(db, { name: "Selected", alertChannelIds: [ENV_WEBHOOK_CHANNEL_ID, off.id] });
		const { webhooks } = stubFetch({ webhookUrl: WEBHOOK });

		await recordCheckOutcome(db, monitor, down, alerts);

		assert.equal(webhooks.length, 1);
	});
});

describe("confirming failures from other regions", () => {
	function fakeProbes(results: Record<string, CheckOutcome | Error>): RegionalProbes & { calls: string[] } {
		const calls: string[] = [];
		return {
			calls,
			regions: Object.keys(results),
			async run(region) {
				calls.push(region);
				const result = results[region];
				if (result instanceof Error) throw result;
				return result;
			},
		};
	}

	test("down when most regions agree, with the regions named", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		stubFetch({ site: [serverError] });
		const probes = fakeProbes({ enam: down, weur: up });

		const { monitor: updated, outcome } = await checkMonitor(db, monitor, undefined, { probes });

		assert.equal(updated.last_status, "down");
		assert.match(outcome?.errorMessage ?? "", /confirmed from Eastern North America/);
	});

	test("up when the other regions reach the service", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		const { probes: localProbes } = stubFetch({ site: [serverError] });
		const probes = fakeProbes({ enam: up, weur: up });

		const { monitor: updated } = await checkMonitor(db, monitor, undefined, { probes });

		assert.equal(updated.last_status, "up");
		assert.equal(localProbes.length, 1, "no local re-check when regions answered");
		assert.deepEqual(probes.calls.sort(), ["enam", "weur"]);
	});

	test("falls back to a local re-check when no region answers", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		const { probes: localProbes } = stubFetch({ site: [serverError, ok] });
		const probes = fakeProbes({ enam: new Error("DO unavailable") });

		const { monitor: updated } = await checkMonitor(db, monitor, undefined, { probes, ...noDelay });

		assert.equal(localProbes.length, 2);
		assert.equal(updated.last_status, "up");
	});

	test("regions are not asked during an outage that is already confirmed", async () => {
		const db = await createTestDatabase();
		stubFetch({ site: [serverError] });
		const downMonitor = (await checkMonitor(db, await addMonitor(db), undefined, noDelay)).monitor;
		const probes = fakeProbes({ enam: up });

		await checkMonitor(db, downMonitor, undefined, { probes });

		assert.equal(probes.calls.length, 0);
	});
});
