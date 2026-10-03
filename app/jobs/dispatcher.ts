/**
 * Job dispatcher for background tasks and cron triggers following The Remix Way.
 */

import { createJobDispatcher, type JobDispatcherContext, type JobQueue } from "@sdxc/jobs";
import { queue as createMemoryQueue } from "@sdxc/jobs/memory";
import jobs from "~/app/jobs/definitions";
import { jobServices, type JobServices } from "~/app/jobs/services";
import checkHttpHandler from "~/app/jobs/check-http";
import sweepMonitorsHandler from "~/app/jobs/sweep-monitors";

export function createAppJobDispatcher(services: JobServices, queue: JobQueue = createMemoryQueue()) {
	const dispatcher = createJobDispatcher({
		queue,
		middleware: [jobServices(services)],
	});

	dispatcher.map(jobs.checkHttp, checkHttpHandler);
	dispatcher.map(jobs.sweepMonitors, sweepMonitorsHandler);

	return dispatcher;
}

/** The context every job handler receives, derived from the middleware above. */
export type AppJobContext = JobDispatcherContext<ReturnType<typeof createAppJobDispatcher>>;

declare module "@sdxc/jobs" {
	interface JobTypes {
		context: AppJobContext;
	}
}
