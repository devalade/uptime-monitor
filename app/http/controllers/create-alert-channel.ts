/**
 * Create Alert Channel controller for POST /alerts
 * Adds a webhook, Telegram or PagerDuty channel.
 */

import { createAction } from "remix/router";
import { createAlertChannel, listAlertChannelRows, parseAlertChannelInput, readAlertChannelForm } from "~/app/services/alert-channels";
import { envChannels } from "~/app/services/alerting";
import { renderAlertChannelsView } from "~/app/http/views/alert-channels-view";
import routes from "~/routes/web";

export default createAction(routes.createAlertChannel, async (ctx) => {
	const values = readAlertChannelForm(await ctx.request.formData());
	const input = parseAlertChannelInput(values);

	if (!input.ok) {
		const html = renderAlertChannelsView({
			envChannels: envChannels(ctx.alerts),
			rows: await listAlertChannelRows(ctx.db),
			form: { values, errors: input.errors },
		});
		return ctx.render(html, { status: 400 });
	}

	await createAlertChannel(ctx.db, input.value);
	return Response.redirect(`${new URL(ctx.request.url).origin}${routes.alertChannels.href()}`, 303);
});
