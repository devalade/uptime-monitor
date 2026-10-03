import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "remix/data-table";
import { checkMonitor, getMonitorById } from "~/app/services/monitor-service";
import { incidents } from "~/database/schema";
import type { AlertSettings } from "~/app/services/alerting";
import type { AppDatabase } from "~/app/contracts/database";
import { addMonitor, createTestDatabase, networkError, ok, serverError, stubFetch } from "./helpers";

const WEBHOOK = "https://hooks.example.test/alerts";
const alerts: AlertSettings = { webhookUrl: WEBHOOK };
const noDelay = { confirmFailureDelayMs: 0 };

const incidentsFor = (db: AppDatabase, monitorId: string) =>
	db.findMany(incidents, { where: eq(incidents.monitor_id, monitorId) });

describe("confirming failures before alerting", () => {
	test("a single failure followed by a success does not open an incident", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		const { probes, webhooks } = stubFetch({ site: [serverError, ok], webhookUrl: WEBHOOK });

		const { monitor: updated } = await checkMonitor(db, monitor, alerts, noDelay);

		assert.equal(probes.length, 2, "re-checks once after the failure");
		assert.equal(updated.last_status, "up");
		assert.equal((await incidentsFor(db, monitor.id)).length, 0);
		assert.equal(webhooks.length, 0, "nobody is paged for a blip");
	});

	test("two failures in a row open an incident and send one DOWN alert", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		const { probes, webhooks } = stubFetch({ site: [serverError, serverError], webhookUrl: WEBHOOK });

		const { monitor: updated, incident } = await checkMonitor(db, monitor, alerts, noDelay);

		assert.equal(probes.length, 2);
		assert.equal(updated.last_status, "down");
		assert.ok(incident);
		assert.equal(incident.resolved_at, null);
		assert.equal(webhooks.length, 1);
		assert.equal(JSON.parse(webhooks[0].body).event, "monitor.down");
	});

	test("network errors are treated as failures", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		stubFetch({ site: [networkError] });

		const { monitor: updated, outcome } = await checkMonitor(db, monitor, undefined, noDelay);

		assert.equal(updated.last_status, "down");
		assert.equal(outcome.statusCode, null);
		assert.match(outcome.errorMessage ?? "", /fetch failed/);
	});

	test("during a confirmed outage each check runs once and does not re-alert", async () => {
		const db = await createTestDatabase();
		const { probes, webhooks } = stubFetch({ site: [serverError], webhookUrl: WEBHOOK });
		const down = (await checkMonitor(db, await addMonitor(db), alerts, noDelay)).monitor;
		probes.length = 0;
		webhooks.length = 0;

		await checkMonitor(db, down, alerts, noDelay);

		assert.equal(probes.length, 1, "no confirmation re-check while already down");
		assert.equal(webhooks.length, 0);
		assert.equal((await incidentsFor(db, down.id)).length, 1, "still one incident");
	});
});

describe("incident lifecycle", () => {
	async function downMonitor(db: AppDatabase) {
		stubFetch({ site: [serverError] });
		return (await checkMonitor(db, await addMonitor(db), undefined, noDelay)).monitor;
	}

	test("recovery resolves the incident and sends one RECOVERED alert", async () => {
		const db = await createTestDatabase();
		const down = await downMonitor(db);
		const { webhooks } = stubFetch({ site: [ok], webhookUrl: WEBHOOK });

		const { monitor: updated } = await checkMonitor(db, down, alerts, noDelay);

		assert.equal(updated.last_status, "up");
		const [incident] = await incidentsFor(db, down.id);
		assert.notEqual(incident.resolved_at, null);
		assert.equal(webhooks.length, 1);
		assert.equal(JSON.parse(webhooks[0].body).event, "monitor.recovered");
	});

	test("a slow but reachable response also ends the outage", async () => {
		const db = await createTestDatabase();
		const down = await getMonitorById(db, (await downMonitor(db)).id);
		assert.ok(down);
		const slow = { ...down, degraded_after_ms: 0 };
		stubFetch({ site: [ok] });

		const { monitor: updated } = await checkMonitor(db, slow, undefined, noDelay);

		assert.equal(updated.last_status, "degraded");
		const [incident] = await incidentsFor(db, slow.id);
		assert.notEqual(incident.resolved_at, null, "degraded must not leave the incident open");
	});

	test("an incident left open while the monitor reads up is closed by the next good check", async () => {
		const db = await createTestDatabase();
		const down = await downMonitor(db);
		// Simulate the old bug: status already up, incident still open.
		const stuck = { ...down, last_status: "up" as const };
		const { webhooks } = stubFetch({ site: [ok], webhookUrl: WEBHOOK });

		await checkMonitor(db, stuck, alerts, noDelay);

		const [incident] = await incidentsFor(db, down.id);
		assert.notEqual(incident.resolved_at, null);
		assert.equal(webhooks.length, 1, "closing a real incident still notifies");
	});

	test("healthy checks with no open incident send nothing", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		const { webhooks } = stubFetch({ site: [ok], webhookUrl: WEBHOOK });

		await checkMonitor(db, monitor, alerts, noDelay);
		const checked = await getMonitorById(db, monitor.id);
		assert.ok(checked);
		await checkMonitor(db, checked, alerts, noDelay);

		assert.equal(webhooks.length, 0);
	});

	test("a failing alert channel does not break the check", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		stubFetch({ site: [serverError], webhookUrl: WEBHOOK, webhookStatus: 500 });

		const { monitor: updated, incident } = await checkMonitor(db, monitor, alerts, noDelay);

		assert.equal(updated.last_status, "down");
		assert.ok(incident);
	});
});
