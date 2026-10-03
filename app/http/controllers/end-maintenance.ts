/**
 * End Maintenance controller for POST /maintenance/:id/end
 * Ends a running window now, or cancels one that has not started.
 */

import { createAction } from "remix/router";
import { endMaintenanceWindow } from "~/app/services/maintenance";
import routes from "~/routes/web";

export default createAction(routes.endMaintenance, async (ctx) => {
	await endMaintenanceWindow(ctx.db, ctx.params.id);
	return Response.redirect(`${new URL(ctx.request.url).origin}${routes.maintenance.href()}`, 303);
});
