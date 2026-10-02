/**
 * Model Context Protocol (MCP) server implementation.
 * Exposes uptime tools through a standard Request -> Response fetch handler mounted on the router.
 */

import { createHandler, createTool } from "@sdxc/mcp";
import type { AppDatabase } from "~/app/contracts/database";
import type { Transport } from "~/app/contracts/transport";
import { executeHttpCheck } from "~/app/services/checker";
import {
	createMonitor,
	getMonitorById,
	getMonitorWithHistory,
	listMonitors,
	recordCheckOutcome,
} from "~/app/services/monitor-service";
import toolset from "~/app/mcp/tools";

export function createUptimeMcpHandler(db: AppDatabase, transport?: Transport) {
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
					uptimePercentage24h: `${detail.uptimePercentage24h}%`,
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

			const outcome = await executeHttpCheck({
				url: monitor.url,
				method: monitor.method,
				expectedStatus: monitor.expected_status,
				timeoutSeconds: monitor.timeout_seconds,
				degradedAfterMs: monitor.degraded_after_ms,
			});

			const { monitor: updated, incident } = await recordCheckOutcome(
				db,
				monitor,
				outcome,
				transport,
			);

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
			const monitor = await createMonitor(db, {
				name: ctx.input.name,
				url: ctx.input.url,
				method: ctx.input.method as any,
				expectedStatus: ctx.input.expectedStatus,
				intervalSeconds: ctx.input.intervalSeconds,
				timeoutSeconds: ctx.input.timeoutSeconds,
			});

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
