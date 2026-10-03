/**
 * Add Status Post Update controller for POST /incidents/:id/updates
 * Posts an update to an incident and moves it to the chosen status.
 */

import { createAction } from "remix/router";
import { addStatusPostUpdate, listStatusPosts, parseStatusPostUpdate, readStatusPostForm } from "~/app/services/status-posts";
import { renderStatusPostsView } from "~/app/http/views/status-posts-view";
import routes from "~/routes/web";

export default createAction(routes.addStatusPostUpdate, async (ctx) => {
	const postId = ctx.params.id;
	const values = readStatusPostForm(await ctx.request.formData());
	const input = parseStatusPostUpdate(values);

	if (!input.ok) {
		const posts = await listStatusPosts(ctx.db);
		return ctx.render(renderStatusPostsView({ posts, updateForm: { postId, values, errors: input.errors } }), { status: 400 });
	}

	const post = await addStatusPostUpdate(ctx.db, postId, input.value);
	if (!post) {
		return new Response("Incident not found", { status: 404 });
	}
	return Response.redirect(`${new URL(ctx.request.url).origin}${routes.statusPosts.href()}`, 303);
});
