/**
 * Job handler for checkHttp: runs a single HTTP probe and records the result.
 */

import { createJobHandler } from "@sdxc/jobs";
import type { AppDatabase } from "~/app/contracts/database";
import type { AlertSettings } from "~/app/services/alerting";
import { checkMonitor, getMonitorById } from "~/app/services/monitor-service";
import jobs from "~/app/jobs/definitions";
import { JobServicesKey } from "~/app/jobs/dispatcher";

export interface JobServicesContext {
	db: AppDatabase;
	alerts?: AlertSettings;
}

export default createJobHandler(jobs.checkHttp, async (ctx) => {
	const services = ctx.get(JobServicesKey) as JobServicesContext | undefined;
	const db = services?.db;
	if (!db) {
		throw new Error("Job execution requires database in context");
	}

	const monitor = await getMonitorById(db, ctx.input.monitorId);
	if (!monitor || !monitor.is_enabled) {
		return;
	}

	await checkMonitor(db, monitor, services.alerts);
});
