/**
 * Monitor service managing monitors, check outcomes, uptime metrics, and incident lifecycles.
 */

import { and, eq, lte, gte, or, isNull, notNull } from "remix/data-table";
import type { AppDatabase } from "~/app/contracts/database";
import type { Transport } from "~/app/contracts/transport";
import type { CheckOutcome } from "~/app/services/checker";
import { sendIncidentAlert } from "~/app/services/alerting";
import {
	monitors,
	monitorResults,
	incidents,
	type SelectMonitor,
	type SelectMonitorResult,
	type SelectIncident,
	type HttpMethod,
} from "~/database/schema";
import { logger } from "~/bootstrap/logger";

export interface CreateMonitorInput {
	name: string;
	url: string;
	method?: HttpMethod;
	expectedStatus?: number;
	intervalSeconds?: number;
	timeoutSeconds?: number;
	degradedAfterMs?: number;
}

export interface MonitorDetailData {
	monitor: SelectMonitor;
	results: SelectMonitorResult[];
	incidents: SelectIncident[];
	uptimePercentage24h: number;
	averageLatencyMs: number;
}

/**
 * Lists all registered monitors.
 */
export async function listMonitors(db: AppDatabase): Promise<SelectMonitor[]> {
	const all = await db.findMany(monitors, {
		orderBy: [["created_at", "desc"]],
	});
	return all as SelectMonitor[];
}

/**
 * Gets a single monitor by its primary key.
 */
export async function getMonitorById(db: AppDatabase, id: string): Promise<SelectMonitor | null> {
	try {
		const row = await db.find(monitors, id);
		return (row as SelectMonitor) ?? null;
	} catch {
		return null;
	}
}

/**
 * Gets a monitor along with its recent check results and incidents.
 */
export async function getMonitorWithHistory(db: AppDatabase, id: string): Promise<MonitorDetailData | null> {
	const monitor = await getMonitorById(db, id);
	if (!monitor) return null;

	const results = (await db.findMany(monitorResults, {
		where: eq(monitorResults.monitor_id, id),
		orderBy: [["created_at", "desc"]],
		limit: 50,
	})) as SelectMonitorResult[];

	const monitorIncidents = (await db.findMany(incidents, {
		where: eq(incidents.monitor_id, id),
		orderBy: [["created_at", "desc"]],
		limit: 20,
	})) as SelectIncident[];

	// Calculate 24h uptime percentage
	const now = Date.now();
	const oneDayAgo = now - 24 * 60 * 60 * 1000;
	const recentResults = results.filter((r) => r.created_at >= oneDayAgo);

	let uptimePercentage24h = 100;
	if (recentResults.length > 0) {
		const upCount = recentResults.filter((r) => r.is_up).length;
		uptimePercentage24h = Math.round((upCount / recentResults.length) * 10000) / 100;
	}

	// Calculate average latency
	const validLatencies = results
		.map((r) => r.response_time_ms)
		.filter((ms): ms is number => typeof ms === "number" && ms >= 0);

	const averageLatencyMs =
		validLatencies.length > 0
			? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length)
			: 0;

	return {
		monitor,
		results,
		incidents: monitorIncidents,
		uptimePercentage24h,
		averageLatencyMs,
	};
}

/**
 * Creates a new uptime monitor.
 */
export async function createMonitor(db: AppDatabase, input: CreateMonitorInput): Promise<SelectMonitor> {
	const now = Date.now();
	const id = crypto.randomUUID();

	const newMonitor = (await db.create(
		monitors,
		{
			id,
			name: input.name.trim(),
			url: input.url.trim(),
			method: input.method ?? "HEAD",
			expected_status: input.expectedStatus ?? 200,
			interval_seconds: input.intervalSeconds ?? 60,
			timeout_seconds: input.timeoutSeconds ?? 10,
			degraded_after_ms: input.degradedAfterMs ?? 3000,
			is_enabled: true,
			last_status: null,
			last_checked_at: null,
			last_response_time_ms: null,
			next_due_at: now, // Check immediately
			created_at: now,
			updated_at: now,
		},
		{ returnRow: true },
	)) as SelectMonitor;

	return newMonitor;
}

/**
 * Deletes a monitor.
 */
export async function deleteMonitor(db: AppDatabase, id: string): Promise<void> {
	await db.delete(monitors, id);
}

/**
 * Toggles a monitor's enabled/disabled state.
 */
