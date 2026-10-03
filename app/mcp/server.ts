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
	listMonitors,
} from "~/app/services/monitor-service";
import type { AlertSettings } from "~/app/services/alerting";
import { parseMonitorInput } from "~/app/services/monitor-input";
import toolset from "~/app/mcp/tools";

export function createUptimeMcpHandler(db: AppDatabase, alerts?: AlertSettings) {
	const mcp = createHandler({
		name: "uptime-monitor-mcp",
		version: "1.0.0",
		instructions: "Monitor web services, query uptime statistics, check incidents, and run on-demand health probes.",
	});

	// Tool 1: list_monitors
	mcp.tools.map(
		toolset.listMonitors,
		createTool(toolset.listMonitors, async () => {
			const monitorsList = await listMonitors(db);
			return {
				total: monitorsList.length,
				monitors: monitorsList.map((m) => ({
					id: m.id,
					name: m.name,
					url: m.url,
					method: m.method,
					status: m.last_status ?? "pending",
					lastCheckedAt: m.last_checked_at ? new Date(m.last_checked_at).toISOString() : null,
					lastResponseTimeMs: m.last_response_time_ms,
					isEnabled: m.is_enabled,
					isPublic: m.is_public,
				})),
			};
		}),
	);

	// Tool 2: get_monitor
	mcp.tools.map(
		toolset.getMonitor,
		createTool(toolset.getMonitor, async (ctx) => {
			const detail = await getMonitorWithHistory(db, ctx.input.id);
			if (!detail) {
				return { error: `Monitor ${ctx.input.id} not found` };
			}
			return {
				monitor: {
					id: detail.monitor.id,
					name: detail.monitor.name,
					url: detail.monitor.url,
					method: detail.monitor.method,
					expectedStatus: detail.monitor.expected_status,
					status: detail.monitor.last_status ?? "pending",
					uptimePercentage24h: detail.uptimePercentage24h === null ? null : `${detail.uptimePercentage24h}%`,
					averageLatencyMs: detail.averageLatencyMs,
					isEnabled: detail.monitor.is_enabled,
				},
				recentChecks: detail.results.slice(0, 10).map((r) => ({
					timestamp: new Date(r.created_at).toISOString(),
					statusCode: r.response_status,
					responseTimeMs: r.response_time_ms,
					isUp: r.is_up,
					errorMessage: r.error_message,
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

	// Tool 3: check_monitor_now
	mcp.tools.map(
		toolset.checkMonitorNow,
		createTool(toolset.checkMonitorNow, async (ctx) => {
			const monitor = await getMonitorById(db, ctx.input.id);
			if (!monitor) {
				return { error: `Monitor ${ctx.input.id} not found` };
			}

			const { monitor: updated, outcome, incident } = await checkMonitor(db, monitor, alerts);

			return {
				monitorId: updated.id,
				name: updated.name,
				status: updated.last_status,
				statusCode: outcome.statusCode,
				responseTimeMs: outcome.responseTimeMs,
				errorMessage: outcome.errorMessage,
				incidentCreated: Boolean(incident),
			};
		}),
	);

	// Tool 4: create_monitor
	mcp.tools.map(
		toolset.createMonitor,
		createTool(toolset.createMonitor, async (ctx) => {
			const input = parseMonitorInput({
				name: ctx.input.name,
				url: ctx.input.url,
				method: ctx.input.method,
				expected_status: String(ctx.input.expectedStatus),
				interval_seconds: String(ctx.input.intervalSeconds),
				timeout_seconds: String(ctx.input.timeoutSeconds),
				is_public: String(ctx.input.isPublic),
			});
			if (!input.ok) {
				return { success: false, errors: input.errors };
			}

			const monitor = await createMonitor(db, input.value);

			return {
				success: true,
				monitor: {
					id: monitor.id,
					name: monitor.name,
					url: monitor.url,
					method: monitor.method,
					intervalSeconds: monitor.interval_seconds,
				},
			};
		}),
	);

	return mcp;
}
