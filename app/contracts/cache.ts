/**
 * Cache contract for the Uptime Monitor.
 * Uses WorkerKVCache in Cloudflare production and MemoryCache in tests/local development.
 */

import { MemoryCache } from "@sdxc/cache/memory";
import { WorkerKVCache } from "@sdxc/cache/worker-kv";

export type Cache = MemoryCache | WorkerKVCache;

export function createCache(kv?: KVNamespace, waitUntil?: (promise: Promise<unknown>) => void): Cache {
	if (kv) {
		return new WorkerKVCache(kv, { waitUntil });
	}
	return new MemoryCache();
}
