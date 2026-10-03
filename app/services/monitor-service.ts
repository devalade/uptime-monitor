/**
 * Monitor service managing monitors, check outcomes, uptime metrics, and incident lifecycles.
 */

import { and, eq, lt, lte, gte, or, isNull, notNull } from "remix/data-table";
import type { AppDatabase } from "~/app/contracts/database";
import { parseHeaderLines, runProbe, type CheckOutcome, type ProbeRequest } from "~/app/services/checker";
import { notifyMonitor, type AlertSettings, type IncidentAlertPayload } from "~/app/services/alerting";
import { isUnderMaintenance, listActiveMaintenance, listCurrentAndUpcomingMaintenance, windowCoversMonitor } from "~/app/services/maintenance";
import { regionLabel, type RegionalProbes } from "~/app/services/regional-probes";
import { listPublicStatusPosts, type PublicStatusPost } from "~/app/services/status-posts";
import { DAY_MS, getDailyUptime, overallUptime, refreshDailyStats, startOfUtcDay, type DailyUptime } from "~/app/services/uptime-stats";
import {
	monitors,
	monitorResults,
	incidents,
	type SelectMonitor,
	type SelectMonitorResult,
	type SelectIncident,
	type HttpMethod,
	type KeywordMode,
	type MonitorStatus,
	type MonitorType,
} from "~/database/schema";
import { logger } from "~/bootstrap/logger";

/** Cron ticks land a few seconds apart; without slack a 60s monitor would only run every other tick. */
const SCHEDULE_GRACE_MS = 15_000;

/** Raw check rows older than this are pruned by the sweep. */
const RESULT_RETENTION_MS = 30 * DAY_MS;

/** Wait before re-checking a failure locally, so a one-off network blip does not page anyone. */
const CONFIRM_FAILURE_DELAY_MS = 2000;

/** Every setting a person can choose for a monitor. */
export interface MonitorSettings {
	type: MonitorType;
	name: string;
	/** URL for http, "host:port" for tcp, empty for heartbeat. */
	url: string;
	method: HttpMethod;
	expectedStatuses: string;
	requestHeaders: string | null;
	requestBody: string | null;
	keyword: string | null;
	keywordMode: KeywordMode;
	jsonPath: string | null;
	jsonExpected: string | null;
	intervalSeconds: number;
	timeoutSeconds: number;
	degradedAfterMs: number;
	graceSeconds: number;
	failureThreshold: number;
	reminderMinutes: number;
	/** null alerts every channel. */
	alertChannelIds: string[] | null;
	isPublic: boolean;
}

export type CreateMonitorInput = Partial<MonitorSettings> & { name: string };

export const defaultMonitorSettings: Omit<MonitorSettings, "name" | "url"> = {
	type: "http",
	method: "GET",
	expectedStatuses: "200",
	requestHeaders: null,
	requestBody: null,
	keyword: null,
	keywordMode: "contains",
	jsonPath: null,
	jsonExpected: null,
	intervalSeconds: 60,
	timeoutSeconds: 10,
	degradedAfterMs: 3000,
	graceSeconds: 300,
	failureThreshold: 1,
	reminderMinutes: 0,
	alertChannelIds: null,
	isPublic: true,
};

export interface CheckOptions {
	confirmFailureDelayMs?: number;
	/** Re-check failures from other regions; without it a failure is re-checked from here. */
	probes?: RegionalProbes;
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
	inMaintenance: boolean;
}

export interface DashboardMonitor {
	monitor: SelectMonitor;
	uptimePercentage24h: number | null;
	recentChecks: CheckSegment[];
	inMaintenance: boolean;
}

/**
 * Lists all registered monitors.
 */
export async function listMonitors(db: AppDatabase): Promise<SelectMonitor[]> {
	return db.findMany(monitors, {
		orderBy: [["created_at", "desc"]],
	});
}

/**
 * Lists monitors with their 24h uptime and latest checks for the dashboard timeline.
 */
