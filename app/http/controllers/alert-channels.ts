/**
 * Alert Channels controller for GET /alerts
 * Lists the channels that receive alerts, with a form to add one.
 */

import { createAction } from "remix/router";
import { listAlertChannelRows } from "~/app/services/alert-channels";
import { envChannels } from "~/app/services/alerting";
import { parseAlertsNotice, renderAlertChannelsView } from "~/app/http/views/alert-channels-view";
import routes from "~/routes/web";

export default createAction(routes.alertChannels, async (ctx) => {
	const html = renderAlertChannelsView({
		envChannels: envChannels(ctx.alerts),
		rows: await listAlertChannelRows(ctx.db),
		notice: parseAlertsNotice(new URL(ctx.request.url).searchParams),
	});
	return ctx.render(html);
});
