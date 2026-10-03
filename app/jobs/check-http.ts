/**
 * Job handler for checkHttp: runs a single HTTP probe and records the result.
 */

import { createJobHandler } from "@sdxc/jobs";
import { checkMonitor, getMonitorById } from "~/app/services/monitor-service";
import jobs from "~/app/jobs/definitions";

export default createJobHandler(jobs.checkHttp, async (ctx) => {
	const { db, alerts } = ctx.services;

	const monitor = await getMonitorById(db, ctx.input.monitorId);
	if (!monitor || !monitor.is_enabled) {
		return;
	}

	await checkMonitor(db, monitor, alerts);
});
