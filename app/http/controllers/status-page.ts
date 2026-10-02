/**
 * Public Status Page controller for GET /status.
 * Renders live system health, component uptime bars, and public incident history.
 * Employs Cloudflare Edge caching with stale-while-revalidate.
 */

import { createAction } from "remix/router";
import { requireDatabase } from "~/app/http/context";
import { getPublicStatusPageData } from "~/app/services/monitor-service";
import { renderStatusPageView } from "~/app/http/views/status-page-view";
import routes from "~/routes/web";

export default createAction(routes.status, async (ctx) => {
	const db = requireDatabase(ctx);
	const data = await getPublicStatusPageData(db);
	const html = renderStatusPageView(data);

	return (ctx as any).render(html, {
		headers: {
			"Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
		},
	});
});
