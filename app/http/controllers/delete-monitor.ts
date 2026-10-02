/**
 * Delete Monitor controller for POST /monitors/:id/delete
 * Deletes a monitor and cascades its results and incidents.
 */

import { createAction } from "remix/router";
import { requireDatabase } from "~/app/http/context";
import { deleteMonitor } from "~/app/services/monitor-service";
import routes from "~/routes/web";

export default createAction(routes.deleteMonitor, async (ctx) => {
	const db = requireDatabase(ctx);
	const id = (ctx as any).params?.id;

	if (!id) {
		return new Response("Monitor ID required", { status: 400 });
	}

	await deleteMonitor(db, id);

	const origin = new URL(ctx.request.url).origin;
	return Response.redirect(`${origin}/`, 303);
});
