/**
 * Heartbeat ping controller for /api/health/ping/:token (any method)
 * Called by the monitored job each time it succeeds.
 */

import { createAction } from "remix/router";
import { recordHeartbeatPing } from "~/app/services/monitor-service";
import apiRoutes from "~/routes/api";

export default createAction(apiRoutes.heartbeatPing, async (ctx) => {
	const monitor = await recordHeartbeatPing(ctx.db, ctx.params.token, ctx.alerts);
	return monitor ? new Response("OK\n") : new Response("Unknown heartbeat\n", { status: 404 });
});
