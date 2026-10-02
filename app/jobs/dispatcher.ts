/**
 * Job dispatcher for background tasks and cron triggers following The Remix Way.
 */

import { createJobDispatcher } from "@sdxc/jobs";
import { queue as createMemoryQueue } from "@sdxc/jobs/memory";
import jobs from "~/app/jobs/definitions";
import checkHttpHandler, { type JobServicesContext } from "~/app/jobs/check-http";
import sweepMonitorsHandler from "~/app/jobs/sweep-monitors";

export const JobServicesKey = { name: "JobServices" } as const;

export function createAppJobDispatcher(services: JobServicesContext, queueBackend?: any) {
	const queue = queueBackend ?? createMemoryQueue();

	const middleware = [
		async (ctx: any, next: () => Promise<void>) => {
			ctx.set(JobServicesKey, services);
			await next();
		},
	] as const;

	const dispatcher = createJobDispatcher({
		queue,
		middleware: middleware as any,
	});

	dispatcher.map(jobs.checkHttp, checkHttpHandler);
	dispatcher.map(jobs.sweepMonitors, sweepMonitorsHandler);

	return dispatcher;
}
