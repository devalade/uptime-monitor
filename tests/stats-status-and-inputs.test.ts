import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getPublicStatusPageData, recordCheckOutcome } from "~/app/services/monitor-service";
import { getDailyUptime, getUptimeReport, refreshDailyStats, startOfUtcDay, utcDay, DAY_MS } from "~/app/services/uptime-stats";
import { createMaintenanceWindow, parseMaintenanceInput } from "~/app/services/maintenance";
import { addStatusPostUpdate, createStatusPost, parseStatusPostInput } from "~/app/services/status-posts";
import { parseAlertChannelInput } from "~/app/services/alert-channels";
import { parseMonitorInput } from "~/app/services/monitor-input";
import type { CheckOutcome } from "~/app/services/checker";
import { addMonitor, createTestDatabase } from "./helpers";

const up: CheckOutcome = { status: "up", statusCode: 200, responseTimeMs: 100 };
const down: CheckOutcome = { status: "down", statusCode: 500, responseTimeMs: 300, errorMessage: "boom" };

describe("daily uptime rollups", () => {
	test("roll up raw checks per UTC day and report 7/30/90-day uptime", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		// Midday, so checks a second apart never straddle midnight.
		const now = startOfUtcDay(Date.now()) + DAY_MS / 2;
		const twoDaysAgo = now - 2 * DAY_MS;

		let current = monitor;
		for (const [outcome, at] of [
			[up, twoDaysAgo],
			[down, twoDaysAgo + 1000],
			[up, now - 1000],
			[up, now],
		] as const) {
			current = (await recordCheckOutcome(db, current, outcome, undefined, at)).monitor;
		}

		await refreshDailyStats(db, twoDaysAgo, now);
		await refreshDailyStats(db, twoDaysAgo, now); // idempotent

		const report = await getUptimeReport(db, monitor.id, now);
		assert.deepEqual(report, { 7: 75, 30: 75, 90: 75 });

		const days = (await getDailyUptime(db, [monitor.id], 3, now)).get(monitor.id);
		assert.ok(days);
		assert.deepEqual(
			days.map((d) => [d.day, d.uptimePercentage, d.totalChecks]),
			[
				[utcDay(twoDaysAgo), 50, 2],
				[utcDay(now - DAY_MS), null, 0],
				[utcDay(now), 100, 2],
			],
		);
		assert.equal(days[0].avgResponseMs, 200);
	});

	test("no checks means no uptime rather than 100%", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db);
		assert.deepEqual(await getUptimeReport(db, monitor.id), { 7: null, 30: null, 90: null });
	});
});

describe("public status page extras", () => {
	test("a service in maintenance shows as maintenance and the window is listed", async () => {
		const db = await createTestDatabase();
		const site = await addMonitor(db, { name: "Website" });
		await createMaintenanceWindow(db, { title: "Upgrade", startsAt: Date.now() - 60_000, endsAt: Date.now() + 600_000, monitorIds: [site.id] });

		const data = await getPublicStatusPageData(db);

		assert.equal(data.services[0].status, "maintenance");
		assert.equal(data.systemStatus, "maintenance");
		assert.equal(data.maintenance.length, 1);
		assert.deepEqual(data.maintenance[0].serviceNames, ["Website"]);
		assert.ok(data.maintenance[0].isActive);
	});

	test("maintenance of private monitors stays off the public page", async () => {
		const db = await createTestDatabase();
		const internal = await addMonitor(db, { name: "Internal", isPublic: false });
		await createMaintenanceWindow(db, { title: "Secret work", startsAt: Date.now(), endsAt: Date.now() + 600_000, monitorIds: [internal.id] });

		assert.equal((await getPublicStatusPageData(db)).maintenance.length, 0);
	});

	test("an open major incident post marks an outage; resolving it moves it to history", async () => {
		const db = await createTestDatabase();
		await addMonitor(db, { name: "Website" });
		const post = await createStatusPost(db, { title: "Payments failing", impact: "major", status: "investigating", message: "Looking into it" });

		let data = await getPublicStatusPageData(db);
		assert.equal(data.systemStatus, "outage");
		assert.equal(data.activePosts[0].title, "Payments failing");

		await addStatusPostUpdate(db, post.id, { status: "resolved", message: "Fixed" });
		data = await getPublicStatusPageData(db);
		assert.equal(data.systemStatus, "operational");
		assert.equal(data.activePosts.length, 0);
		assert.deepEqual(
			data.pastPosts[0].updates.map((u) => u.status),
			["resolved", "investigating"],
		);
	});
});

