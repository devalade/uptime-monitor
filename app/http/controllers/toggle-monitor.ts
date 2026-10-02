/**
 * Toggle Monitor controller for POST /monitors/:id/toggle
 * Pauses or resumes an uptime monitor.
 */

import { createAction } from "remix/router";
import { requireDatabase } from "~/app/http/context";
import { toggleMonitor } from "~/app/services/monitor-service";
import routes from "~/routes/web";

export default createAction(routes.toggleMonitor, async (ctx) => {
	const db = requireDatabase(ctx);
	const id = (ctx as any).params?.id;

	if (!id) {
		return new Response("Monitor ID required", { status: 400 });
	}

	await toggleMonitor(db, id);

	const referer = ctx.request.headers.get("Referer");
	const origin = new URL(ctx.request.url).origin;
	const redirectUrl = referer || `${origin}/monitors/${id}`;

	return Response.redirect(redirectUrl, 303);
});
