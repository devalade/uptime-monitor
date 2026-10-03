/**
 * Create Status Post controller for POST /incidents
 * Publishes an incident on the public status page.
 */

import { createAction } from "remix/router";
import { createStatusPost, listStatusPosts, parseStatusPostInput, readStatusPostForm } from "~/app/services/status-posts";
import { renderStatusPostsView } from "~/app/http/views/status-posts-view";
import routes from "~/routes/web";

export default createAction(routes.createStatusPost, async (ctx) => {
	const values = readStatusPostForm(await ctx.request.formData());
	const input = parseStatusPostInput(values);

	if (!input.ok) {
		const posts = await listStatusPosts(ctx.db);
		return ctx.render(renderStatusPostsView({ posts, form: { values, errors: input.errors } }), { status: 400 });
	}

	await createStatusPost(ctx.db, input.value);
	return Response.redirect(`${new URL(ctx.request.url).origin}${routes.statusPosts.href()}`, 303);
});
