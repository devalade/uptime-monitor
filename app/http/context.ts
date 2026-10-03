/**
 * Request context for the Uptime Monitor application router.
 * `appServices()` installs the database, cache, alert settings and regional probes as typed
 * properties, so controllers read `ctx.db`, `ctx.cache`, `ctx.alerts` and `ctx.probes`.
 */

import { createContextKey, type Middleware } from "remix/router";
import type { AppDatabase } from "~/app/contracts/database";
import type { Cache } from "~/app/contracts/cache";
import type { AlertSettings } from "~/app/services/alerting";
import type { RegionalProbes } from "~/app/services/regional-probes";

export const DatabaseKey = createContextKey<AppDatabase>();
export const CacheKey = createContextKey<Cache | undefined>();
/** Undefined when no alert channel is configured: checks still run, nobody is notified. */
export const AlertsKey = createContextKey<AlertSettings | undefined>();
/** Undefined when no probe namespace is bound: failures are re-checked from here instead. */
export const ProbesKey = createContextKey<RegionalProbes | undefined>();

export interface AppServices {
	db: AppDatabase;
	cache?: Cache;
	alerts?: AlertSettings;
	probes?: RegionalProbes;
}

export function appServices(services: AppServices): Middleware<
	readonly [
		{ key: typeof DatabaseKey; value: AppDatabase; property: "db" },
		{ key: typeof CacheKey; value: Cache | undefined; property: "cache" },
		{ key: typeof AlertsKey; value: AlertSettings | undefined; property: "alerts" },
		{ key: typeof ProbesKey; value: RegionalProbes | undefined; property: "probes" },
	]
> {
	return (ctx, next) => {
		ctx.set(DatabaseKey, services.db, { property: "db" });
		ctx.set(CacheKey, services.cache, { property: "cache" });
		ctx.set(AlertsKey, services.alerts, { property: "alerts" });
		ctx.set(ProbesKey, services.probes, { property: "probes" });
		return next();
	};
}
