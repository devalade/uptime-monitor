/**
 * Delete Alert Channel controller for POST /alerts/:id/delete
 */

import { createAction } from "remix/router";
import { deleteAlertChannel } from "~/app/services/alert-channels";
import routes from "~/routes/web";

export default createAction(routes.deleteAlertChannel, async (ctx) => {
	await deleteAlertChannel(ctx.db, ctx.params.id);
	return Response.redirect(`${new URL(ctx.request.url).origin}${routes.alertChannels.href()}`, 303);
});
