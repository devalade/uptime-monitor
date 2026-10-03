/**
 * REST: GET /api/v1/monitors/:id
 * The monitor with its settings, uptime and latest checks.
 */

import { createAction } from "remix/router";
import { apiError } from "~/app/http/api-response";
import { summarizeMonitor } from "~/app/services/monitor-api";
import { getMonitorWithHistory, monitorSettings } from "~/app/services/monitor-service";
import { getUptimeReport } from "~/app/services/uptime-stats";
import apiRoutes from "~/routes/api";

export default createAction(apiRoutes.v1Monitor, async (ctx) => {
	const detail = await getMonitorWithHistory(ctx.db, ctx.params.id);
	if (!detail) return apiError(404, "Monitor not found");

	const uptime = await getUptimeReport(ctx.db, detail.monitor.id);
	return Response.json({
		monitor: { ...summarizeMonitor(detail.monitor), settings: monitorSettings(detail.monitor) },
		uptime: { last24h: detail.uptimePercentage24h, last7d: uptime[7], last30d: uptime[30], last90d: uptime[90] },
		recentChecks: detail.results.slice(0, 20).map((r) => ({
			at: new Date(r.created_at).toISOString(),
			up: Boolean(r.is_up),
			statusCode: r.response_status,
			responseTimeMs: r.response_time_ms,
			error: r.error_message,
		})),
	});
});
