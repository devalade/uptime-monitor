import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
	checkMonitor,
	findDueMonitors,
	getPublicStatusPageData,
	toggleMonitor,
	toggleMonitorVisibility,
} from "~/app/services/monitor-service";
import { monitors } from "~/database/schema";
import { addMonitor, createTestDatabase, ok, serverError, stubFetch } from "./helpers";

describe("scheduling", () => {
	test("a monitor due a few seconds after the cron tick is checked on this tick", async () => {
		const db = await createTestDatabase();
		const now = Date.now();
		const soon = await addMonitor(db, { name: "soon" });
		const later = await addMonitor(db, { name: "later" });
		await db.update(monitors, soon.id, { next_due_at: now + 10_000, updated_at: now });
		await db.update(monitors, later.id, { next_due_at: now + 60_000, updated_at: now });

		const due = await findDueMonitors(db, now);

		assert.deepEqual(due.map((m) => m.name), ["soon"]);
	});

	test("paused monitors are never due", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		await toggleMonitor(db, monitor.id);

		assert.equal((await findDueMonitors(db)).length, 0);
	});
});

describe("public status page", () => {
	test("private monitors are left out", async () => {
		const db = await createTestDatabase();
		await addMonitor(db, { name: "Website" });
		const internal = await addMonitor(db, { name: "Internal admin" });
		await toggleMonitorVisibility(db, internal.id);

		const data = await getPublicStatusPageData(db);

		assert.deepEqual(data.services.map((s) => s.name), ["Website"]);
	});

	test("an outage on a private monitor does not show as a public incident", async () => {
		const db = await createTestDatabase();
		const internal = await addMonitor(db, { name: "Internal admin", isPublic: false });
		stubFetch({ site: [serverError] });
		await checkMonitor(db, internal, undefined, { confirmFailureDelayMs: 0 });

		const data = await getPublicStatusPageData(db);

		assert.equal(data.systemStatus, "operational");
		assert.equal(data.activeIncidents.length, 0);
	});

	test("public incidents carry no raw failure details", async () => {
		const db = await createTestDatabase();
		const site = await addMonitor(db, { name: "Website" });
		stubFetch({ site: [serverError] });
		await checkMonitor(db, site, undefined, { confirmFailureDelayMs: 0 });

		const data = await getPublicStatusPageData(db);

		assert.equal(data.systemStatus, "outage");
		assert.deepEqual(Object.keys(data.activeIncidents[0]).sort(), ["id", "monitorName", "resolvedAt", "startedAt"]);
	});

	test("uptime is null until a monitor has been checked, then reflects real checks", async () => {
		const db = await createTestDatabase();
		const site = await addMonitor(db);

		assert.equal((await getPublicStatusPageData(db)).services[0].uptimePercentage24h, null);

		stubFetch({ site: [ok] });
		await checkMonitor(db, site, undefined, { confirmFailureDelayMs: 0 });
		const service = (await getPublicStatusPageData(db)).services[0];

		assert.equal(service.uptimePercentage24h, 100);
		assert.equal(service.dailyUptime.length, 90);
	});
});
