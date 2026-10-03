/**
 * Job handler for sweepMonitors: cron trigger that finds all due monitors and triggers their checks.
 */

import { createJobHandler } from "@sdxc/jobs";
import type { JobServicesContext } from "~/app/jobs/check-http";
import { runSweep } from "~/app/services/monitor-service";
import jobs from "~/app/jobs/definitions";
import { JobServicesKey } from "~/app/jobs/dispatcher";

export default createJobHandler(jobs.sweepMonitors, async (ctx) => {
	const services = ctx.get(JobServicesKey) as JobServicesContext | undefined;
	const db = services?.db;
	if (!db) {
		throw new Error("Job execution requires database in context");
	}

	await runSweep(db, services.alerts);
});
