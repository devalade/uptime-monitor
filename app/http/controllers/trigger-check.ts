/**
 * Trigger Check controller for POST /monitors/:id/check
 * Runs an on-demand probe and redirects back.
 */

import { createAction } from "remix/router";
import { AlertsKey, requireDatabase } from "~/app/http/context";
import { redirectBack } from "~/app/http/redirect";
import { checkMonitor, getMonitorById } from "~/app/services/monitor-service";
import routes from "~/routes/web";

export default createAction(routes.checkMonitor, async (ctx) => {
	const db = requireDatabase(ctx);
	const id = (ctx as any).params?.id;

	if (!id) {
		return new Response("Monitor ID required", { status: 400 });
	}

	const monitor = await getMonitorById(db, id);
	if (!monitor) {
		return new Response("Monitor not found", { status: 404 });
	}

	await checkMonitor(db, monitor, ctx.get(AlertsKey));

	return redirectBack(ctx.request, routes.monitor.href({ id }));
});
