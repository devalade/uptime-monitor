/**
 * Status feed controller for GET /status/feed.xml
 * RSS feed of incidents, announcements and maintenance from the public status page.
 */

import { createAction } from "remix/router";
import { renderStatusFeed } from "~/app/http/views/feed";
import { getPublicStatusPageData } from "~/app/services/monitor-service";
import routes from "~/routes/web";

export default createAction(routes.statusFeed, async (ctx) => {
	const data = await getPublicStatusPageData(ctx.db, { days: 1 });
	const statusPageUrl = `${new URL(ctx.request.url).origin}${routes.status.href()}`;

	return new Response(renderStatusFeed(data, statusPageUrl), {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
			"Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
		},
	});
});
