/**
 * Database schema for the uptime app defined with remix/data-table.
 * Declares the tables backing the uptime monitoring product: monitors, check results, incidents,
 * daily rollups, maintenance windows, status page posts and alert channels.
 */

import type { AnyTable, TableRow } from "remix/data-table";
import { column as c, table } from "remix/data-table";

type InsertRow<sourceTable extends AnyTable> = Partial<TableRow<sourceTable>>;

export const monitorStatuses = ["up", "down", "degraded"] as const;
export type MonitorStatus = (typeof monitorStatuses)[number];

export const httpMethods = ["HEAD", "GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof httpMethods)[number];

/** http probes a URL, tcp opens a socket to host:port, heartbeat waits for the job to ping us. */
export const monitorTypes = ["http", "tcp", "heartbeat"] as const;
export type MonitorType = (typeof monitorTypes)[number];

export const keywordModes = ["contains", "not_contains"] as const;
export type KeywordMode = (typeof keywordModes)[number];

export const monitors = table({
	name: "monitors",
	timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
	columns: {
		id: c.text().primaryKey(),
		created_at: c.integer(),
		updated_at: c.integer(),
		name: c.text(),
		type: c.enum(monitorTypes).default("http"),
		/** The URL for http monitors, "host:port" for tcp, empty for heartbeats. */
		url: c.text(),
		method: c.enum(httpMethods).default("HEAD"),
		/** Accepted status codes, e.g. "200", "2xx" or "200-299, 301". */
		expected_statuses: c.text().default("200"),
		/** One "Name: value" header per line. */
		request_headers: c.text().nullable(),
		request_body: c.text().nullable(),
		keyword: c.text().nullable(),
		keyword_mode: c.enum(keywordModes).default("contains"),
		/** Path into a JSON response, e.g. "$.status"; json_expected empty means "must exist". */
		json_path: c.text().nullable(),
		json_expected: c.text().nullable(),
		heartbeat_token: c.text().nullable(),
		/** Heartbeats: how late a ping may be before the monitor goes down. */
		grace_seconds: c.integer().default(300),
		last_ping_at: c.integer().nullable(),
		/** Failed checks in a row before the monitor goes down. */
		failure_threshold: c.integer().default(1),
		consecutive_failures: c.integer().default(0),
		/** Repeat the DOWN alert every N minutes while down; 0 is off. */
		reminder_minutes: c.integer().default(0),
		/** JSON array of alert channel ids; null sends to every channel. */
		alert_channel_ids: c.text().nullable(),
		interval_seconds: c.integer().default(60),
		timeout_seconds: c.integer().default(10),
		degraded_after_ms: c.integer().default(3000),
		is_enabled: c.boolean().default(true),
		/** Shown on the public status page. */
		is_public: c.boolean().default(true),
		last_status: c.enum(monitorStatuses).nullable(),
		last_checked_at: c.integer().nullable(),
		last_response_time_ms: c.integer().nullable(),
		next_due_at: c.integer().nullable(),
	},
});

export type SelectMonitor = TableRow<typeof monitors>;
export type InsertMonitor = InsertRow<typeof monitors>;

export const monitorResults = table({
	name: "monitor_results",
	timestamps: { createdAt: "created_at" },
	columns: {
		id: c.text().primaryKey(),
		created_at: c.integer(),
		monitor_id: c.text(),
		response_status: c.integer().nullable(),
		response_time_ms: c.integer().nullable(),
		is_up: c.boolean(),
		error_message: c.text().nullable(),
		/** Made during a maintenance window, so left out of uptime. */
		is_maintenance: c.boolean().default(false),
	},
});

export type SelectMonitorResult = TableRow<typeof monitorResults>;
export type InsertMonitorResult = InsertRow<typeof monitorResults>;

export const incidents = table({
	name: "incidents",
	timestamps: { createdAt: "created_at" },
	columns: {
		id: c.text().primaryKey(),
		created_at: c.integer(),
		monitor_id: c.text(),
		started_at: c.integer(),
		resolved_at: c.integer().nullable(),
		cause: c.text(),
		error_details: c.text().nullable(),
		/** When the last DOWN alert or reminder went out. */
		last_alerted_at: c.integer().nullable(),
	},
});

export type SelectIncident = TableRow<typeof incidents>;
export type InsertIncident = InsertRow<typeof incidents>;

export const monitorDailyStats = table({
	name: "monitor_daily_stats",
	columns: {
		/** "<monitor_id>:<day>" */
		id: c.text().primaryKey(),
		monitor_id: c.text(),
		/** UTC date, YYYY-MM-DD. */
		day: c.text(),
		total_checks: c.integer(),
		up_checks: c.integer(),
		avg_response_ms: c.integer().nullable(),
		updated_at: c.integer(),
	},
});

export type SelectMonitorDailyStats = TableRow<typeof monitorDailyStats>;

export const maintenanceWindows = table({
	name: "maintenance_windows",
	timestamps: { createdAt: "created_at" },
	columns: {
		id: c.text().primaryKey(),
		created_at: c.integer(),
		title: c.text(),
		starts_at: c.integer(),
		ends_at: c.integer(),
		/** JSON array of monitor ids; null covers every monitor. */
		monitor_ids: c.text().nullable(),
	},
});

export type SelectMaintenanceWindow = TableRow<typeof maintenanceWindows>;

export const statusPostImpacts = ["none", "minor", "major"] as const;
export type StatusPostImpact = (typeof statusPostImpacts)[number];

export const statusPostStatuses = ["investigating", "identified", "monitoring", "resolved"] as const;
export type StatusPostStatus = (typeof statusPostStatuses)[number];

/** Announcements written by a person for the public status page. */
export const statusPosts = table({
	name: "status_posts",
	timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
	columns: {
		id: c.text().primaryKey(),
		created_at: c.integer(),
		updated_at: c.integer(),
		title: c.text(),
		impact: c.enum(statusPostImpacts),
		status: c.enum(statusPostStatuses),
		resolved_at: c.integer().nullable(),
	},
});

export type SelectStatusPost = TableRow<typeof statusPosts>;

export const statusPostUpdates = table({
	name: "status_post_updates",
	timestamps: { createdAt: "created_at" },
	columns: {
		id: c.text().primaryKey(),
		created_at: c.integer(),
		post_id: c.text(),
		status: c.enum(statusPostStatuses),
		message: c.text(),
	},
});

export type SelectStatusPostUpdate = TableRow<typeof statusPostUpdates>;

export const alertChannelTypes = ["webhook", "telegram", "pagerduty"] as const;
export type AlertChannelType = (typeof alertChannelTypes)[number];

export const alertChannels = table({
	name: "alert_channels",
	timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
	columns: {
		id: c.text().primaryKey(),
		created_at: c.integer(),
		updated_at: c.integer(),
		name: c.text(),
		type: c.enum(alertChannelTypes),
		/** JSON; the shape depends on type. */
		config: c.text(),
		is_enabled: c.boolean().default(true),
	},
});

export type SelectAlertChannel = TableRow<typeof alertChannels>;
