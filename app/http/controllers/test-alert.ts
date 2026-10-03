/**
 * Test Alert controller for POST /alerts/test
 * Sends a sample alert to every configured channel so the setup can be checked before an outage.
 */

import { createAction } from "remix/router";
import { sendIncidentAlert } from "~/app/services/alerting";
import routes from "~/routes/web";

export default createAction(routes.testAlert, async (ctx) => {
	const alerts = ctx.alerts;
	const origin = new URL(ctx.request.url).origin;

	if (!alerts) {
		return Response.redirect(`${origin}${routes.home.href()}?notice=alerts-off`, 303);
	}

	const deliveries = await sendIncidentAlert(alerts, {
		monitor: { id: "test", name: "Test alert", url: origin },
		previousStatus: "up",
		currentStatus: "down",
		reason: "This is a test alert from your uptime monitor. No action needed.",
		timestamp: Date.now(),
		isTest: true,
	});

	const failed = deliveries.filter((d) => !d.ok);
	const target = new URL(routes.home.href(), origin);
	if (failed.length === 0) {
		target.searchParams.set("notice", "test-alert-sent");
	} else {
		target.searchParams.set("notice", "test-alert-failed");
		target.searchParams.set("detail", failed.map((d) => `${d.channel}: ${d.error}`).join("; "));
	}
	return Response.redirect(target.toString(), 303);
});
