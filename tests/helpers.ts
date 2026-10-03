/**
 * Test helpers: an in-memory SQLite database built from the real migrations,
 * and a fetch stub that plays both the monitored site and the alert webhook.
 */

import { readFileSync, readdirSync } from "node:fs";
import { afterEach } from "node:test";
import { createMemoryDatabase, type AppDatabase } from "~/app/contracts/database";
import { createMonitor, type CreateMonitorInput } from "~/app/services/monitor-service";
import type { SelectMonitor } from "~/database/schema";

const MIGRATIONS_DIR = new URL("../database/migrations/", import.meta.url);

export async function createTestDatabase(): Promise<AppDatabase> {
	const db = createMemoryDatabase();
	for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
		const statements = readFileSync(new URL(file, MIGRATIONS_DIR), "utf8")
			.replace(/--.*$/gm, "")
			.split(";")
			.map((statement) => statement.trim())
			.filter(Boolean);
		for (const statement of statements) await db.exec(statement);
	}
	return db;
}

export function addMonitor(db: AppDatabase, input: Partial<CreateMonitorInput> = {}): Promise<SelectMonitor> {
	return createMonitor(db, { name: "API", url: "https://api.test/health", method: "GET", ...input });
}

export interface RecordedRequest {
	url: string;
	method: string;
	headers: Headers;
	body: string;
}

type Responder = (request: RecordedRequest) => Response | Promise<Response>;

/**
 * Replaces global fetch for the current test. `site` answers probes, in order;
 * every request to `webhookUrl` is recorded and answered with `webhookStatus`.
 */
export function stubFetch(options: { site?: Responder[]; webhookUrl?: string; webhookStatus?: number } = {}) {
	const siteResponses = [...(options.site ?? [])];
	const probes: RecordedRequest[] = [];
	const webhooks: RecordedRequest[] = [];
	const original = globalThis.fetch;

	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		const recorded: RecordedRequest = {
			url: request.url,
			method: request.method,
			headers: request.headers,
			body: request.body ? await request.text() : "",
		};

		if (options.webhookUrl && recorded.url === options.webhookUrl) {
			webhooks.push(recorded);
			return new Response("ok", { status: options.webhookStatus ?? 200 });
		}

		probes.push(recorded);
		const respond = siteResponses.length > 1 ? siteResponses.shift() : siteResponses[0];
		if (!respond) throw new Error(`Unexpected fetch to ${recorded.url}`);
		return respond(recorded);
	}) as typeof fetch;

	afterEach(() => {
		globalThis.fetch = original;
	});

	return { probes, webhooks };
}

export const ok = () => new Response("ok", { status: 200 });
export const serverError = () => new Response("boom", { status: 500 });
export const networkError = () => {
	throw new TypeError("fetch failed");
};
