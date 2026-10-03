/**
 * Toggle Alert Channel controller for POST /alerts/:id/toggle
 * Turns a channel off or back on without deleting it.
 */

import { createRedirectResponse } from "remix/response/redirect";
import { createAction } from "remix/router";
import { toggleAlertChannel } from "~/app/services/alert-channels";
import routes from "~/routes/web";

export default createAction(routes.toggleAlertChannel, async (ctx) => {
	const updated = await toggleAlertChannel(ctx.db, ctx.params.id);
	if (!updated) {
		return new Response("Channel not found", { status: 404 });
	}
	return createRedirectResponse(routes.alertChannels.href(), 303);
});
