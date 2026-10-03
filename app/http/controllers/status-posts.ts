/**
 * Incidents controller for GET /incidents
 * Lists status page incidents written by people, with forms to open one and post updates.
 */

import { createAction } from "remix/router";
import { listStatusPosts } from "~/app/services/status-posts";
import { renderStatusPostsView } from "~/app/http/views/status-posts-view";
import routes from "~/routes/web";

export default createAction(routes.statusPosts, async (ctx) => {
	return ctx.render(renderStatusPostsView({ posts: await listStatusPosts(ctx.db) }));
});
