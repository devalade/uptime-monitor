/**
 * Database contract for the Uptime Monitor.
 * Provides unified access to remix/data-table whether running on Cloudflare D1 or local SQLite.
 */

import { Database } from "remix/data-table";
import { createD1DatabaseAdapter } from "@sdxc/data-table-d1";
import { createSqliteDatabase } from "remix/data-table/sqlite";

export type AppDatabase = Database<any>;

/**
 * Creates a Database instance backed by Cloudflare D1.
 */
export function createAppDatabase(d1: D1Database): AppDatabase {
	return new Database(createD1DatabaseAdapter(d1));
}

/**
 * Creates an in-memory or file-backed SQLite database for testing and local dev.
 */
export function createMemoryDatabase(filename: string = ":memory:"): AppDatabase {
	return createSqliteDatabase({ filename });
}
