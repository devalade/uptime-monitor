/**
 * Cron sweep endpoint for POST /api/cron/sweep
 * Allows triggering a sweep via HTTP webhook or external scheduler.
 */

import { createAction } from "remix/router";
import { requireDatabase, TransportKey } from "~/app/http/context";
import { findDueMonitors, recordCheckOutcome } from "~/app/services/monitor-service";
import { executeHttpCheck } from "~/app/services/checker";
import apiRoutes from "~/routes/api";

export default createAction(apiRoutes.sweep, async (ctx) => {
	const db = requireDatabase(ctx);
	const transport = ctx.get(TransportKey);

	const due = await findDueMonitors(db);
	const results = await Promise.allSettled(
		due.map(async (monitor) => {
			const outcome = await executeHttpCheck({
				url: monitor.url,
				method: monitor.method,
				expectedStatus: monitor.expected_status,
				timeoutSeconds: monitor.timeout_seconds,
				degradedAfterMs: monitor.degraded_after_ms,
			});
			return recordCheckOutcome(db, monitor, outcome, transport);
		}),
	);

	return Response.json({
		swept: due.length,
		successful: results.filter((r) => r.status === "fulfilled").length,
		failed: results.filter((r) => r.status === "rejected").length,
	});
});
