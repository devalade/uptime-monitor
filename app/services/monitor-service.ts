/**
 * Monitor service managing monitors, check outcomes, uptime metrics, and incident lifecycles.
 */

import { and, eq, lt, lte, gte, or, isNull, notNull } from "remix/data-table";
import type { AppDatabase } from "~/app/contracts/database";
import { executeHttpCheck, type CheckOutcome } from "~/app/services/checker";
import { sendIncidentAlert, type AlertSettings } from "~/app/services/alerting";
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Cron ticks land a few seconds apart; without slack a 60s monitor would only run every other tick. */
const SCHEDULE_GRACE_MS = 15_000;

/** Raw check rows older than this are pruned by the sweep. */
const RESULT_RETENTION_MS = 30 * DAY_MS;

/** Wait before re-checking a failure, so a one-off network blip does not page anyone. */
const CONFIRM_FAILURE_DELAY_MS = 2000;

export interface CreateMonitorInput {
	name: string;
	url: string;
	method?: HttpMethod;
	expectedStatus?: number;
	intervalSeconds?: number;
	timeoutSeconds?: number;
	degradedAfterMs?: number;
	isPublic?: boolean;
}

export type CheckSegmentStatus = "up" | "down" | "degraded";

export interface CheckSegment {
	status: CheckSegmentStatus;
	checkedAt: number;
	responseTimeMs: number | null;
	statusCode: number | null;
}

export interface MonitorDetailData {
	monitor: SelectMonitor;
	results: SelectMonitorResult[];
	incidents: SelectIncident[];
	uptimePercentage24h: number | null;
	averageLatencyMs: number;
}

export interface DashboardMonitor {
	monitor: SelectMonitor;
	uptimePercentage24h: number | null;
	recentChecks: CheckSegment[];
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
 * Lists monitors with their 24h uptime and latest checks for the dashboard timeline.
 */
export async function getDashboardData(db: AppDatabase, timelineLength: number): Promise<DashboardMonitor[]> {
	const all = await listMonitors(db);
	return Promise.all(
		all.map(async (monitor) => ({
			monitor,
			uptimePercentage24h: await calculate24hUptime(db, monitor.id),
			recentChecks: await listRecentChecks(db, monitor.id, timelineLength),
		})),
	);
}

/**
 * Gets a single monitor by its primary key.
 */
export async function getMonitorById(db: AppDatabase, id: string): Promise<SelectMonitor | null> {
	const row = await db.find(monitors, id);
	return (row as SelectMonitor | null) ?? null;
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
		uptimePercentage24h: await calculate24hUptime(db, id),
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
			method: input.method ?? "GET",
			expected_status: input.expectedStatus ?? 200,
			interval_seconds: input.intervalSeconds ?? 60,
			timeout_seconds: input.timeoutSeconds ?? 10,
			degraded_after_ms: input.degradedAfterMs ?? 3000,
			is_enabled: true,
			is_public: input.isPublic ?? true,
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
 * Toggles a monitor's enabled/disabled state. Returns null when the monitor does not exist.
 */
export async function toggleMonitor(db: AppDatabase, id: string): Promise<SelectMonitor | null> {
	const monitor = await getMonitorById(db, id);
	if (!monitor) return null;

	const isEnabled = !monitor.is_enabled;
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
 * Shows or hides a monitor on the public status page. Returns null when the monitor does not exist.
 */
export async function toggleMonitorVisibility(db: AppDatabase, id: string): Promise<SelectMonitor | null> {
	const monitor = await getMonitorById(db, id);
	if (!monitor) return null;

	return (await db.update(monitors, id, {
		is_public: !monitor.is_public,
		updated_at: Date.now(),
	})) as SelectMonitor;
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
				lte(monitors.next_due_at, now + SCHEDULE_GRACE_MS),
			),
		),
		orderBy: [["next_due_at", "asc"]],
		limit: 100,
	})) as SelectMonitor[];

	return due;
}

/**
 * Probes a monitor and records the outcome. Every check path (cron, button, MCP) goes through here
 * so incidents and alerts behave the same regardless of who triggered the check.
 */
