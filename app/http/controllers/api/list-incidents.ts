/**
 * REST: GET /api/v1/incidents?monitorId=&active=true&limit=50
 */

import { createAction } from "remix/router";
import { listIncidents } from "~/app/services/monitor-service";
import apiRoutes from "~/routes/api";

export default createAction(apiRoutes.v1Incidents, async (ctx) => {
	const params = ctx.url.searchParams;
	const limit = Math.min(Math.max(1, Number(params.get("limit")) || 50), 200);
	const items = await listIncidents(ctx.db, {
		monitorId: params.get("monitorId") || undefined,
		activeOnly: params.get("active") === "true",
		limit,
	});
	return Response.json({
		incidents: items.map(({ incident, monitorName }) => ({
			id: incident.id,
			monitorId: incident.monitor_id,
			monitorName,
			startedAt: new Date(incident.started_at).toISOString(),
			resolvedAt: incident.resolved_at ? new Date(incident.resolved_at).toISOString() : null,
			cause: incident.cause,
		})),
	});
});
