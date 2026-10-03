/**
 * Cloudflare Worker entry point for Uptime Monitor.
 *
 * Handles HTTP requests via Remix 3 fetch-router, and scheduled cron triggers
 * via the background job dispatcher. Also exports the regional probe Durable Object.
 */

import * as cloudflare from "@sdxc/jobs/cloudflare";
import { queue as createMemoryQueue } from "@sdxc/jobs/memory";
import { createAppDatabase, createMemoryDatabase } from "~/app/contracts/database";
import { createCache } from "~/app/contracts/cache";
import { createAlertSettings } from "~/app/contracts/alerts";
import { createAppJobDispatcher } from "~/app/jobs/dispatcher";
import { createRegionalProbes, parseProbeRegions, type ProbeNamespace } from "~/app/services/regional-probes";
import application from "~/bootstrap/app";

export { RegionalProbe } from "~/app/probes/regional-probe";

export interface Env {
	DB?: D1Database;
	KV?: KVNamespace;
	EMAIL?: SendEmail;
	/** Regional probe Durable Objects that confirm failures from other locations. */
	PROBE?: ProbeNamespace;
	/** Comma-separated Durable Object location hints, e.g. "enam,weur,apac". */
	PROBE_REGIONS?: string;
	MAIL_FROM?: string;
	ALERT_EMAIL?: string;
	ALERT_WEBHOOK_URL?: string;
	ACCESS_TEAM_DOMAIN?: string;
	ACCESS_AUD?: string;
	APP_ENV?: string;
	APP_URL?: string;
}

function createProbes(env: Env) {
	return env.PROBE ? createRegionalProbes(env.PROBE, parseProbeRegions(env.PROBE_REGIONS)) : undefined;
}

export default {
	/**
	 * Main HTTP fetch handler. Dispatches requests to the Remix 3 application router.
	 */
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const db = env.DB ? createAppDatabase(env.DB) : createMemoryDatabase();
		const cache = createCache(env.KV, (p) => ctx.waitUntil(p));

		const app = application({
			db,
			cache,
			alerts: createAlertSettings(env),
			probes: createProbes(env),
			access:
				env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD
					? { teamDomain: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD }
					: undefined,
		});

		return app.fetch(request);
	},

	/**
	 * Cloudflare Cron Trigger handler. Sweeps due monitors and triggers health probes every minute.
	 */
	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		const db = env.DB ? createAppDatabase(env.DB) : createMemoryDatabase();

		const queue = createMemoryQueue();
		const dispatcher = createAppJobDispatcher(
			{
				db,
				alerts: createAlertSettings(env),
				probes: createProbes(env),
			},
			queue,
		);

		const handlers = cloudflare.worker(dispatcher);
		await handlers.scheduled(controller);

		// tick() only enqueues due jobs. No Cloudflare Queue is bound, so run them here,
		// inside this cron invocation, or they vanish with the in-memory queue.
		await queue.drain((delivery) => dispatcher.deliver(delivery));
	},
};
