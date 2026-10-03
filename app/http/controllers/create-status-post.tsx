/**
 * Create Status Post controller for POST /incidents
 * Publishes an incident on the public status page.
 */

import { createRedirectResponse } from "remix/response/redirect";
import { createAction } from "remix/router";
import { createStatusPost, listStatusPosts, parseStatusPostInput, readStatusPostForm } from "~/app/services/status-posts";
import { StatusPostsPage } from "~/app/http/views/status-posts-view";
import { announceStatusPost } from "~/app/services/announcements";
import routes from "~/routes/web";

export default createAction(routes.createStatusPost, async (ctx) => {
	const values = readStatusPostForm(await ctx.request.formData());
	const input = parseStatusPostInput(values);

	if (!input.ok) {
		const posts = await listStatusPosts(ctx.db);
		return ctx.render(<StatusPostsPage posts={posts} form={{ values, errors: input.errors }} />, { status: 400 });
	}

	const post = await createStatusPost(ctx.db, input.value);
	await announceStatusPost(ctx.db, ctx.alerts, post, input.value);
	return createRedirectResponse(routes.statusPosts.href(), 303);
});
