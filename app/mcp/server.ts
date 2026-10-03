/**
 * Model Context Protocol (MCP) server implementation.
 * Exposes uptime tools through a standard Request -> Response fetch handler mounted on the router.
 */

import { createHandler, createTool } from "@sdxc/mcp";
import type { AppDatabase } from "~/app/contracts/database";
import {
	checkMonitor,
	createMonitor,
	getMonitorById,
	getMonitorWithHistory,
	listIncidents,
	listMonitors,
	monitorSettings,
	setMonitorEnabled,
	updateMonitor,
} from "~/app/services/monitor-service";
import type { AlertSettings } from "~/app/services/alerting";
import { createMaintenanceWindow, parseMaintenanceInput } from "~/app/services/maintenance";
import { parseMonitorInput, settingsToFormValues, type MonitorFormValues } from "~/app/services/monitor-input";
import type { RegionalProbes } from "~/app/services/regional-probes";
import { addStatusPostUpdate, createStatusPost, parseStatusPostInput, parseStatusPostUpdate } from "~/app/services/status-posts";
import { getUptimeReport } from "~/app/services/uptime-stats";
import type { SelectMonitor } from "~/database/schema";
import toolset from "~/app/mcp/tools";
import apiRoutes from "~/routes/api";

/** Monitor settings as the create_monitor and update_monitor tools take them. */
interface MonitorToolInput {
	name?: string;
	type?: string;
	url?: string;
	method?: string;
	expectedStatuses?: string;
	requestHeaders?: string;
	requestBody?: string;
	keyword?: string;
	keywordMode?: string;
	jsonPath?: string;
	jsonExpected?: string;
	intervalSeconds?: number;
	timeoutSeconds?: number;
	degradedAfterMs?: number;
	graceSeconds?: number;
	failureThreshold?: number;
	reminderMinutes?: number;
	isPublic?: boolean;
}

/** Lays the tool input over existing form values, so the form validation applies to tools too. */
function toFormValues(input: MonitorToolInput, base: MonitorFormValues = {}): MonitorFormValues {
	const values: MonitorFormValues = { alert_mode: "all", ...base };
	const set = (field: keyof MonitorFormValues, value: string | number | boolean | undefined) => {
		if (value !== undefined) values[field] = String(value);
	};
	set("name", input.name);
	set("type", input.type);
	set("method", input.method);
	set("expected_statuses", input.expectedStatuses);
	set("request_headers", input.requestHeaders);
	set("request_body", input.requestBody);
	set("keyword", input.keyword);
	set("keyword_mode", input.keywordMode);
	set("json_path", input.jsonPath);
	set("json_expected", input.jsonExpected);
	set("interval_seconds", input.intervalSeconds);
	set("timeout_seconds", input.timeoutSeconds);
	set("degraded_after_ms", input.degradedAfterMs);
	set("grace_seconds", input.graceSeconds);
	set("failure_threshold", input.failureThreshold);
	set("reminder_minutes", input.reminderMinutes);
	if (input.isPublic !== undefined) values.is_public = input.isPublic ? "on" : "";
	if (input.url !== undefined) {
		values.url = input.url;
		values.tcp_target = input.url;
	}
	return values;
}

function summarizeMonitor(m: SelectMonitor) {
	return {
		id: m.id,
		name: m.name,
		type: m.type,
		target: m.type === "heartbeat" ? null : m.url,
		method: m.type === "http" ? m.method : undefined,
		status: m.is_enabled ? (m.last_status ?? "pending") : "paused",
		lastCheckedAt: m.last_checked_at ? new Date(m.last_checked_at).toISOString() : null,
		lastResponseTimeMs: m.last_response_time_ms,
		isEnabled: m.is_enabled,
		isPublic: m.is_public,
	};
}

