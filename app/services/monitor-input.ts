/**
 * Validation for monitor settings coming from the web form or the MCP create_monitor tool.
 * Returns field-level errors instead of throwing so callers can show them to the user.
 */

import { httpMethods, type HttpMethod } from "~/database/schema";
import type { CreateMonitorInput } from "~/app/services/monitor-service";

/** Cron fires once a minute, so shorter intervals cannot be honoured. */
export const intervalOptions = [
	{ seconds: 60, label: "Every minute" },
	{ seconds: 120, label: "Every 2 minutes" },
	{ seconds: 300, label: "Every 5 minutes" },
	{ seconds: 600, label: "Every 10 minutes" },
	{ seconds: 1800, label: "Every 30 minutes" },
	{ seconds: 3600, label: "Every hour" },
] as const;

export type MonitorFormField = "name" | "url" | "method" | "expected_status" | "interval_seconds" | "timeout_seconds" | "degraded_after_ms" | "is_public";
export type MonitorFormValues = Partial<Record<MonitorFormField, string>>;
export type MonitorFormErrors = Partial<Record<MonitorFormField, string>>;

export type MonitorInputResult =
	| { ok: true; value: Required<CreateMonitorInput> }
	| { ok: false; errors: MonitorFormErrors };

export function parseMonitorInput(values: MonitorFormValues): MonitorInputResult {
	const errors: MonitorFormErrors = {};

	const rawUrl = values.url?.trim() ?? "";
	let url = "";
	try {
		const parsed = new URL(rawUrl);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			errors.url = "Use an http:// or https:// address.";
		} else {
			url = parsed.toString();
		}
	} catch {
		errors.url = rawUrl ? "This is not a valid URL. Include the scheme, e.g. https://example.com/health." : "Enter the URL to monitor.";
	}
	if (url.length > 500) errors.url = "URL must be 500 characters or fewer.";

	const name = values.name?.trim() || (url ? new URL(url).host : "");
	if (name.length > 100) errors.name = "Name must be 100 characters or fewer.";

	const method = (values.method?.toUpperCase() || "GET") as HttpMethod;
	if (!httpMethods.includes(method)) errors.method = `Method must be one of ${httpMethods.join(", ")}.`;

	const expectedStatus = readInteger(values.expected_status, 200);
	if (expectedStatus === null || expectedStatus < 100 || expectedStatus > 599) {
		errors.expected_status = "Expected status must be an HTTP code between 100 and 599.";
	}

	const intervalSeconds = readInteger(values.interval_seconds, 60);
	if (intervalSeconds === null || intervalSeconds < 60 || intervalSeconds > 86400) {
		errors.interval_seconds = "Interval must be between 60 seconds and 24 hours.";
	}

	const timeoutSeconds = readInteger(values.timeout_seconds, 10);
	if (timeoutSeconds === null || timeoutSeconds < 1 || timeoutSeconds > 30) {
		errors.timeout_seconds = "Timeout must be between 1 and 30 seconds.";
	}

	const degradedAfterMs = readInteger(values.degraded_after_ms, 3000);
	if (degradedAfterMs === null || degradedAfterMs < 100 || degradedAfterMs > 30000) {
		errors.degraded_after_ms = "Slow threshold must be between 100 and 30000 ms.";
	}

	if (Object.keys(errors).length > 0) return { ok: false, errors };

	return {
		ok: true,
		value: {
			name,
			url,
			method,
			expectedStatus: expectedStatus!,
			intervalSeconds: intervalSeconds!,
			timeoutSeconds: timeoutSeconds!,
			degradedAfterMs: degradedAfterMs!,
			// A checkbox: present ("on") when ticked, absent when not. Defaults to public.
			isPublic: values.is_public === undefined || values.is_public === "on" || values.is_public === "true",
		},
	};
}

export function readMonitorForm(formData: FormData): MonitorFormValues {
	const fields: MonitorFormField[] = ["name", "url", "method", "expected_status", "interval_seconds", "timeout_seconds", "degraded_after_ms", "is_public"];
	return Object.fromEntries(fields.map((field) => [field, formData.get(field)?.toString() ?? ""]));
}

function readInteger(raw: string | undefined, fallback: number): number | null {
	if (raw === undefined || raw.trim() === "") return fallback;
	const value = Number(raw);
	return Number.isInteger(value) ? value : null;
}
