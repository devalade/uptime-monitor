/**
 * Toggle Visibility controller for POST /monitors/:id/visibility
 * Shows or hides a monitor on the public status page.
 */

import { createAction } from "remix/router";
import { redirectBack } from "~/app/http/redirect";
import { toggleMonitorVisibility } from "~/app/services/monitor-service";
import routes from "~/routes/web";

export default createAction(routes.toggleVisibility, async (ctx) => {
	const db = ctx.db;
	const id = ctx.params.id;

	const updated = await toggleMonitorVisibility(db, id);
	if (!updated) {
		return new Response("Monitor not found", { status: 404 });
	}

	return redirectBack(ctx.request, routes.monitor.href({ id }));
});
