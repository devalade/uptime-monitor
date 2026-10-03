/**
 * Dashboard controller for GET /
 * Lists all monitors and provides the main operational dashboard.
 */

import { createAction } from "remix/router";
import { loadChannelOptions } from "~/app/http/pages";
import { getDashboardData } from "~/app/services/monitor-service";
import { parseDashboardFilter, renderDashboardView, TIMELINE_LENGTH } from "~/app/http/views/dashboard-view";
import routes from "~/routes/web";

export default createAction(routes.home, async (ctx) => {
	const db = ctx.db;
	const params = new URL(ctx.request.url).searchParams;
	const [monitors, channels] = await Promise.all([getDashboardData(db, TIMELINE_LENGTH), loadChannelOptions(db, ctx.alerts)]);

	const html = renderDashboardView({
		monitors,
		filter: parseDashboardFilter(params.get("filter")),
		alertsEnabled: channels.length > 0,
		channels,
	});

	return ctx.render(html);
});
