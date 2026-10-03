/**
 * Check Regions controller for POST /monitors/:id/regions
 * Probes the monitor from every region and shows the results, without changing its status.
 */

import { createAction } from "remix/router";
import { redirectBack } from "~/app/http/redirect";
import { checkFromAllRegions, getMonitorById } from "~/app/services/monitor-service";
import routes from "~/routes/web";

export default createAction(routes.checkRegions, async (ctx) => {
	const monitor = await getMonitorById(ctx.db, ctx.params.id);
	if (!monitor) return new Response("Monitor not found", { status: 404 });

	await checkFromAllRegions(ctx.db, monitor, ctx.probes);
	return redirectBack(ctx.request, routes.monitor.href({ id: monitor.id }));
});