export function createUptimeMcpHandler(db: AppDatabase, alerts?: AlertSettings, probes?: RegionalProbes, origin?: string) {
	const mcp = createHandler({
		name: "uptime-monitor-mcp",
		version: "1.1.0",
		instructions:
			"Monitor web services, TCP ports and heartbeat jobs; query uptime statistics and incidents; run on-demand checks; post status page incidents and schedule maintenance.",
	});

	mcp.tools.map(
		toolset.listMonitors,
		createTool(toolset.listMonitors, async () => {
			const monitorsList = await listMonitors(db);
			return { total: monitorsList.length, monitors: monitorsList.map(summarizeMonitor) };
		}),
	);

	mcp.tools.map(
		toolset.getMonitor,
		createTool(toolset.getMonitor, async (ctx) => {
			const detail = await getMonitorWithHistory(db, ctx.input.id);
			if (!detail) {
				return { error: `Monitor ${ctx.input.id} not found` };
			}
			const m = detail.monitor;
			const uptime = await getUptimeReport(db, m.id);
			const percent = (value: number | null) => (value === null ? null : `${value}%`);
			return {
				monitor: {
					...summarizeMonitor(m),
					settings: monitorSettings(m),
					pingUrl: m.heartbeat_token && origin ? `${origin}${apiRoutes.heartbeatPing.href({ token: m.heartbeat_token })}` : undefined,
					lastPingAt: m.last_ping_at ? new Date(m.last_ping_at).toISOString() : undefined,
					inMaintenance: detail.inMaintenance,
				},
				uptime: {
					last24h: percent(detail.uptimePercentage24h),
					last7d: percent(uptime[7]),
					last30d: percent(uptime[30]),
					last90d: percent(uptime[90]),
				},
				averageLatencyMs: detail.averageLatencyMs,
				recentChecks: detail.results.slice(0, 10).map((r) => ({
					timestamp: new Date(r.created_at).toISOString(),
					statusCode: r.response_status,
					responseTimeMs: r.response_time_ms,
					isUp: r.is_up,
					errorMessage: r.error_message,
					duringMaintenance: r.is_maintenance,
				})),
				activeIncidents: detail.incidents
					.filter((i) => !i.resolved_at)
					.map((i) => ({
						id: i.id,
						startedAt: new Date(i.started_at).toISOString(),
						cause: i.cause,
						errorDetails: i.error_details,
					})),
			};
		}),
	);

	mcp.tools.map(
		toolset.checkMonitorNow,
		createTool(toolset.checkMonitorNow, async (ctx) => {
			const monitor = await getMonitorById(db, ctx.input.id);
			if (!monitor) {
				return { error: `Monitor ${ctx.input.id} not found` };
			}

			const { monitor: updated, outcome, incident } = await checkMonitor(db, monitor, alerts, { probes });

			return {
				monitorId: updated.id,
				name: updated.name,
				status: updated.last_status ?? "pending",
				statusCode: outcome?.statusCode ?? null,
				responseTimeMs: outcome?.responseTimeMs ?? null,
				errorMessage: outcome?.errorMessage,
				note: outcome ? undefined : "Heartbeat is not late, so there was nothing to check.",
				incidentCreated: Boolean(incident),
			};
		}),
	);

	mcp.tools.map(
		toolset.createMonitor,
		createTool(toolset.createMonitor, async (ctx) => {
			const input = parseMonitorInput(toFormValues(ctx.input));
			if (!input.ok) {
				return { success: false, errors: input.errors };
			}

			const monitor = await createMonitor(db, input.value);
			return {
				success: true,
				monitor: {
					...summarizeMonitor(monitor),
					intervalSeconds: monitor.interval_seconds,
					pingUrl:
						monitor.heartbeat_token && origin ? `${origin}${apiRoutes.heartbeatPing.href({ token: monitor.heartbeat_token })}` : undefined,
				},
			};
		}),
	);

	mcp.tools.map(
		toolset.updateMonitor,
		createTool(toolset.updateMonitor, async (ctx) => {
			const monitor = await getMonitorById(db, ctx.input.id);
			if (!monitor) {
				return { success: false, error: `Monitor ${ctx.input.id} not found` };
			}

			const input = parseMonitorInput(toFormValues(ctx.input, settingsToFormValues(monitorSettings(monitor))));
			if (!input.ok) {
				return { success: false, errors: input.errors };
			}

			const updated = await updateMonitor(db, monitor.id, input.value);
			return { success: true, monitor: updated ? { ...summarizeMonitor(updated), settings: monitorSettings(updated) } : null };
		}),
	);

	mcp.tools.map(
		toolset.setMonitorPaused,
		createTool(toolset.setMonitorPaused, async (ctx) => {
			const monitor = await getMonitorById(db, ctx.input.id);
			if (!monitor) {
				return { success: false, error: `Monitor ${ctx.input.id} not found` };
			}
			const updated = await setMonitorEnabled(db, monitor, !ctx.input.paused);
			return { success: true, monitor: summarizeMonitor(updated) };
		}),
	);

	mcp.tools.map(
		toolset.listIncidents,
		createTool(toolset.listIncidents, async (ctx) => {
			const items = await listIncidents(db, {
				monitorId: ctx.input.monitorId,
				activeOnly: ctx.input.activeOnly,
				limit: Math.min(Math.max(1, Math.round(ctx.input.limit)), 100),
			});
			return {
				incidents: items.map(({ incident, monitorName }) => ({
					id: incident.id,
					monitorId: incident.monitor_id,
					monitorName,
					startedAt: new Date(incident.started_at).toISOString(),
					resolvedAt: incident.resolved_at ? new Date(incident.resolved_at).toISOString() : null,
					durationMinutes: Math.round(((incident.resolved_at ?? Date.now()) - incident.started_at) / 60000),
					cause: incident.cause,
				})),
			};
		}),
	);

	mcp.tools.map(
		toolset.postStatusUpdate,
		createTool(toolset.postStatusUpdate, async (ctx) => {
			const { postId, title, impact, status, message } = ctx.input;

			if (postId) {
				const update = parseStatusPostUpdate({ status, message });
				if (!update.ok) return { success: false, errors: update.errors };
				const post = await addStatusPostUpdate(db, postId, update.value);
				return post ? { success: true, postId: post.id, status: post.status } : { success: false, error: `Status post ${postId} not found` };
			}

			const input = parseStatusPostInput({ title: title ?? "", impact: impact ?? "minor", status, message });
			if (!input.ok) return { success: false, errors: input.errors };
			const post = await createStatusPost(db, input.value);
			return { success: true, postId: post.id, status: post.status };
		}),
	);

	mcp.tools.map(
		toolset.scheduleMaintenance,
		createTool(toolset.scheduleMaintenance, async (ctx) => {
			const startsAt = Date.parse(ctx.input.startsAt);
			const endsAt = Date.parse(ctx.input.endsAt);
			if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) {
				return { success: false, error: "startsAt and endsAt must be ISO 8601 date-times, e.g. 2026-10-05T22:00:00Z." };
			}

			// Reuse the form validation by giving it UTC wall-clock times.
			const toUtcInput = (ms: number) => new Date(ms).toISOString().slice(0, 16);
			const input = parseMaintenanceInput({
				title: ctx.input.title,
				starts_at: toUtcInput(startsAt),
				ends_at: toUtcInput(endsAt),
				tz_offset: "0",
				scope: ctx.input.monitorIds ? "selected" : "all",
				monitor_ids: (ctx.input.monitorIds ?? []).join(","),
			});
			if (!input.ok) return { success: false, errors: input.errors };

			const window = await createMaintenanceWindow(db, input.value);
			return {
				success: true,
				maintenance: {
					id: window.id,
					title: window.title,
					startsAt: new Date(window.starts_at).toISOString(),
					endsAt: new Date(window.ends_at).toISOString(),
				},
			};
		}),
	);

	return mcp;
}
