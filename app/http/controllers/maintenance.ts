/**
 * Maintenance controller for GET /maintenance
 * Lists running, upcoming and past maintenance windows with a form to schedule one.
 */

import { createAction } from "remix/router";
import { listCurrentAndUpcomingMaintenance, listPastMaintenance } from "~/app/services/maintenance";
import { listMonitors } from "~/app/services/monitor-service";
import { renderMaintenanceView } from "~/app/http/views/maintenance-view";
import routes from "~/routes/web";

export default createAction(routes.maintenance, async (ctx) => {
	const [current, past, monitors] = await Promise.all([
		listCurrentAndUpcomingMaintenance(ctx.db),
		listPastMaintenance(ctx.db),
		listMonitors(ctx.db),
	]);
	return ctx.render(renderMaintenanceView({ current, past, monitors }));
});
