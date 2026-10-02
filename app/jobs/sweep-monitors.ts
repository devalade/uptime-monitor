/**
 * Job handler for sweepMonitors: cron trigger that finds all due monitors and triggers their checks.
 */

import { createJobHandler } from "@sdxc/jobs";
import type { JobServicesContext } from "~/app/jobs/check-http";
import { findDueMonitors } from "~/app/services/monitor-service";
import { executeHttpCheck } from "~/app/services/checker";
import { recordCheckOutcome } from "~/app/services/monitor-service";
import jobs from "~/app/jobs/definitions";
import { JobServicesKey } from "~/app/jobs/dispatcher";
import { logger } from "~/bootstrap/logger";

export default createJobHandler(jobs.sweepMonitors, async (ctx) => {
	const services = ctx.get(JobServicesKey) as JobServicesContext | undefined;
	const db = services?.db;
	if (!db) {
		throw new Error("Job execution requires database in context");
	}

	const due = await findDueMonitors(db);
	const log = logger.open("cron", { count: due.length });
	log.note(`Sweeping ${due.length} due monitors`);
	log.emit();

	// Execute checks for all due monitors
	await Promise.allSettled(
		due.map(async (monitor) => {
			try {
				const outcome = await executeHttpCheck({
					url: monitor.url,
					method: monitor.method,
					expectedStatus: monitor.expected_status,
					timeoutSeconds: monitor.timeout_seconds,
					degradedAfterMs: monitor.degraded_after_ms,
				});

				await recordCheckOutcome(
					db,
					monitor,
					outcome,
					services.transport,
					services.fromEmail,
					services.alertEmail,
				);
			} catch (error) {
				const errLog = logger.open("job", {
					monitorId: monitor.id,
					error: error instanceof Error ? error.message : String(error),
				});
				errLog.note(`Failed to check monitor ${monitor.name}`);
				errLog.emit();
			}
		}),
	);
});