export async function toggleMonitor(db: AppDatabase, id: string): Promise<SelectMonitor> {
	const monitor = await db.find(monitors, id);
	if (!monitor) throw new Error(`Monitor ${id} not found`);

	const isEnabled = !(monitor as SelectMonitor).is_enabled;
	const now = Date.now();

	const updated = (await db.update(
		monitors,
		id,
		{
			is_enabled: isEnabled,
			next_due_at: isEnabled ? now : null,
			updated_at: now,
		},
	)) as SelectMonitor;

	return updated;
}

/**
 * Finds all active monitors that are due for a health check.
 */
export async function findDueMonitors(db: AppDatabase, now: number = Date.now()): Promise<SelectMonitor[]> {
	const due = (await db.findMany(monitors, {
		where: and(
			eq(monitors.is_enabled, true),
			or(
				isNull(monitors.next_due_at),
				lte(monitors.next_due_at, now),
			),
		),
		limit: 100,
	})) as SelectMonitor[];

	return due;
}

/**
 * Records the outcome of a health check, creates results and incident records,
 * and triggers alerts if state transitioned.
 */
export async function recordCheckOutcome(
	db: AppDatabase,
	monitor: SelectMonitor,
	outcome: CheckOutcome,
	transport?: Transport,
	fromEmail: string = "alerts@uptime.local",
	alertEmail?: string,
): Promise<{ monitor: SelectMonitor; incident?: SelectIncident }> {
	const now = Date.now();
	const previousStatus = monitor.last_status;
	const currentStatus = outcome.status;
	const isUp = currentStatus !== "down";

	// 1. Record the individual check result
	await db.create(monitorResults, {
		id: crypto.randomUUID(),
		monitor_id: monitor.id,
		response_status: outcome.statusCode,
		response_time_ms: outcome.responseTimeMs,
		is_up: isUp,
		error_message: outcome.errorMessage ?? null,
		created_at: now,
	});

	// 2. Handle Incident Lifecycle
	let createdIncident: SelectIncident | undefined;

	// Transition: UP/DEGRADED/NULL -> DOWN (Incident starts)
	if (previousStatus !== "down" && currentStatus === "down") {
		const incidentId = crypto.randomUUID();
		createdIncident = (await db.create(
			incidents,
			{
				id: incidentId,
				monitor_id: monitor.id,
				started_at: now,
				resolved_at: null,
				cause: outcome.errorMessage ?? "Check failed",
				error_details: `Status: ${outcome.statusCode ?? "None"}, Response time: ${outcome.responseTimeMs}ms`,
				created_at: now,
			},
			{ returnRow: true },
		)) as SelectIncident;

		// Dispatch alert
		if (transport && alertEmail) {
			await sendIncidentAlert(transport, alertEmail, fromEmail, {
				monitor,
				previousStatus,
				currentStatus,
				reason: outcome.errorMessage ?? "Health check failed",
				timestamp: now,
			});
		}
	}

	// Transition: DOWN -> UP (Incident resolved)
	if (previousStatus === "down" && currentStatus === "up") {
		// Find open incidents for this monitor and mark resolved
		const openIncidents = (await db.findMany(incidents, {
			where: and(
				eq(incidents.monitor_id, monitor.id),
				isNull(incidents.resolved_at),
			),
			limit: 10,
		})) as SelectIncident[];

		for (const openIncident of openIncidents) {
			await db.update(incidents, openIncident.id, {
				resolved_at: now,
			});
		}

		// Dispatch recovery alert
		if (transport && alertEmail) {
			await sendIncidentAlert(transport, alertEmail, fromEmail, {
				monitor,
				previousStatus,
				currentStatus,
				reason: `Service recovered with HTTP ${outcome.statusCode} in ${outcome.responseTimeMs}ms`,
				timestamp: now,
			});
		}
	}

	// 3. Advance next_due_at and update cached monitor state
	const nextDueAt = now + monitor.interval_seconds * 1000;
	const updatedMonitor = (await db.update(
		monitors,
		monitor.id,
		{
			last_status: currentStatus,
			last_checked_at: now,
			last_response_time_ms: outcome.responseTimeMs,
			next_due_at: nextDueAt,
			updated_at: now,
		},
	)) as SelectMonitor;

	const log = logger.open("job", {
		monitorId: monitor.id,
		url: monitor.url,
		status: currentStatus,
		responseTimeMs: outcome.responseTimeMs,
	});
	log.note(`Checked ${monitor.url}: ${currentStatus} (${outcome.responseTimeMs}ms)`);
	log.emit();

	return { monitor: updatedMonitor, incident: createdIncident };
}

