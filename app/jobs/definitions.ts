/**
 * Job definitions for the Uptime Monitor following The Remix Way.
 * Declares all background jobs with their input validation schemas or cron triggers.
 */

import * as s from "@sdxc/json-schema";
import { job, jobs } from "@sdxc/jobs";

export const CheckHttpSchema = s.object({
	monitorId: s.string(),
});

export type CheckHttpInput = s.InferOutput<typeof CheckHttpSchema>;

export default jobs({
	/**
	 * Probe a single HTTP/HTTPS monitor.
	 */
	checkHttp: job({
		input: CheckHttpSchema,
	}),

	/**
	 * Sweep all due monitors and trigger their health checks.
	 * Executes every minute via Cloudflare Cron Triggers.
	 */
	sweepMonitors: job({
		cron: "* * * * *",
	}),
});