export async function getDashboardData(db: AppDatabase, timelineLength: number): Promise<DashboardMonitor[]> {
	const [all, maintenance] = await Promise.all([listMonitors(db), listActiveMaintenance(db)]);
	return Promise.all(
		all.map(async (monitor) => ({
			monitor,
			uptimePercentage24h: await calculate24hUptime(db, monitor.id),
			recentChecks: await listRecentChecks(db, monitor.id, timelineLength),
			inMaintenance: isUnderMaintenance(maintenance, monitor.id),
		})),
	);
}

/**
 * Gets a single monitor by its primary key.
 */
export async function getMonitorById(db: AppDatabase, id: string): Promise<SelectMonitor | null> {
	return db.find(monitors, id);
}

/**
 * Gets a monitor along with its recent check results and incidents.
 */
export async function getMonitorWithHistory(db: AppDatabase, id: string): Promise<MonitorDetailData | null> {
	const monitor = await getMonitorById(db, id);
	if (!monitor) return null;

	const results = await db.findMany(monitorResults, {
		where: eq(monitorResults.monitor_id, id),
		orderBy: [["created_at", "desc"]],
		limit: 50,
	});

	const monitorIncidents = await db.findMany(incidents, {
		where: eq(incidents.monitor_id, id),
		orderBy: [["created_at", "desc"]],
		limit: 20,
	});

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
		inMaintenance: isUnderMaintenance(await listActiveMaintenance(db), id),
	};
}

/**
 * Creates a new uptime monitor.
 */
export async function createMonitor(db: AppDatabase, input: CreateMonitorInput): Promise<SelectMonitor> {
	const now = Date.now();
	const given = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
	const settings: MonitorSettings = { ...defaultMonitorSettings, url: "", ...given, name: input.name };

	return db.create(
		monitors,
		{
			id: crypto.randomUUID(),
			...settingsToColumns(settings),
			heartbeat_token: settings.type === "heartbeat" ? generateHeartbeatToken() : null,
			is_enabled: true,
			last_status: null,
			last_checked_at: null,
			last_response_time_ms: null,
			last_ping_at: null,
			consecutive_failures: 0,
			next_due_at: settings.type === "heartbeat" ? now + settings.intervalSeconds * 1000 : now, // Check immediately
			created_at: now,
			updated_at: now,
		},
		{ returnRow: true },
	);
}

/**
 * Saves edited settings. Returns null when the monitor does not exist.
 */
export async function updateMonitor(db: AppDatabase, id: string, settings: MonitorSettings): Promise<SelectMonitor | null> {
	const monitor = await getMonitorById(db, id);
	if (!monitor) return null;

	const now = Date.now();
	const isHeartbeat = settings.type === "heartbeat";
	let nextDueAt: number | null = now; // Check the new settings right away
	if (!monitor.is_enabled) nextDueAt = null;
	else if (isHeartbeat && monitor.last_ping_at !== null) {
		nextDueAt = monitor.last_ping_at + (settings.intervalSeconds + settings.graceSeconds) * 1000;
	} else if (isHeartbeat) nextDueAt = now + settings.intervalSeconds * 1000;

	return db.update(monitors, id, {
		...settingsToColumns(settings),
		heartbeat_token: isHeartbeat ? (monitor.heartbeat_token ?? generateHeartbeatToken()) : monitor.heartbeat_token,
		consecutive_failures: 0,
		next_due_at: nextDueAt,
		updated_at: now,
	});
}

function settingsToColumns(settings: MonitorSettings) {
	return {
		type: settings.type,
		name: settings.name.trim(),
		url: settings.type === "heartbeat" ? "" : settings.url.trim(),
		method: settings.method,
		expected_statuses: settings.expectedStatuses,
		request_headers: settings.requestHeaders,
		request_body: settings.requestBody,
		keyword: settings.keyword,
		keyword_mode: settings.keywordMode,
		json_path: settings.jsonPath,
		json_expected: settings.jsonExpected,
		interval_seconds: settings.intervalSeconds,
		timeout_seconds: settings.timeoutSeconds,
		degraded_after_ms: settings.degradedAfterMs,
		grace_seconds: settings.graceSeconds,
		failure_threshold: settings.failureThreshold,
		reminder_minutes: settings.reminderMinutes,
		alert_channel_ids: settings.alertChannelIds === null ? null : JSON.stringify(settings.alertChannelIds),
		is_public: settings.isPublic,
	};
}

