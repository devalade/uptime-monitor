/**
 * Public Status Page controller for GET /status.
 * Renders live system health, component uptime bars, and public incident history.
 * Employs Cloudflare Edge caching with stale-while-revalidate.
 */

import { createAction } from "remix/router";
import { getPublicStatusPageData } from "~/app/services/monitor-service";
import { renderStatusPageView, TIMELINE_LENGTH } from "~/app/http/views/status-page-view";
import routes from "~/routes/web";

export default createAction(routes.status, async (ctx) => {
	const db = ctx.db;
	const data = await getPublicStatusPageData(db, TIMELINE_LENGTH);
	const html = renderStatusPageView(data);

	return ctx.render(html, {
		headers: {
			"Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=60",
		},
	});
});
