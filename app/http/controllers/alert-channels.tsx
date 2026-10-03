/**
 * Alert Channels controller for GET /alerts
 * Lists the channels that receive alerts, with a form to add one.
 */

import { createAction } from "remix/router";
import { listAlertChannelRows } from "~/app/services/alert-channels";
import { envChannels } from "~/app/services/alerting";
import { AlertChannelsPage, parseAlertsNotice } from "~/app/http/views/alert-channels-view";
import routes from "~/routes/web";

export default createAction(routes.alertChannels, async (ctx) => {
	return ctx.render(
		<AlertChannelsPage
			envChannels={envChannels(ctx.alerts)}
			canEmail={Boolean(ctx.alerts?.mailer)}
			rows={await listAlertChannelRows(ctx.db)}
			notice={parseAlertsNotice(ctx.url.searchParams)}
		/>,
	);
});
