/**
 * Delete Status Post controller for POST /incidents/:id/delete
 * Removes an incident and its updates from the status page.
 */

import { createAction } from "remix/router";
import { deleteStatusPost } from "~/app/services/status-posts";
import routes from "~/routes/web";

export default createAction(routes.deleteStatusPost, async (ctx) => {
	await deleteStatusPost(ctx.db, ctx.params.id);
	return Response.redirect(`${new URL(ctx.request.url).origin}${routes.statusPosts.href()}`, 303);
});
