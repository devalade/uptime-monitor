/**
 * Monitor Detail controller for GET /monitors/:id
 * Shows uptime, response times, settings, recent checks and incident history.
 */

import { createAction } from "remix/router";
import { loadMonitorDetailPage } from "~/app/http/pages";
import routes from "~/routes/web";

export default createAction(routes.monitor, async (ctx) => {
	const page = await loadMonitorDetailPage(ctx.db, ctx.url, ctx.params.id, { alerts: ctx.alerts });
	if (!page) {
		return new Response("Monitor not found", { status: 404 });
	}
	return ctx.render(page);
});
