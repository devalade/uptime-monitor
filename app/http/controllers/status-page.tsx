/**
 * Public Status Page controller for GET /status.
 * Renders live system health, daily uptime bars, announcements, maintenance and incident history.
 * Employs Cloudflare Edge caching with stale-while-revalidate.
 */

import { createAction } from "remix/router";
import { getPublicStatusPageData } from "~/app/services/monitor-service";
import { getStatusPageSettings } from "~/app/services/settings";
import { subscriberMail } from "~/app/services/subscribers";
import { parseSubscriptionNotice, StatusPage } from "~/app/http/views/status-page-view";
import routes from "~/routes/web";

export default createAction(routes.status, async (ctx) => {
	const [data, page] = await Promise.all([getPublicStatusPageData(ctx.db, { days: 90 }), getStatusPageSettings(ctx.db)]);
	return ctx.render(
		<StatusPage
			data={data}
			page={page}
			subscriptions={subscriberMail(ctx.alerts, ctx.url.origin) !== null}
			notice={parseSubscriptionNotice(ctx.url.searchParams.get("subscribe"))}
		/>,
		{
			headers: {
				"Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=60",
			},
		},
	);
});
