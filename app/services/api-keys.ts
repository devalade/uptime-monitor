/**
 * REST API keys. A key is shown once when created; only its SHA-256 hash is stored.
 */

import { eq } from "remix/data-table";
import type { AppDatabase } from "~/app/contracts/database";
import { apiKeys, type SelectApiKey } from "~/database/schema";

export const API_KEY_PREFIX = "um_";
/** last_used_at is written at most this often, so busy clients do not cost a write per request. */
const LAST_USED_RESOLUTION_MS = 5 * 60 * 1000;

export async function hashApiKey(key: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Creates a key and returns it in full, the only time it is available. */
export async function createApiKey(db: AppDatabase, name: string): Promise<{ key: string; row: SelectApiKey }> {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	const key = `${API_KEY_PREFIX}${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
	const row = await db.create(
		apiKeys,
		{
			id: crypto.randomUUID(),
			name: name.trim() || "API key",
			prefix: key.slice(0, 8),
			key_hash: await hashApiKey(key),
			last_used_at: null,
			created_at: Date.now(),
		},
		{ returnRow: true },
	);
	return { key, row };
}

export async function listApiKeys(db: AppDatabase): Promise<SelectApiKey[]> {
	return db.findMany(apiKeys, { orderBy: [["created_at", "desc"]] });
}

export async function revokeApiKey(db: AppDatabase, id: string): Promise<void> {
	await db.delete(apiKeys, id);
}

/** Whether `key` is a live API key; records when it was last used. */
export async function verifyApiKey(db: AppDatabase, key: string, now: number = Date.now()): Promise<boolean> {
	if (!key.startsWith(API_KEY_PREFIX)) return false;
	const row = await db.findOne(apiKeys, { where: eq(apiKeys.key_hash, await hashApiKey(key)) });
	if (!row) return false;
	if (row.last_used_at === null || now - row.last_used_at > LAST_USED_RESOLUTION_MS) {
		await db.update(apiKeys, row.id, { last_used_at: now });
	}
	return true;
}
