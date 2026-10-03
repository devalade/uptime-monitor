/**
 * Request context for the Uptime Monitor application router.
 * `appServices()` installs the database, cache and alert settings as typed properties,
 * so controllers read `ctx.db`, `ctx.cache` and `ctx.alerts`.
 */

import { createContextKey, type Middleware } from "remix/router";
import type { AppDatabase } from "~/app/contracts/database";
import type { Cache } from "~/app/contracts/cache";
import type { AlertSettings } from "~/app/services/alerting";

export const DatabaseKey = createContextKey<AppDatabase>();
export const CacheKey = createContextKey<Cache | undefined>();
/** Undefined when no alert channel is configured: checks still run, nobody is notified. */
export const AlertsKey = createContextKey<AlertSettings | undefined>();

export interface AppServices {
	db: AppDatabase;
	cache?: Cache;
	alerts?: AlertSettings;
}

export function appServices(services: AppServices): Middleware<
	readonly [
		{ key: typeof DatabaseKey; value: AppDatabase; property: "db" },
		{ key: typeof CacheKey; value: Cache | undefined; property: "cache" },
		{ key: typeof AlertsKey; value: AlertSettings | undefined; property: "alerts" },
	]
> {
	return (ctx, next) => {
		ctx.set(DatabaseKey, services.db, { property: "db" });
		ctx.set(CacheKey, services.cache, { property: "cache" });
		ctx.set(AlertsKey, services.alerts, { property: "alerts" });
		return next();
	};
}