export async function checkMonitor(
	db: AppDatabase,
	monitor: SelectMonitor,
	alerts?: AlertSettings,
	options: { confirmFailureDelayMs?: number } = {},
): Promise<{ monitor: SelectMonitor; outcome: CheckOutcome; incident?: SelectIncident }> {
	const probe = () =>
		executeHttpCheck({
			url: monitor.url,
			method: monitor.method,
			expectedStatus: monitor.expected_status,
			timeoutSeconds: monitor.timeout_seconds,
			degradedAfterMs: monitor.degraded_after_ms,
		});

	let outcome = await probe();

	// Confirm a new failure before it opens an incident. During an outage that is
	// already confirmed, every check counts as-is.
	if (outcome.status === "down" && monitor.last_status !== "down") {
		await new Promise((resolve) => setTimeout(resolve, options.confirmFailureDelayMs ?? CONFIRM_FAILURE_DELAY_MS));
		outcome = await probe();
	}

	const recorded = await recordCheckOutcome(db, monitor, outcome, alerts);
	return { ...recorded, outcome };
}

/**
 * Checks every due monitor and prunes old check rows once an hour.
 */
export async function runSweep(
	db: AppDatabase,
	alerts?: AlertSettings,
	now: number = Date.now(),
): Promise<{ swept: number; failed: number }> {
	const due = await findDueMonitors(db, now);
	const log = logger.open("cron", { count: due.length });
	log.note(`Sweeping ${due.length} due monitors`);
	log.emit();

	const results = await Promise.allSettled(due.map((monitor) => checkMonitor(db, monitor, alerts)));

	results.forEach((result, index) => {
		if (result.status === "fulfilled") return;
		const errLog = logger.open("job", {
			monitorId: due[index].id,
			error: result.reason instanceof Error ? result.reason.message : String(result.reason),
		});
		errLog.note(`Failed to check monitor ${due[index].name}`);
		errLog.emit();
	});

	if (new Date(now).getUTCMinutes() === 0) {
		await db.deleteMany(monitorResults, { where: lt(monitorResults.created_at, now - RESULT_RETENTION_MS) });
	}

	return {
		swept: due.length,
		failed: results.filter((r) => r.status === "rejected").length,
	};
}

/**
 * Records the outcome of a health check, creates results and incident records,
 * and triggers alerts if state transitioned.
 */
