/**
 * REST: DELETE /api/v1/monitors/:id
 */

import { createAction } from "remix/router";
import { apiError } from "~/app/http/api-response";
import { deleteMonitor, getMonitorById } from "~/app/services/monitor-service";
import apiRoutes from "~/routes/api";

export default createAction(apiRoutes.v1DeleteMonitor, async (ctx) => {
	if (!(await getMonitorById(ctx.db, ctx.params.id))) return apiError(404, "Monitor not found");
	await deleteMonitor(ctx.db, ctx.params.id);
	return new Response(null, { status: 204 });
});
