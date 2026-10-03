/**
 * Delete Monitor controller for POST /monitors/:id/delete
 * Deletes a monitor and cascades its results and incidents.
 */

import { createRedirectResponse } from "remix/response/redirect";
import { createAction } from "remix/router";
import { deleteMonitor } from "~/app/services/monitor-service";
import routes from "~/routes/web";

export default createAction(routes.deleteMonitor, async (ctx) => {
	const db = ctx.db;
	const id = ctx.params.id;

	await deleteMonitor(db, id);

	return createRedirectResponse(routes.home.href(), 303);
});
