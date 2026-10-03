/**
 * End Maintenance controller for POST /maintenance/:id/end
 * Ends a running window now, or cancels one that has not started.
 */

import { createRedirectResponse } from "remix/response/redirect";
import { createAction } from "remix/router";
import { endMaintenanceWindow } from "~/app/services/maintenance";
import routes from "~/routes/web";

export default createAction(routes.endMaintenance, async (ctx) => {
	await endMaintenanceWindow(ctx.db, ctx.params.id);
	return createRedirectResponse(routes.maintenance.href(), 303);
});
