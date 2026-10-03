/**
 * Dashboard controller for GET /
 * Lists all monitors and provides the main operational dashboard.
 */

import { createAction } from "remix/router";
import { loadChannelOptions } from "~/app/http/pages";
import { getDashboardData } from "~/app/services/monitor-service";
import { DashboardPage, parseDashboardFilter, TIMELINE_LENGTH } from "~/app/http/views/dashboard-view";
import routes from "~/routes/web";

export default createAction(routes.home, async (ctx) => {
	const db = ctx.db;
	const [monitors, channels] = await Promise.all([getDashboardData(db, TIMELINE_LENGTH), loadChannelOptions(db, ctx.alerts)]);

	return ctx.render(
		<DashboardPage
			monitors={monitors}
			filter={parseDashboardFilter(ctx.url.searchParams.get("filter"))}
			alertsEnabled={channels.length > 0}
			channels={channels}
		/>,
	);
});
