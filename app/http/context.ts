/**
 * Request context keys for the Uptime Monitor application router.
 */

import { createContextKey } from "remix/router";
import type { AppDatabase } from "~/app/contracts/database";
import type { Cache } from "~/app/contracts/cache";
import type { AlertSettings } from "~/app/services/alerting";

export const DatabaseKey = createContextKey<AppDatabase>();
export const CacheKey = createContextKey<Cache | undefined>();
/** Undefined when no EMAIL binding or ALERT_EMAIL is configured: checks still run, nobody is emailed. */
export const AlertsKey = createContextKey<AlertSettings | undefined>();

export function requireDatabase(ctx: { get: (key: any) => any }): AppDatabase {
	const db = ctx.get(DatabaseKey);
	if (!db) {
		throw new Error("Database not found in context. Ensure DatabaseKey is set in middleware.");
	}
	return db;
}
