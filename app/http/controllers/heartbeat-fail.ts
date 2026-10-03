/**
 * Heartbeat failure controller for /api/health/ping/:token/fail (any method)
 * Called by the monitored job to report that it failed, so the monitor goes down right away.
 */

import { createAction } from "remix/router";
import { recordHeartbeatPing } from "~/app/services/monitor-service";
import apiRoutes from "~/routes/api";

export default createAction(apiRoutes.heartbeatFail, async (ctx) => {
	const monitor = await recordHeartbeatPing(ctx.db, ctx.params.token, ctx.alerts, { failed: true });
	return monitor ? new Response("OK\n") : new Response("Unknown heartbeat\n", { status: 404 });
});
