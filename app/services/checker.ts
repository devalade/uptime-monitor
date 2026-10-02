/**
 * Probe engine for HTTP & HTTPS uptime checks.
 * Uses native Web fetch and AbortSignal.timeout to measure latency and check status.
 */

import type { HttpMethod, MonitorStatus } from "~/database/schema";

export interface CheckOptions {
	url: string;
	method: HttpMethod;
	expectedStatus: number;
	timeoutSeconds: number;
	degradedAfterMs: number;
}

export interface CheckOutcome {
	status: MonitorStatus;
	statusCode: number | null;
	responseTimeMs: number;
	errorMessage?: string;
}

/**
 * Runs a single probe against the target URL.
 */
export async function executeHttpCheck(options: CheckOptions): Promise<CheckOutcome> {
	const startTime = performance.now();
	const timeoutMs = Math.max(1, options.timeoutSeconds) * 1000;

	try {
		const response = await fetch(options.url, {
			method: options.method,
			signal: AbortSignal.timeout(timeoutMs),
			headers: {
				"User-Agent": "RemixUptimeMonitor/1.0 (+https://sergiodxa.com/articles/the-remix-way)",
				"Accept": "*/*",
			},
			redirect: "follow",
		});

		const responseTimeMs = Math.round(performance.now() - startTime);
		const statusCode = response.status;
		const matchesExpected = statusCode === options.expectedStatus;

		if (!matchesExpected) {
			return {
				status: "down",
				statusCode,
				responseTimeMs,
				errorMessage: `Expected HTTP ${options.expectedStatus} but received ${statusCode}`,
			};
		}

		if (responseTimeMs >= options.degradedAfterMs) {
			return {
				status: "degraded",
				statusCode,
				responseTimeMs,
				errorMessage: `Response time ${responseTimeMs}ms exceeded threshold of ${options.degradedAfterMs}ms`,
			};
		}

		return {
			status: "up",
			statusCode,
			responseTimeMs,
		};
	} catch (error) {
		const responseTimeMs = Math.round(performance.now() - startTime);
		const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
		const message = isTimeout
			? `Request timed out after ${options.timeoutSeconds}s`
			: error instanceof Error
				? error.message
				: "Unknown network error";

		return {
			status: "down",
			statusCode: null,
			responseTimeMs,
			errorMessage: message,
		};
	}
}
