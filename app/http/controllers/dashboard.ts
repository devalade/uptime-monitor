/**
 * Dashboard controller for GET /
 * Lists all monitors and provides the main operational dashboard.
 */

import { createAction } from "remix/router";
import { requireDatabase } from "~/app/http/context";
import { listMonitors } from "~/app/services/monitor-service";
import { renderDashboardView } from "~/app/http/views/dashboard-view";
import routes from "~/routes/web";

export default createAction(routes.home, async (ctx) => {
	const db = requireDatabase(ctx);
	const allMonitors = await listMonitors(db);
	const html = renderDashboardView({ monitors: allMonitors });

	return (ctx as any).render(html);
});