/** The settings of a saved monitor, as the edit form and the MCP update tool start from. */
export function monitorSettings(monitor: SelectMonitor): MonitorSettings {
	let alertChannelIds: string[] | null = null;
	try {
		alertChannelIds = monitor.alert_channel_ids ? JSON.parse(monitor.alert_channel_ids) : null;
	} catch {
		alertChannelIds = null;
	}

	return {
		type: monitor.type,
		name: monitor.name,
		url: monitor.url,
		method: monitor.method,
		expectedStatuses: monitor.expected_statuses,
		requestHeaders: monitor.request_headers,
		requestBody: monitor.request_body,
		keyword: monitor.keyword,
		keywordMode: monitor.keyword_mode,
		jsonPath: monitor.json_path,
		jsonExpected: monitor.json_expected,
		intervalSeconds: monitor.interval_seconds,
		timeoutSeconds: monitor.timeout_seconds,
		degradedAfterMs: monitor.degraded_after_ms,
		graceSeconds: monitor.grace_seconds,
		failureThreshold: monitor.failure_threshold,
		reminderMinutes: monitor.reminder_minutes,
		alertChannelIds,
		isPublic: monitor.is_public,
	};
}

/** Long and random: knowing the token is what lets a job report in. */
function generateHeartbeatToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(18));
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
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
	return setMonitorEnabled(db, monitor, !monitor.is_enabled);
}

export async function setMonitorEnabled(db: AppDatabase, monitor: SelectMonitor, isEnabled: boolean): Promise<SelectMonitor> {
	const now = Date.now();
	return db.update(monitors, monitor.id, {
		is_enabled: isEnabled,
		next_due_at: isEnabled ? now : null,
		consecutive_failures: 0,
		updated_at: now,
	});
}

/**
 * Shows or hides a monitor on the public status page. Returns null when the monitor does not exist.
 */
export async function toggleMonitorVisibility(db: AppDatabase, id: string): Promise<SelectMonitor | null> {
	const monitor = await getMonitorById(db, id);
	if (!monitor) return null;

	return await db.update(monitors, id, {
		is_public: !monitor.is_public,
		updated_at: Date.now(),
	});
}

/**
 * Finds all active monitors that are due for a health check.
 */
export async function findDueMonitors(db: AppDatabase, now: number = Date.now()): Promise<SelectMonitor[]> {
	const due = await db.findMany(monitors, {
		where: and(
			eq(monitors.is_enabled, true),
			or(
				isNull(monitors.next_due_at),
				lte(monitors.next_due_at, now + SCHEDULE_GRACE_MS),
			),
		),
		orderBy: [["next_due_at", "asc"]],
		limit: 100,
	});

	return due;
}

/** What to send to a probe for this monitor; heartbeats are never probed. */
export function probeRequestFor(monitor: SelectMonitor): ProbeRequest | null {
	if (monitor.type === "heartbeat") return null;

	if (monitor.type === "tcp") {
		const { host, port } = splitHostPort(monitor.url);
		return {
			type: "tcp",
			host,
			port,
			timeoutSeconds: monitor.timeout_seconds,
			degradedAfterMs: monitor.degraded_after_ms,
		};
	}

	const headers = monitor.request_headers ? parseHeaderLines(monitor.request_headers) : null;
	return {
		type: "http",
		url: monitor.url,
		method: monitor.method,
		expectedStatuses: monitor.expected_statuses,
		timeoutSeconds: monitor.timeout_seconds,
		degradedAfterMs: monitor.degraded_after_ms,
		headers: headers?.ok ? headers.headers : undefined,
		body: monitor.request_body,
		keyword: monitor.keyword,
		keywordMode: monitor.keyword_mode,
		jsonPath: monitor.json_path,
		jsonExpected: monitor.json_expected,
	};
}

