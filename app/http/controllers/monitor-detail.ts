/**
 * Monitor Detail controller for GET /monitors/:id
 * Shows uptime, response times, settings, recent checks and incident history.
 */

import { createAction } from "remix/router";
import { renderMonitorDetailPage } from "~/app/http/pages";
import routes from "~/routes/web";

export default createAction(routes.monitor, async (ctx) => {
	const html = await renderMonitorDetailPage(ctx.db, ctx.request, ctx.params.id, { alerts: ctx.alerts });
	if (!html) {
		return new Response("Monitor not found", { status: 404 });
	}
	return ctx.render(html);
});
