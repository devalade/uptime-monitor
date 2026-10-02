/**
 * Database schema for the uptime app defined with remix/data-table.
 * Declares the tables backing the uptime monitoring product: monitors, check results, and incidents.
 */

import type { AnyTable, TableRow } from "remix/data-table";
import { column as c, table } from "remix/data-table";

type InsertRow<sourceTable extends AnyTable> = Partial<TableRow<sourceTable>>;

export const monitorStatuses = ["up", "down", "degraded"] as const;
export type MonitorStatus = (typeof monitorStatuses)[number];

export const httpMethods = ["HEAD", "GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof httpMethods)[number];

export const monitors = table({
	name: "monitors",
	timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
	columns: {
		id: c.text().primaryKey(),
		created_at: c.integer(),
		updated_at: c.integer(),
		name: c.text(),
		url: c.text(),
		method: c.enum(httpMethods).default("HEAD"),
		expected_status: c.integer().default(200),
		interval_seconds: c.integer().default(60),
		timeout_seconds: c.integer().default(10),
		degraded_after_ms: c.integer().default(3000),
		is_enabled: c.boolean().default(true),
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
	},
});

export type SelectIncident = TableRow<typeof incidents>;
export type InsertIncident = InsertRow<typeof incidents>;