export interface PublicServiceStatus {
	id: string;
	name: string;
	status: "up" | "down" | "degraded" | "paused" | "pending";
	uptimePercentage24h: number;
	lastResponseTimeMs: number | null;
	historySegments: Array<"up" | "down" | "degraded" | "pending">;
}

export interface PublicStatusData {
	systemStatus: "operational" | "degraded" | "outage";
	systemStatusTitle: string;
	systemStatusDescription: string;
	overallUptime24h: number;
	totalMonitors: number;
	services: PublicServiceStatus[];
	activeIncidents: SelectIncident[];
	pastIncidents: SelectIncident[];
	generatedAt: string;
}

export async function calculate24hUptime(db: AppDatabase, monitorId: string): Promise<number> {
	const now = Date.now();
	const oneDayAgo = now - 24 * 60 * 60 * 1000;
	const results = (await db.findMany(monitorResults, {
		where: and(
			eq(monitorResults.monitor_id, monitorId),
			gte(monitorResults.created_at, oneDayAgo),
		),
		limit: 200,
	})) as SelectMonitorResult[];

	if (results.length === 0) return 100;
	const upCount = results.filter((r) => r.is_up).length;
	return Math.round((upCount / results.length) * 10000) / 100;
}

/**
 * Compiles aggregated public status page data including service health, uptime bars, and incidents.
 */
export async function getPublicStatusPageData(db: AppDatabase): Promise<PublicStatusData> {
	const activeMonitors = (await db.findMany(monitors, {
		where: eq(monitors.is_enabled, true),
		orderBy: [["name", "asc"]],
	})) as SelectMonitor[];

	let totalUptimeSum = 0;
	const services: PublicServiceStatus[] = [];

	for (const mon of activeMonitors) {
		const uptime = await calculate24hUptime(db, mon.id);
		totalUptimeSum += uptime;

		// Fetch last 30 results for segmented uptime timeline
		const recentResults = (await db.findMany(monitorResults, {
			where: eq(monitorResults.monitor_id, mon.id),
			orderBy: [["created_at", "desc"]],
			limit: 30,
		})) as SelectMonitorResult[];

		const historySegments = recentResults
			.reverse()
			.map((r) => (r.is_up ? "up" : "down"));

		services.push({
			id: mon.id,
			name: mon.name,
			status: (mon.last_status as any) || "pending",
			uptimePercentage24h: uptime,
			lastResponseTimeMs: mon.last_response_time_ms,
			historySegments,
		});
	}

	const activeIncidents = (await db.findMany(incidents, {
		where: isNull(incidents.resolved_at),
		orderBy: [["started_at", "desc"]],
		limit: 10,
	})) as SelectIncident[];

	const pastIncidents = (await db.findMany(incidents, {
		where: notNull(incidents.resolved_at),
		orderBy: [["started_at", "desc"]],
		limit: 10,
	})) as SelectIncident[];

	const hasDown = services.some((s) => s.status === "down") || activeIncidents.length > 0;
	const hasDegraded = services.some((s) => s.status === "degraded");

	let systemStatus: "operational" | "degraded" | "outage" = "operational";
	let systemStatusTitle = "All Systems Operational";
	let systemStatusDescription =
		"All systems and endpoints are reporting healthy performance and nominal latencies.";

	if (hasDown) {
		const downCount = services.filter((s) => s.status === "down").length;
		if (downCount > 1 || (services.length > 0 && downCount === services.length)) {
			systemStatus = "outage";
			systemStatusTitle = "Major System Outage";
			systemStatusDescription =
				"Multiple services are currently unavailable. Our team is actively investigating.";
		} else {
			systemStatus = "outage";
			systemStatusTitle = "Partial System Outage";
			systemStatusDescription =
				"One or more services are experiencing disruptions. Core systems remain functional.";
		}
	} else if (hasDegraded) {
		systemStatus = "degraded";
		systemStatusTitle = "Degraded Performance";
		systemStatusDescription =
			"Systems are currently experiencing higher than normal response times.";
	}

	const overallUptime24h =
		services.length > 0 ? Math.round((totalUptimeSum / services.length) * 10) / 10 : 100;

	return {
		systemStatus,
		systemStatusTitle,
		systemStatusDescription,
		overallUptime24h,
		totalMonitors: services.length,
		services,
		activeIncidents,
		pastIncidents,
		generatedAt: new Date().toUTCString(),
	};
}

