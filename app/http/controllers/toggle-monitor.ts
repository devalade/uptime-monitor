/**
 * Toggle Monitor controller for POST /monitors/:id/toggle
 * Pauses or resumes an uptime monitor.
 */

import { createAction } from "remix/router";
import { redirectBack } from "~/app/http/redirect";
import { toggleMonitor } from "~/app/services/monitor-service";
import routes from "~/routes/web";

export default createAction(routes.toggleMonitor, async (ctx) => {
	const db = ctx.db;
	const id = ctx.params.id;

	const updated = await toggleMonitor(db, id);
	if (!updated) {
		return new Response("Monitor not found", { status: 404 });
	}

	return redirectBack(ctx.request, routes.monitor.href({ id }));
});
