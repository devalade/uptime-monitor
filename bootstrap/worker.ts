/**
 * Cloudflare Worker entry point for Uptime Monitor.
 *
 * Handles HTTP requests via Remix 3 fetch-router, and scheduled cron triggers
 * via the background job dispatcher.
 */

import * as cloudflare from "@sdxc/jobs/cloudflare";
import { createAppDatabase, createMemoryDatabase } from "~/app/contracts/database";
import { createCache } from "~/app/contracts/cache";
import { createMailTransport } from "~/app/contracts/transport";
import { createAppJobDispatcher } from "~/app/jobs/dispatcher";
import application from "~/bootstrap/app";

export interface Env {
	DB?: D1Database;
	KV?: KVNamespace;
	EMAIL?: SendEmail;
	MAIL_FROM?: string;
	ALERT_EMAIL?: string;
	APP_ENV?: string;
	APP_URL?: string;
}

export default {
	/**
	 * Main HTTP fetch handler. Dispatches requests to the Remix 3 application router.
	 */
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const db = env.DB ? createAppDatabase(env.DB) : createMemoryDatabase();
		const cache = createCache(env.KV, (p) => ctx.waitUntil(p));
		const transport = createMailTransport(env.EMAIL);

		const app = application({
			db,
			cache,
			transport,
			fromEmail: env.MAIL_FROM ?? "alerts@uptime.local",
			alertEmail: env.ALERT_EMAIL ?? "admin@uptime.local",
		});

		return app.fetch(request);
	},

	/**
	 * Cloudflare Cron Trigger handler. Sweeps due monitors and triggers health probes every minute.
	 */
	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		const db = env.DB ? createAppDatabase(env.DB) : createMemoryDatabase();
		const transport = createMailTransport(env.EMAIL);

		const dispatcher = createAppJobDispatcher({
			db,
			transport,
			fromEmail: env.MAIL_FROM ?? "alerts@uptime.local",
			alertEmail: env.ALERT_EMAIL ?? "admin@uptime.local",
		});

		const handlers = cloudflare.worker(dispatcher);
		await handlers.scheduled(controller);
	},
};
