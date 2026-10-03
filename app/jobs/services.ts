/**
 * What background jobs need from the outside world, installed by the dispatcher's
 * middleware so handlers read `ctx.services` with real types.
 */

import type { JobMiddleware } from "@sdxc/jobs";
import { createContextKey } from "remix/router";
import type { AppDatabase } from "~/app/contracts/database";
import type { AlertSettings } from "~/app/services/alerting";

export interface JobServices {
	db: AppDatabase;
	alerts?: AlertSettings;
}

export const JobServicesKey = createContextKey<JobServices>();

export function jobServices(services: JobServices): JobMiddleware<{
	key: typeof JobServicesKey;
	value: JobServices;
	property: "services";
}> {
	return async (ctx, next) => {
		ctx.set(JobServicesKey, services, { property: "services" });
		await next();
	};
}
