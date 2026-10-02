/**
 * Request context keys for the Uptime Monitor application router.
 */

import { createContextKey } from "remix/router";
import type { AppDatabase } from "~/app/contracts/database";
import type { Cache } from "~/app/contracts/cache";
import type { Transport } from "~/app/contracts/transport";

export const DatabaseKey = createContextKey<AppDatabase>();
export const CacheKey = createContextKey<Cache | undefined>();
export const TransportKey = createContextKey<Transport | undefined>();
export const FromEmailKey = createContextKey<string>("alerts@uptime.local");
export const AlertEmailKey = createContextKey<string>("admin@uptime.local");

export function requireDatabase(ctx: { get: (key: any) => any }): AppDatabase {
	const db = ctx.get(DatabaseKey);
	if (!db) {
		throw new Error("Database not found in context. Ensure DatabaseKey is set in middleware.");
	}
	return db;
}