/** "db.example.com:5432" or "[::1]:22" → host and port. */
export function splitHostPort(target: string): { host: string; port: number } {
	const match = target.trim().match(/^(\[[^\]]+\]|[^:]+):(\d+)$/);
	return match ? { host: match[1].replace(/^\[|\]$/g, ""), port: Number(match[2]) } : { host: target, port: 0 };
}

/**
 * Probes a monitor and records the outcome. Every check path (cron, button, MCP) goes through here
 * so incidents and alerts behave the same regardless of who triggered the check.
 * `outcome` is null when there was nothing to check (a heartbeat whose ping is not yet late).
 */
export async function checkMonitor(
	db: AppDatabase,
	monitor: SelectMonitor,
	alerts?: AlertSettings,
	options: CheckOptions = {},
): Promise<{ monitor: SelectMonitor; outcome: CheckOutcome | null; incident?: SelectIncident }> {
	const request = probeRequestFor(monitor);
	if (!request) return checkHeartbeat(db, monitor, alerts);

	let outcome = await runProbe(request);

	// Confirm a new failure before it opens an incident. During an outage that is
	// already confirmed, every check counts as-is.
	if (outcome.status === "down" && monitor.last_status !== "down") {
		outcome = await confirmFailure(request, outcome, options);
	}

	const recorded = await recordCheckOutcome(db, monitor, outcome, alerts);
	return { ...recorded, outcome };
}

/**
 * Re-checks a failure. With regional probes, the monitor is down only when most locations
 * (this one included) agree; otherwise it is re-checked from here after a short pause.
 */
async function confirmFailure(request: ProbeRequest, first: CheckOutcome, options: CheckOptions): Promise<CheckOutcome> {
	const probes = options.probes;
	if (probes && probes.regions.length > 0) {
		const answers = await Promise.all(
			probes.regions.map((region) =>
				probes.run(region, request).then(
					(outcome) => ({ region, outcome }),
					(error) => {
						const log = logger.open("job", { region, error: error instanceof Error ? error.message : String(error) });
						log.note("Regional probe failed to run");
						log.emit();
						return null;
					},
				),
			),
		);
		const answered = answers.filter((answer) => answer !== null);

		if (answered.length > 0) {
			const failedRegions = answered.filter((a) => a.outcome.status === "down").map((a) => a.region);
			const failures = 1 + failedRegions.length;
			const total = 1 + answered.length;

			if (failures * 2 > total) {
				return {
					...first,
					errorMessage: `${first.errorMessage ?? "Check failed"} (confirmed from ${failedRegions.map(regionLabel).join(", ") || "here"})`,
				};
			}

			const passing = answered.find((a) => a.outcome.status !== "down");
			if (passing) {
				const log = logger.open("job", { region: passing.region, firstError: first.errorMessage });
				log.note("Failure not confirmed by other regions");
				log.emit();
				return passing.outcome;
			}
		}
	}

	await new Promise((resolve) => setTimeout(resolve, options.confirmFailureDelayMs ?? CONFIRM_FAILURE_DELAY_MS));
	return runProbe(request);
}

/**
 * A heartbeat goes down when no ping arrived within its period plus grace. Monitors that never
 * pinged stay pending, so a job that has not been set up yet pages nobody.
 */
async function checkHeartbeat(
	db: AppDatabase,
	monitor: SelectMonitor,
	alerts: AlertSettings | undefined,
	now: number = Date.now(),
): Promise<{ monitor: SelectMonitor; outcome: CheckOutcome | null; incident?: SelectIncident }> {
	const period = monitor.interval_seconds * 1000;
	if (monitor.last_ping_at === null) {
		const updated = await db.update(monitors, monitor.id, { next_due_at: now + period, updated_at: now });
		return { monitor: updated, outcome: null };
	}

	const deadline = monitor.last_ping_at + period + monitor.grace_seconds * 1000;
	if (now < deadline) {
		const updated = await db.update(monitors, monitor.id, { next_due_at: deadline, updated_at: now });
		return { monitor: updated, outcome: null };
	}

	const outcome: CheckOutcome = {
		status: "down",
		statusCode: null,
		responseTimeMs: 0,
		errorMessage: `No ping since ${new Date(monitor.last_ping_at).toISOString()} (expected every ${formatSeconds(monitor.interval_seconds)}, ${formatSeconds(monitor.grace_seconds)} grace)`,
	};
	const recorded = await recordCheckOutcome(db, monitor, outcome, alerts, now);
	return { ...recorded, outcome };
}

