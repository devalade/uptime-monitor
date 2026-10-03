/**
 * REST: GET /api/v1/monitors
 */

import { createAction } from "remix/router";
import { summarizeMonitor } from "~/app/services/monitor-api";
import { listMonitors } from "~/app/services/monitor-service";
import apiRoutes from "~/routes/api";

export default createAction(apiRoutes.v1Monitors, async (ctx) => {
	const monitors = await listMonitors(ctx.db);
	return Response.json({ monitors: monitors.map(summarizeMonitor) });
});
