/**
 * Toggle Visibility controller for POST /monitors/:id/visibility
 * Shows or hides a monitor on the public status page.
 */

import { createAction } from "remix/router";
import { requireDatabase } from "~/app/http/context";
import { redirectBack } from "~/app/http/redirect";
import { toggleMonitorVisibility } from "~/app/services/monitor-service";
import routes from "~/routes/web";

export default createAction(routes.toggleVisibility, async (ctx) => {
	const db = requireDatabase(ctx);
	const id = (ctx as any).params?.id;

	if (!id) {
		return new Response("Monitor ID required", { status: 400 });
	}

	const updated = await toggleMonitorVisibility(db, id);
	if (!updated) {
		return new Response("Monitor not found", { status: 404 });
	}

	return redirectBack(ctx.request, routes.monitor.href({ id }));
});
