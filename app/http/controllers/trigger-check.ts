/**
 * Trigger Check controller for POST /monitors/:id/check
 * Runs an on-demand probe and redirects back.
 */

import { createAction } from "remix/router";
import { redirectBack } from "~/app/http/redirect";
import { checkMonitor, getMonitorById } from "~/app/services/monitor-service";
import routes from "~/routes/web";

export default createAction(routes.checkMonitor, async (ctx) => {
	const db = ctx.db;
	const id = ctx.params.id;

	const monitor = await getMonitorById(db, id);
	if (!monitor) {
		return new Response("Monitor not found", { status: 404 });
	}

	await checkMonitor(db, monitor, ctx.alerts);

	return redirectBack(ctx.request, routes.monitor.href({ id }));
});
