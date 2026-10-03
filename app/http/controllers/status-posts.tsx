/**
 * Incidents controller for GET /incidents
 * Lists status page incidents written by people, with forms to open one and post updates.
 */

import { createAction } from "remix/router";
import { listStatusPosts } from "~/app/services/status-posts";
import { StatusPostsPage } from "~/app/http/views/status-posts-view";
import routes from "~/routes/web";

export default createAction(routes.statusPosts, async (ctx) => {
	return ctx.render(<StatusPostsPage posts={await listStatusPosts(ctx.db)} />);
});
