/**
 * Job handler for sweepMonitors: cron trigger that finds all due monitors and triggers their checks.
 */

import { createJobHandler } from "@sdxc/jobs";
import { runSweep } from "~/app/services/monitor-service";
import jobs from "~/app/jobs/definitions";

export default createJobHandler(jobs.sweepMonitors, async (ctx) => {
	await runSweep(ctx.services.db, ctx.services.alerts, Date.now(), { probes: ctx.services.probes });
});