/**
 * Records a ping from a heartbeat monitor's job. `failed` is the job reporting that it failed.
 * Returns null when no heartbeat monitor has this token.
 */
export async function recordHeartbeatPing(
	db: AppDatabase,
	token: string,
	alerts?: AlertSettings,
	options: { failed?: boolean; now?: number } = {},
): Promise<SelectMonitor | null> {
	const monitor = await db.findOne(monitors, {
		where: and(eq(monitors.heartbeat_token, token), eq(monitors.type, "heartbeat")),
	});
	if (!monitor) return null;

	const now = options.now ?? Date.now();
	const pinged = await db.update(monitors, monitor.id, { last_ping_at: now, updated_at: now });
	if (!pinged.is_enabled) return pinged;

	const outcome: CheckOutcome = options.failed
		? { status: "down", statusCode: null, responseTimeMs: 0, errorMessage: "The job reported a failure" }
		: { status: "up", statusCode: null, responseTimeMs: 0 };
	return (await recordCheckOutcome(db, pinged, outcome, alerts, now)).monitor;
}

/**
 * Checks every due monitor, then once an hour rolls up daily uptime and prunes old check rows.
 */
export async function runSweep(
	db: AppDatabase,
	alerts?: AlertSettings,
	now: number = Date.now(),
	options: CheckOptions = {},
): Promise<{ swept: number; failed: number }> {
	const due = await findDueMonitors(db, now);
	const log = logger.open("cron", { count: due.length });
	log.note(`Sweeping ${due.length} due monitors`);
	log.emit();

	const results = await Promise.allSettled(due.map((monitor) => checkMonitor(db, monitor, alerts, options)));

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
		// Yesterday is recomputed too, so its last hour is not lost when the day rolls over.
		await refreshDailyStats(db, startOfUtcDay(now) - DAY_MS, now);
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
	now: number = Date.now(),
): Promise<{ monitor: SelectMonitor; incident?: SelectIncident }> {
	const previousStatus = monitor.last_status;
	const failed = outcome.status === "down";
	const consecutiveFailures = failed ? monitor.consecutive_failures + 1 : 0;

	// Below the failure threshold a failed check is recorded, but the monitor keeps its status.
	const belowThreshold = failed && previousStatus !== "down" && consecutiveFailures < Math.max(1, monitor.failure_threshold);
	const currentStatus: MonitorStatus | null = belowThreshold ? previousStatus : outcome.status;

	const inMaintenance = isUnderMaintenance(await listActiveMaintenance(db, now), monitor.id, now);
	const isHeartbeat = monitor.type === "heartbeat";

	// 1. Record the individual check result
	await db.create(monitorResults, {
		id: crypto.randomUUID(),
		monitor_id: monitor.id,
		response_status: outcome.statusCode,
		response_time_ms: isHeartbeat ? null : outcome.responseTimeMs,
		is_up: !failed,
		error_message: outcome.errorMessage ?? null,
		is_maintenance: inMaintenance,
		created_at: now,
	});

	// 2. Handle Incident Lifecycle
	let createdIncident: SelectIncident | undefined;
	const alert = (payload: Omit<IncidentAlertPayload, "monitor" | "previousStatus" | "timestamp">) =>
		notifyMonitor(db, alerts, monitor, { monitor, previousStatus, timestamp: now, ...payload });

	if (currentStatus === "down") {
		const openIncident = await db.findOne(incidents, {
			where: and(eq(incidents.monitor_id, monitor.id), isNull(incidents.resolved_at)),
		});

		// Down with no open incident starts one. Looking for an open incident rather than at the
		// previous status also opens it when an outage outlasts a maintenance window.
		if (!openIncident && !inMaintenance) {
			createdIncident = await db.create(
				incidents,
				{
					id: crypto.randomUUID(),
					monitor_id: monitor.id,
					started_at: now,
					resolved_at: null,
					cause: outcome.errorMessage ?? "Check failed",
					error_details: isHeartbeat
						? null
						: `Status: ${outcome.statusCode ?? "None"}, Response time: ${outcome.responseTimeMs}ms`,
					last_alerted_at: now,
					created_at: now,
				},
				{ returnRow: true },
			);

			await alert({ currentStatus: "down", reason: outcome.errorMessage ?? "Health check failed" });
		} else if (openIncident && !inMaintenance && monitor.reminder_minutes > 0) {
			const lastAlertedAt = openIncident.last_alerted_at ?? openIncident.started_at;
			if (now - lastAlertedAt >= monitor.reminder_minutes * 60_000) {
				await db.update(incidents, openIncident.id, { last_alerted_at: now });
				await alert({
					currentStatus: "down",
					isReminder: true,
					reason: `Down for ${formatSeconds(Math.round((now - openIncident.started_at) / 1000))}. ${outcome.errorMessage ?? ""}`.trim(),
				});
			}
		}
	}

	// Any passing check (up or slow) ends the outage. Resolving by query rather than by
	// previous status also closes incidents left open by earlier versions.
	if (!failed) {
		const resolved = await db.updateMany(
			incidents,
			{ resolved_at: now },
			{ where: and(eq(incidents.monitor_id, monitor.id), isNull(incidents.resolved_at)) },
		);

		if (resolved.affectedRows > 0) {
			await alert({ currentStatus: outcome.status, reason: describeRecovery(monitor, outcome) });
		}
	}

	// 3. Advance next_due_at and update cached monitor state
	const updatedMonitor = await db.update(
		monitors,
		monitor.id,
		{
			last_status: currentStatus,
			last_checked_at: now,
			last_response_time_ms: isHeartbeat ? null : outcome.responseTimeMs,
			consecutive_failures: consecutiveFailures,
			next_due_at: nextDueAt(monitor, outcome, now),
			updated_at: now,
		},
	);

	const log = logger.open("job", {
		monitorId: monitor.id,
		url: monitor.url,
		status: currentStatus ?? "pending",
		responseTimeMs: outcome.responseTimeMs,
	});
	log.note(`Checked ${monitor.name}: ${outcome.status} (${outcome.responseTimeMs}ms)`);
	log.emit();

	return { monitor: updatedMonitor, incident: createdIncident };
}

