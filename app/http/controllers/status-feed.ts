/**
 * Status feed controller for GET /status/feed.xml
 * RSS feed of incidents, announcements and maintenance from the public status page.
 */

import { createAction } from "remix/router";
import { renderStatusFeed } from "~/app/http/views/feed";
import { getPublicStatusPageData } from "~/app/services/monitor-service";
import { getStatusPageSettings } from "~/app/services/settings";
import routes from "~/routes/web";

export default createAction(routes.statusFeed, async (ctx) => {
	const [data, page] = await Promise.all([getPublicStatusPageData(ctx.db, { days: 1 }), getStatusPageSettings(ctx.db)]);
	const statusPageUrl = `${ctx.url.origin}${routes.status.href()}`;

	return new Response(String(renderStatusFeed(data, statusPageUrl, page.title)), {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
			"Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
		},
	});
});
