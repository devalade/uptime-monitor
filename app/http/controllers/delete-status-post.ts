/**
 * Delete Status Post controller for POST /incidents/:id/delete
 * Removes an incident and its updates from the status page.
 */

import { createRedirectResponse } from "remix/response/redirect";
import { createAction } from "remix/router";
import { deleteStatusPost } from "~/app/services/status-posts";
import routes from "~/routes/web";

export default createAction(routes.deleteStatusPost, async (ctx) => {
	await deleteStatusPost(ctx.db, ctx.params.id);
	return createRedirectResponse(routes.statusPosts.href(), 303);
});
