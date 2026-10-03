/**
 * Check Expiry controller for POST /monitors/:id/expiry
 * Reads the TLS certificate and domain expiry now instead of waiting for the scheduled check.
 */

import { createAction } from "remix/router";
import { redirectBack } from "~/app/http/redirect";
import { checkCertificate, checkDomain } from "~/app/services/expiry";
import { getMonitorById } from "~/app/services/monitor-service";
import routes from "~/routes/web";

export default createAction(routes.checkExpiry, async (ctx) => {
	const monitor = await getMonitorById(ctx.db, ctx.params.id);
	if (!monitor) return new Response("Monitor not found", { status: 404 });

	const now = Date.now();
	const checked = await checkCertificate(ctx.db, ctx.alerts, monitor, now);
	await checkDomain(ctx.db, ctx.alerts, checked, now);
	return redirectBack(ctx.request, routes.monitor.href({ id: monitor.id }));
});