/** A heartbeat that just pinged is next looked at when its next ping is overdue. */
function nextDueAt(monitor: SelectMonitor, outcome: CheckOutcome, now: number): number {
	const period = monitor.interval_seconds * 1000;
	if (monitor.type === "heartbeat" && outcome.status !== "down") return now + period + monitor.grace_seconds * 1000;
	return now + period;
}

function describeRecovery(monitor: SelectMonitor, outcome: CheckOutcome): string {
	if (monitor.type === "heartbeat") return "A ping was received";
	if (monitor.type === "tcp") return `Service recovered: connected in ${outcome.responseTimeMs}ms`;
	return `Service recovered with HTTP ${outcome.statusCode} in ${outcome.responseTimeMs}ms`;
}

export function formatSeconds(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
	const days = Math.floor(hours / 24);
	return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}

export interface IncidentListItem {
	incident: SelectIncident;
	monitorName: string;
}

/** Incidents across monitors, newest first. */
export async function listIncidents(
	db: AppDatabase,
	options: { monitorId?: string; activeOnly?: boolean; limit?: number } = {},
): Promise<IncidentListItem[]> {
	const filters = [
		options.monitorId ? eq(incidents.monitor_id, options.monitorId) : undefined,
		options.activeOnly ? isNull(incidents.resolved_at) : undefined,
	].filter((filter) => filter !== undefined);

	const [rows, all] = await Promise.all([
		db.findMany(incidents, {
			where: filters.length > 0 ? and(...filters) : undefined,
			orderBy: [["started_at", "desc"]],
			limit: options.limit ?? 20,
		}),
		listMonitors(db),
	]);
	const names = new Map(all.map((m) => [m.id, m.name]));
	return rows.map((incident) => ({ incident, monitorName: names.get(incident.monitor_id) ?? "Deleted monitor" }));
}