export async function recordCheckOutcome(
	db: AppDatabase,
	monitor: SelectMonitor,
	outcome: CheckOutcome,
	alerts?: AlertSettings,
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
		createdIncident = (await db.create(
			incidents,
			{
				id: crypto.randomUUID(),
				monitor_id: monitor.id,
				started_at: now,
				resolved_at: null,
				cause: outcome.errorMessage ?? "Check failed",
				error_details: `Status: ${outcome.statusCode ?? "None"}, Response time: ${outcome.responseTimeMs}ms`,
				created_at: now,
			},
			{ returnRow: true },
		)) as SelectIncident;

		if (alerts) {
			await sendIncidentAlert(alerts, {
				monitor,
				previousStatus,
				currentStatus,
				reason: outcome.errorMessage ?? "Health check failed",
				timestamp: now,
			});
		}
	}

	// Any reachable response (up or slow) ends the outage. Resolving by query rather than by
	// previous status also closes incidents left open by earlier versions.
	if (currentStatus !== "down") {
		const resolved = await db.updateMany(
			incidents,
			{ resolved_at: now },
			{ where: and(eq(incidents.monitor_id, monitor.id), isNull(incidents.resolved_at)) },
		);

		if (resolved.affectedRows > 0 && alerts) {
			await sendIncidentAlert(alerts, {
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
	status: "up" | "down" | "degraded" | "pending";
	uptimePercentage24h: number | null;
	lastResponseTimeMs: number | null;
	recentChecks: CheckSegment[];
}

/** Incidents as the public sees them: which service and when, never the raw failure details. */
export interface PublicIncident {
	id: string;
	monitorName: string;
	startedAt: number;
	resolvedAt: number | null;
}

export interface PublicStatusData {
	systemStatus: "operational" | "degraded" | "outage";
	systemStatusTitle: string;
	systemStatusDescription: string;
	overallUptime24h: number | null;
	totalMonitors: number;
	services: PublicServiceStatus[];
	activeIncidents: PublicIncident[];
	pastIncidents: PublicIncident[];
	generatedAt: number;
}

/**
 * Share of successful checks in the last 24h, or null when there were no checks.
 * Degraded (slow but reachable) checks count as up.
 */
export async function calculate24hUptime(db: AppDatabase, monitorId: string): Promise<number | null> {
	const since = Date.now() - DAY_MS;
	const inWindow = and(eq(monitorResults.monitor_id, monitorId), gte(monitorResults.created_at, since));

	const total = await db.count(monitorResults, { where: inWindow });
	if (total === 0) return null;

	const upCount = await db.count(monitorResults, { where: and(inWindow, eq(monitorResults.is_up, true)) });
	return Math.round((upCount / total) * 10000) / 100;
}

/**
 * Latest checks for a monitor, oldest first, for timeline bars.
 */
export async function listRecentChecks(db: AppDatabase, monitorId: string, limit: number): Promise<CheckSegment[]> {
	const rows = (await db.findMany(monitorResults, {
		where: eq(monitorResults.monitor_id, monitorId),
		orderBy: [["created_at", "desc"]],
		limit,
	})) as SelectMonitorResult[];

	return rows.reverse().map((r) => ({
		// Slow checks are stored as up with an explanatory message.
		status: !r.is_up ? "down" : r.error_message ? "degraded" : "up",
		checkedAt: r.created_at,
		responseTimeMs: r.response_time_ms,
		statusCode: r.response_status,
	}));
}

/**
 * Compiles aggregated public status page data including service health, uptime bars, and incidents.
 */
export async function getPublicStatusPageData(db: AppDatabase, timelineLength: number): Promise<PublicStatusData> {
	const activeMonitors = (await db.findMany(monitors, {
		where: and(eq(monitors.is_enabled, true), eq(monitors.is_public, true)),
		orderBy: [["name", "asc"]],
	})) as SelectMonitor[];

	const services: PublicServiceStatus[] = await Promise.all(
		activeMonitors.map(async (mon) => ({
			id: mon.id,
			name: mon.name,
			status: mon.last_status ?? "pending",
			uptimePercentage24h: await calculate24hUptime(db, mon.id),
			lastResponseTimeMs: mon.last_response_time_ms,
			recentChecks: await listRecentChecks(db, mon.id, timelineLength),
		})),
	);

	const monitorNames = new Map(activeMonitors.map((m) => [m.id, m.name]));
	const withMonitorName = (rows: SelectIncident[]): PublicIncident[] =>
		rows
			.filter((inc) => monitorNames.has(inc.monitor_id))
			.map((inc) => ({
				id: inc.id,
				monitorName: monitorNames.get(inc.monitor_id)!,
				startedAt: inc.started_at,
				resolvedAt: inc.resolved_at,
			}));

	const activeIncidents = withMonitorName(
		(await db.findMany(incidents, {
			where: isNull(incidents.resolved_at),
			orderBy: [["started_at", "desc"]],
			limit: 10,
		})) as SelectIncident[],
	);

	const pastIncidents = withMonitorName(
		(await db.findMany(incidents, {
			where: and(notNull(incidents.resolved_at), gte(incidents.started_at, Date.now() - 7 * DAY_MS)),
			orderBy: [["started_at", "desc"]],
			limit: 10,
		})) as SelectIncident[],
	);

	const downCount = services.filter((s) => s.status === "down").length;
	const hasDegraded = services.some((s) => s.status === "degraded");

	let systemStatus: "operational" | "degraded" | "outage" = "operational";
	let systemStatusTitle = "All Systems Operational";
	let systemStatusDescription = "All monitored services are responding normally.";

	if (downCount > 0) {
		systemStatus = "outage";
		if (downCount > 1 || downCount === services.length) {
			systemStatusTitle = "Major System Outage";
			systemStatusDescription = "Multiple services are currently unavailable.";
		} else {
			systemStatusTitle = "Partial System Outage";
			systemStatusDescription = "One service is currently unavailable. Other services are unaffected.";
		}
	} else if (hasDegraded) {
		systemStatus = "degraded";
		systemStatusTitle = "Degraded Performance";
		systemStatusDescription = "Some services are responding slower than usual.";
	}

	const measured = services.map((s) => s.uptimePercentage24h).filter((u): u is number => u !== null);
	const overallUptime24h =
		measured.length > 0 ? Math.round((measured.reduce((a, b) => a + b, 0) / measured.length) * 100) / 100 : null;

	return {
		systemStatus,
		systemStatusTitle,
		systemStatusDescription,
		overallUptime24h,
		totalMonitors: services.length,
		services,
		activeIncidents,
		pastIncidents,
		generatedAt: Date.now(),
	};
}
