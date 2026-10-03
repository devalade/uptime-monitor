/**
 * Test Alert controller for POST /alerts/test
 * Sends a sample alert to every channel so the setup can be checked before an outage.
 */

import { createAction } from "remix/router";
import { loadAlertChannels, sendAlert, testAlertPayload } from "~/app/services/alerting";
import routes from "~/routes/web";

export default createAction(routes.testAlert, async (ctx) => {
	const origin = new URL(ctx.request.url).origin;
	const target = new URL(routes.alertChannels.href(), origin);
	const channels = await loadAlertChannels(ctx.db, ctx.alerts);

	if (channels.length === 0) {
		target.searchParams.set("notice", "none");
		return Response.redirect(target.toString(), 303);
	}

	const deliveries = await sendAlert(channels, testAlertPayload(origin));
	const failed = deliveries.filter((d) => !d.ok);
	if (failed.length === 0) {
		target.searchParams.set("notice", "sent");
		target.searchParams.set("channel", channels.length === 1 ? channels[0].name : `all ${channels.length} channels`);
	} else {
		target.searchParams.set("notice", "failed");
		target.searchParams.set("detail", failed.map((d) => `${d.channel}: ${d.error}`).join("; "));
	}
	return Response.redirect(target.toString(), 303);
});
