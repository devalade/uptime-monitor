/**
 * Create Alert Channel controller for POST /alerts
 * Adds a webhook, Telegram or PagerDuty channel.
 */

import { createRedirectResponse } from "remix/response/redirect";
import { createAction } from "remix/router";
import { createAlertChannel, listAlertChannelRows, parseAlertChannelInput, readAlertChannelForm } from "~/app/services/alert-channels";
import { envChannels } from "~/app/services/alerting";
import { AlertChannelsPage } from "~/app/http/views/alert-channels-view";
import routes from "~/routes/web";

export default createAction(routes.createAlertChannel, async (ctx) => {
	const values = readAlertChannelForm(await ctx.request.formData());
	const input = parseAlertChannelInput(values, { canEmail: Boolean(ctx.alerts?.mailer) });

	if (!input.ok) {
		return ctx.render(
			<AlertChannelsPage
				envChannels={envChannels(ctx.alerts)}
				canEmail={Boolean(ctx.alerts?.mailer)}
				rows={await listAlertChannelRows(ctx.db)}
				form={{ values, errors: input.errors }}
			/>,
			{ status: 400 },
		);
	}

	await createAlertChannel(ctx.db, input.value);
	return createRedirectResponse(routes.alertChannels.href(), 303);
});