export type PublicServiceState = "up" | "down" | "degraded" | "pending" | "maintenance";

export interface PublicServiceStatus {
	id: string;
	name: string;
	status: PublicServiceState;
	uptimePercentage24h: number | null;
	/** Weighted by checks over the days shown. */
	uptimePercentageOverall: number | null;
	lastResponseTimeMs: number | null;
	dailyUptime: DailyUptime[];
}

/** Incidents as the public sees them: which service and when, never the raw failure details. */
export interface PublicIncident {
	id: string;
	monitorName: string;
	startedAt: number;
	resolvedAt: number | null;
}

export interface PublicMaintenance {
	id: string;
	title: string;
	startsAt: number;
	endsAt: number;
	/** Public services it covers; empty when it covers every service. */
	serviceNames: string[];
	isActive: boolean;
}

export type SystemStatus = "operational" | "degraded" | "outage" | "maintenance";

export interface PublicStatusData {
	systemStatus: SystemStatus;
	systemStatusTitle: string;
	systemStatusDescription: string;
	overallUptime24h: number | null;
	totalMonitors: number;
	historyDays: number;
	services: PublicServiceStatus[];
	activeIncidents: PublicIncident[];
	pastIncidents: PublicIncident[];
	activePosts: PublicStatusPost[];
	pastPosts: PublicStatusPost[];
	maintenance: PublicMaintenance[];
	generatedAt: number;
}

/**
 * Share of successful checks in the last 24h, or null when there were no checks.
 * Degraded (slow but reachable) checks count as up; maintenance checks are left out.
 */
export async function calculate24hUptime(db: AppDatabase, monitorId: string): Promise<number | null> {
	const since = Date.now() - DAY_MS;
	const inWindow = and(
		eq(monitorResults.monitor_id, monitorId),
		gte(monitorResults.created_at, since),
		eq(monitorResults.is_maintenance, false),
	);

	const total = await db.count(monitorResults, { where: inWindow });
	if (total === 0) return null;

	const upCount = await db.count(monitorResults, { where: and(inWindow, eq(monitorResults.is_up, true)) });
	return Math.round((upCount / total) * 10000) / 100;
}

/**
 * Latest checks for a monitor, oldest first, for timeline bars.
 */
export async function listRecentChecks(db: AppDatabase, monitorId: string, limit: number): Promise<CheckSegment[]> {
	const rows = await db.findMany(monitorResults, {
		where: eq(monitorResults.monitor_id, monitorId),
		orderBy: [["created_at", "desc"]],
		limit,
	});

	return rows.reverse().map((r) => ({
		// Slow checks are stored as up with an explanatory message.
		status: !r.is_up ? "down" : r.error_message ? "degraded" : "up",
		checkedAt: r.created_at,
		responseTimeMs: r.response_time_ms,
		statusCode: r.response_status,
	}));
}

/**
 * Compiles aggregated public status page data: service health, daily uptime bars, incidents,
 * announcements and maintenance.
 */
