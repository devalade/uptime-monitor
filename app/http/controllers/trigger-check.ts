/**
 * Trigger Check controller for POST /monitors/:id/check
 * Runs an on-demand probe and redirects back.
 */

import { createAction } from "remix/router";
import { requireDatabase, TransportKey } from "~/app/http/context";
import { executeHttpCheck } from "~/app/services/checker";
import { getMonitorById, recordCheckOutcome } from "~/app/services/monitor-service";
import routes from "~/routes/web";

export default createAction(routes.checkMonitor, async (ctx) => {
	const db = requireDatabase(ctx);
	const transport = ctx.get(TransportKey);
	const id = (ctx as any).params?.id;

	if (!id) {
		return new Response("Monitor ID required", { status: 400 });
	}

	const monitor = await getMonitorById(db, id);
	if (!monitor) {
		return new Response("Monitor not found", { status: 404 });
	}

	const outcome = await executeHttpCheck({
		url: monitor.url,
		method: monitor.method,
		expectedStatus: monitor.expected_status,
		timeoutSeconds: monitor.timeout_seconds,
		degradedAfterMs: monitor.degraded_after_ms,
	});

	await recordCheckOutcome(db, monitor, outcome, transport);

	const referer = ctx.request.headers.get("Referer");
	const origin = new URL(ctx.request.url).origin;
	const redirectUrl = referer || `${origin}/monitors/${id}`;

	return Response.redirect(redirectUrl, 303);
});