describe("monitor input for new monitor types", () => {
	test("TCP needs host:port", () => {
		const good = parseMonitorInput({ type: "tcp", tcp_target: "db.example.com:5432" });
		assert.ok(good.ok);
		assert.equal(good.value.url, "db.example.com:5432");
		assert.equal(good.value.name, "db.example.com:5432");

		for (const target of ["db.example.com", "db:99999", "http://db:5432", ""]) {
			const bad = parseMonitorInput({ type: "tcp", tcp_target: target });
			assert.ok(!bad.ok, target);
			assert.ok(bad.errors.tcp_target);
		}
	});

	test("heartbeats need no URL and accept long periods", () => {
		const result = parseMonitorInput({ type: "heartbeat", name: "Backups", interval_seconds: "604800", grace_seconds: "3600" });
		assert.ok(result.ok);
		assert.equal(result.value.url, "");
		assert.equal(result.value.intervalSeconds, 604800);
		assert.equal(result.value.graceSeconds, 3600);
	});

	test("assertion settings are validated", () => {
		const result = parseMonitorInput({
			url: "https://api.example.com",
			method: "HEAD",
			expected_statuses: "2xx, 700",
			request_headers: "not a header",
			keyword: "ok",
			json_path: "$..x",
		});
		assert.ok(!result.ok);
		assert.deepEqual(Object.keys(result.errors).sort(), ["expected_statuses", "json_path", "method", "request_headers"]);
	});

	test("GET requests cannot send a body", () => {
		const result = parseMonitorInput({ url: "https://api.example.com", request_body: "{}" });
		assert.ok(!result.ok);
		assert.match(result.errors.request_body ?? "", /GET requests cannot send a body/);
	});

	test("alert channel selection", () => {
		const all = parseMonitorInput({ url: "https://a.example.com", alert_mode: "all", alert_channels: "x" });
		const some = parseMonitorInput({ url: "https://a.example.com", alert_mode: "selected", alert_channels: "x,y" });
		assert.ok(all.ok && some.ok);
		assert.equal(all.value.alertChannelIds, null);
		assert.deepEqual(some.value.alertChannelIds, ["x", "y"]);
	});
});

describe("other forms", () => {
	test("maintenance times are read in the browser's time zone", () => {
		const now = Date.UTC(2026, 9, 3, 12, 0);
		// UTC+1 reports an offset of -60 minutes.
		const result = parseMaintenanceInput({ title: "Upgrade", starts_at: "2026-10-04T10:00", ends_at: "2026-10-04T11:30", tz_offset: "-60" }, now);
		assert.ok(result.ok);
		assert.equal(result.value.startsAt, Date.UTC(2026, 9, 4, 9, 0));
		assert.equal(result.value.endsAt, Date.UTC(2026, 9, 4, 10, 30));
		assert.equal(result.value.monitorIds, null);
	});

	test("maintenance must end after it starts and in the future", () => {
		const now = Date.UTC(2026, 9, 3, 12, 0);
		const backwards = parseMaintenanceInput({ title: "x", starts_at: "2026-10-04T10:00", ends_at: "2026-10-04T09:00" }, now);
		const past = parseMaintenanceInput({ title: "x", starts_at: "2026-10-01T10:00", ends_at: "2026-10-01T11:00" }, now);
		const noMonitors = parseMaintenanceInput({ title: "x", starts_at: "2026-10-04T10:00", ends_at: "2026-10-04T11:00", scope: "selected" }, now);
		assert.ok(!backwards.ok && backwards.errors.ends_at);
		assert.ok(!past.ok && past.errors.ends_at);
		assert.ok(!noMonitors.ok && noMonitors.errors.monitor_ids);
	});

	test("status posts need a title and a message", () => {
		const result = parseStatusPostInput({ impact: "major", status: "investigating" });
		assert.ok(!result.ok);
		assert.deepEqual(Object.keys(result.errors).sort(), ["message", "title"]);
	});

	test("alert channels are validated per type", () => {
		assert.ok(parseAlertChannelInput({ type: "webhook", url: "https://discord.com/api/webhooks/1/x" }).ok);
		const http = parseAlertChannelInput({ type: "webhook", url: "http://insecure.example.com" });
		assert.ok(!http.ok && http.errors.url);
		const telegram = parseAlertChannelInput({ type: "telegram", bot_token: "nope", chat_id: "abc" });
		assert.ok(!telegram.ok);
		assert.deepEqual(Object.keys(telegram.errors).sort(), ["bot_token", "chat_id"]);
		const pagerduty = parseAlertChannelInput({ type: "pagerduty", routing_key: "b".repeat(32) });
		assert.ok(pagerduty.ok);
		assert.deepEqual(pagerduty.value.config, { routingKey: "b".repeat(32) });
	});
});
