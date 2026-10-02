/**
 * Job handler for checkHttp: runs a single HTTP probe and records the result.
 */

import { createJobHandler } from "@sdxc/jobs";
import type { AppDatabase } from "~/app/contracts/database";
import type { Transport } from "~/app/contracts/transport";
import { executeHttpCheck } from "~/app/services/checker";
import { getMonitorById, recordCheckOutcome } from "~/app/services/monitor-service";
import jobs from "~/app/jobs/definitions";
import { JobServicesKey } from "~/app/jobs/dispatcher";

export interface JobServicesContext {
	db: AppDatabase;
	transport?: Transport;
	fromEmail?: string;
	alertEmail?: string;
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
});
