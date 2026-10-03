/**
 * Dashboard controller for GET /
 * Lists all monitors and provides the main operational dashboard.
 */

import { createAction } from "remix/router";
import { getDashboardData } from "~/app/services/monitor-service";
import {
	parseDashboardFilter,
	parseDashboardNotice,
	renderDashboardView,
	TIMELINE_LENGTH,
} from "~/app/http/views/dashboard-view";
import routes from "~/routes/web";

export default createAction(routes.home, async (ctx) => {
	const db = ctx.db;
	const params = new URL(ctx.request.url).searchParams;

	const html = renderDashboardView({
		monitors: await getDashboardData(db, TIMELINE_LENGTH),
		filter: parseDashboardFilter(params.get("filter")),
		alertsEnabled: Boolean(ctx.alerts),
		notice: parseDashboardNotice(params),
	});

	return ctx.render(html);
});
