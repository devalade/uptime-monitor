/**
 * Test Alert Channel controller for POST /alerts/:id/test
 * Sends a sample alert to one channel and reports the result on the Alerts page.
 */

import { createAction } from "remix/router";
import { getAlertChannel } from "~/app/services/alert-channels";
import { sendAlert, testAlertPayload } from "~/app/services/alerting";
import routes from "~/routes/web";

export default createAction(routes.testAlertChannel, async (ctx) => {
	const origin = new URL(ctx.request.url).origin;
	const channel = await getAlertChannel(ctx.db, ctx.params.id);
	if (!channel) {
		return new Response("Channel not found or incomplete", { status: 404 });
	}

	const [delivery] = await sendAlert([channel], testAlertPayload(origin));
	const target = new URL(routes.alertChannels.href(), origin);
	if (delivery.ok) {
		target.searchParams.set("notice", "sent");
		target.searchParams.set("channel", channel.name);
	} else {
		target.searchParams.set("notice", "failed");
		target.searchParams.set("detail", `${delivery.channel}: ${delivery.error}`);
	}
	return Response.redirect(target.toString(), 303);
});