export async function getPublicStatusPageData(db: AppDatabase, options: { days?: number } = {}): Promise<PublicStatusData> {
	const days = options.days ?? 90;
	const now = Date.now();

	const activeMonitors = await db.findMany(monitors, {
		where: and(eq(monitors.is_enabled, true), eq(monitors.is_public, true)),
		orderBy: [["name", "asc"]],
	});

	const [windows, daily, posts] = await Promise.all([
		listCurrentAndUpcomingMaintenance(db, now),
		getDailyUptime(db, activeMonitors.map((m) => m.id), days, now),
		listPublicStatusPosts(db, now),
	]);

	const services: PublicServiceStatus[] = await Promise.all(
		activeMonitors.map(async (mon) => {
			const dailyUptime = daily.get(mon.id) ?? [];
			return {
				id: mon.id,
				name: mon.name,
				status: isUnderMaintenance(windows, mon.id, now) ? "maintenance" : (mon.last_status ?? "pending"),
				uptimePercentage24h: await calculate24hUptime(db, mon.id),
				uptimePercentageOverall: overallUptime(dailyUptime),
				lastResponseTimeMs: mon.last_response_time_ms,
				dailyUptime,
			};
		}),
	);

	const monitorNames = new Map(activeMonitors.map((m) => [m.id, m.name]));
	const withMonitorName = (rows: SelectIncident[]): PublicIncident[] =>
		rows.flatMap((inc) => {
			const monitorName = monitorNames.get(inc.monitor_id);
			// Incidents of private or paused monitors stay off the public page.
			return monitorName === undefined
				? []
				: [{ id: inc.id, monitorName, startedAt: inc.started_at, resolvedAt: inc.resolved_at }];
		});

	const activeIncidents = withMonitorName(
		await db.findMany(incidents, {
			where: isNull(incidents.resolved_at),
			orderBy: [["started_at", "desc"]],
			limit: 10,
		}),
	);

	const pastIncidents = withMonitorName(
		await db.findMany(incidents, {
			where: and(notNull(incidents.resolved_at), gte(incidents.started_at, now - 7 * DAY_MS)),
			orderBy: [["started_at", "desc"]],
			limit: 10,
		}),
	);

	const maintenance: PublicMaintenance[] = windows
		.filter((w) => w.starts_at <= now + 7 * DAY_MS)
		.flatMap((w) => {
			const covered = activeMonitors.filter((m) => windowCoversMonitor(w, m.id));
			const coversAll = w.monitor_ids === null;
			// A window that only covers private monitors is not the public's business.
			if (!coversAll && covered.length === 0) return [];
			return [
				{
					id: w.id,
					title: w.title,
					startsAt: w.starts_at,
					endsAt: w.ends_at,
					serviceNames: coversAll ? [] : covered.map((m) => m.name),
					isActive: w.starts_at <= now,
				},
			];
		});

	const overall = summarizeSystemStatus(services, posts.active);
	const measured = services.map((s) => s.uptimePercentage24h).filter((u): u is number => u !== null);
	const overallUptime24h =
		measured.length > 0 ? Math.round((measured.reduce((a, b) => a + b, 0) / measured.length) * 100) / 100 : null;

	return {
		...overall,
		overallUptime24h,
		totalMonitors: services.length,
		historyDays: days,
		services,
		activeIncidents,
		pastIncidents,
		activePosts: posts.active,
		pastPosts: posts.past,
		maintenance,
		generatedAt: now,
	};
}

function summarizeSystemStatus(
	services: PublicServiceStatus[],
	activePosts: PublicStatusPost[],
): Pick<PublicStatusData, "systemStatus" | "systemStatusTitle" | "systemStatusDescription"> {
	const downCount = services.filter((s) => s.status === "down").length;
	const majorPost = activePosts.some((p) => p.impact === "major");
	const minorPost = activePosts.some((p) => p.impact === "minor");

	if (downCount > 1 || (downCount > 0 && downCount === services.length) || majorPost) {
		return {
			systemStatus: "outage",
			systemStatusTitle: "Major System Outage",
			systemStatusDescription: downCount > 1 ? "Multiple services are currently unavailable." : "We are working on a major issue.",
		};
	}
	if (downCount === 1) {
		return {
			systemStatus: "outage",
			systemStatusTitle: "Partial System Outage",
			systemStatusDescription: "One service is currently unavailable. Other services are unaffected.",
		};
	}
	if (services.some((s) => s.status === "degraded") || minorPost) {
		return {
			systemStatus: "degraded",
			systemStatusTitle: "Degraded Performance",
			systemStatusDescription: minorPost
				? "Some services are affected by an ongoing issue."
				: "Some services are responding slower than usual.",
		};
	}
	if (services.some((s) => s.status === "maintenance")) {
		return {
			systemStatus: "maintenance",
			systemStatusTitle: "Scheduled Maintenance",
			systemStatusDescription: "Planned maintenance is in progress. Other services are unaffected.",
		};
	}
	return {
		systemStatus: "operational",
		systemStatusTitle: "All Systems Operational",
		systemStatusDescription: "All monitored services are responding normally.",
	};
}
