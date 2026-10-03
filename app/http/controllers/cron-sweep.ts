/**
 * Cron sweep endpoint for POST /api/cron/sweep
 * Allows triggering a sweep via HTTP webhook or external scheduler (Cloudflare Access service token).
 */

import { createAction } from "remix/router";
import { runSweep } from "~/app/services/monitor-service";
import apiRoutes from "~/routes/api";

export default createAction(apiRoutes.sweep, async (ctx) => {
	const db = ctx.db;
	const { swept, failed } = await runSweep(db, ctx.alerts, Date.now(), { probes: ctx.probes });

	return Response.json({ swept, successful: swept - failed, failed });
});
