/**
 * Validation for monitor settings coming from the web form or the MCP tools.
 * Returns field-level errors instead of throwing so callers can show them to the user.
 */

import { httpMethods, keywordModes, monitorTypes, type MonitorType } from "~/database/schema";
import { parseHeaderLines, parseJsonPath, parseStatusSpec } from "~/app/services/checker";
import { defaultMonitorSettings, type MonitorSettings } from "~/app/services/monitor-service";

/** Cron fires once a minute, so shorter intervals cannot be honoured. */
export const intervalOptions = [
	{ seconds: 60, label: "Every minute" },
	{ seconds: 120, label: "Every 2 minutes" },
	{ seconds: 300, label: "Every 5 minutes" },
	{ seconds: 600, label: "Every 10 minutes" },
	{ seconds: 1800, label: "Every 30 minutes" },
	{ seconds: 3600, label: "Every hour" },
	{ seconds: 21600, label: "Every 6 hours" },
	{ seconds: 43200, label: "Every 12 hours" },
	{ seconds: 86400, label: "Every day" },
	{ seconds: 604800, label: "Every week (heartbeats)" },
] as const;

export const monitorTypeLabels: Record<MonitorType, string> = {
	http: "HTTP(S) — request a URL",
	tcp: "TCP port — open a connection",
	heartbeat: "Heartbeat — your job pings us",
};

const MAX_PROBE_INTERVAL = 86400;
const MAX_HEARTBEAT_INTERVAL = 30 * 86400;

export type MonitorFormField =
	| "type"
	| "name"
	| "url"
	| "tcp_target"
	| "method"
	| "expected_statuses"
	| "request_headers"
	| "request_body"
	| "keyword"
	| "keyword_mode"
	| "json_path"
	| "json_expected"
	| "interval_seconds"
	| "timeout_seconds"
	| "degraded_after_ms"
	| "grace_seconds"
	| "failure_threshold"
	| "reminder_minutes"
	| "alert_mode"
	| "alert_channels"
	| "is_public";
export type MonitorFormValues = Partial<Record<MonitorFormField, string>>;
export type MonitorFormErrors = Partial<Record<MonitorFormField, string>>;

export const monitorFormFields: MonitorFormField[] = [
	"type",
	"name",
	"url",
	"tcp_target",
	"method",
	"expected_statuses",
	"request_headers",
	"request_body",
	"keyword",
	"keyword_mode",
	"json_path",
	"json_expected",
	"interval_seconds",
	"timeout_seconds",
	"degraded_after_ms",
	"grace_seconds",
	"failure_threshold",
	"reminder_minutes",
	"alert_mode",
	"alert_channels",
	"is_public",
];

export type MonitorInputResult = { ok: true; value: MonitorSettings } | { ok: false; errors: MonitorFormErrors };

export function parseMonitorInput(values: MonitorFormValues): MonitorInputResult {
	const errors: MonitorFormErrors = {};
	const defaults = defaultMonitorSettings;

	const type = monitorTypes.find((t) => t === (values.type || "http"));
	if (!type) errors.type = `Type must be one of ${monitorTypes.join(", ")}.`;

	// Target
	let url = "";
	let defaultName = "";
	if (type === "http") {
		const rawUrl = values.url?.trim() ?? "";
		try {
			const parsed = new URL(rawUrl);
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				errors.url = "Use an http:// or https:// address.";
			} else {
				url = parsed.toString();
				defaultName = parsed.host;
			}
		} catch {
			errors.url = rawUrl ? "This is not a valid URL. Include the scheme, e.g. https://example.com/health." : "Enter the URL to monitor.";
		}
		if (url.length > 500) errors.url = "URL must be 500 characters or fewer.";
	} else if (type === "tcp") {
		const target = values.tcp_target?.trim() ?? "";
		if (!isValidTcpTarget(target)) {
			errors.tcp_target = target ? "Use host:port, e.g. db.example.com:5432." : "Enter the host and port to connect to.";
		} else {
			url = target;
			defaultName = target;
		}
	} else if (type === "heartbeat") {
		defaultName = "Heartbeat";
	}

	const name = values.name?.trim() || defaultName;
	if (name.length > 100) errors.name = "Name must be 100 characters or fewer.";

	// HTTP request and assertions
	const requestedMethod = values.method?.toUpperCase() || defaults.method;
	const method = httpMethods.find((m) => m === requestedMethod);
	if (!method) errors.method = `Method must be one of ${httpMethods.join(", ")}.`;

	const expectedStatuses = values.expected_statuses?.trim() || defaults.expectedStatuses;
	if (type === "http" && !parseStatusSpec(expectedStatuses)) {
		errors.expected_statuses = "Use status codes between 100 and 599, ranges or classes, e.g. 200, 200-299 or 2xx.";
	}

	const requestHeaders = optional(values.request_headers);
	if (type === "http" && requestHeaders) {
		const parsed = parseHeaderLines(requestHeaders);
		if (requestHeaders.length > 4000) errors.request_headers = "Headers must be 4000 characters or fewer.";
		else if (!parsed.ok) errors.request_headers = `Use one "Name: value" header per line. Check: ${parsed.line.slice(0, 60)}`;
	}

	const requestBody = optional(values.request_body);
	if (type === "http" && requestBody) {
		if (requestBody.length > 10000) errors.request_body = "Body must be 10000 characters or fewer.";
		else if (method === "GET" || method === "HEAD") errors.request_body = `${method} requests cannot send a body. Use POST, PUT or PATCH.`;
	}

	const keyword = optional(values.keyword);
	const keywordMode = keywordModes.find((m) => m === (values.keyword_mode || defaults.keywordMode));
	if (!keywordMode) errors.keyword_mode = "Choose whether the response must contain the keyword or not.";
	if (type === "http" && keyword && keyword.length > 200) errors.keyword = "Keyword must be 200 characters or fewer.";

	const jsonPath = optional(values.json_path);
	const jsonExpected = values.json_expected?.trim() || null;
	if (type === "http" && jsonPath && (jsonPath.length > 200 || !parseJsonPath(jsonPath))) {
		errors.json_path = "Use a path such as $.status or $.data.items[0].state.";
	}
	if (type === "http" && jsonExpected && jsonExpected.length > 200) errors.json_expected = "Expected value must be 200 characters or fewer.";

	if (type === "http" && method === "HEAD" && (keyword || jsonPath)) {
		errors.method = "HEAD responses have no body. Use GET to check the response content.";
	}

	// Timing
	const intervalSeconds = readInteger(values.interval_seconds, defaults.intervalSeconds);
	const maxInterval = type === "heartbeat" ? MAX_HEARTBEAT_INTERVAL : MAX_PROBE_INTERVAL;
	if (intervalSeconds === null || intervalSeconds < 60 || intervalSeconds > maxInterval) {
		errors.interval_seconds =
			type === "heartbeat" ? "Expected period must be between 1 minute and 30 days." : "Interval must be between 60 seconds and 24 hours.";
	}

	const timeoutSeconds = readInteger(values.timeout_seconds, defaults.timeoutSeconds);
	if (timeoutSeconds === null || timeoutSeconds < 1 || timeoutSeconds > 30) {
		errors.timeout_seconds = "Timeout must be between 1 and 30 seconds.";
	}

	const degradedAfterMs = readInteger(values.degraded_after_ms, defaults.degradedAfterMs);
	if (degradedAfterMs === null || degradedAfterMs < 100 || degradedAfterMs > 30000) {
		errors.degraded_after_ms = "Slow threshold must be between 100 and 30000 ms.";
	}

	const graceSeconds = readInteger(values.grace_seconds, defaults.graceSeconds);
	if (graceSeconds === null || graceSeconds < 60 || graceSeconds > 86400) {
		errors.grace_seconds = "Grace period must be between 60 seconds and 24 hours.";
	}

	// Alerting
	const failureThreshold = readInteger(values.failure_threshold, defaults.failureThreshold);
	if (failureThreshold === null || failureThreshold < 1 || failureThreshold > 10) {
		errors.failure_threshold = "Use between 1 and 10 failed checks.";
	}

	const reminderMinutes = readInteger(values.reminder_minutes, defaults.reminderMinutes);
	if (reminderMinutes === null || reminderMinutes < 0 || reminderMinutes > 10080) {
		errors.reminder_minutes = "Reminders must be 0 (off) or up to 10080 minutes (a week).";
	}

	const selectedChannels = (values.alert_channels ?? "").split(",").map((id) => id.trim()).filter(Boolean);
	const alertChannelIds = values.alert_mode === "selected" ? selectedChannels : null;

	if (
		Object.keys(errors).length > 0 ||
		!type ||
		!method ||
		!keywordMode ||
		intervalSeconds === null ||
		timeoutSeconds === null ||
		degradedAfterMs === null ||
		graceSeconds === null ||
		failureThreshold === null ||
		reminderMinutes === null
	) {
		return { ok: false, errors };
	}

	const isHttp = type === "http";
	return {
		ok: true,
		value: {
			type,
			name,
			url,
			method,
			expectedStatuses,
			requestHeaders: isHttp ? requestHeaders : null,
			requestBody: isHttp ? requestBody : null,
			keyword: isHttp ? keyword : null,
			keywordMode,
			jsonPath: isHttp ? jsonPath : null,
			jsonExpected: isHttp && jsonPath ? jsonExpected : null,
			intervalSeconds,
			timeoutSeconds,
			degradedAfterMs,
			graceSeconds,
			failureThreshold,
			reminderMinutes,
			alertChannelIds,
			// A checkbox: present ("on") when ticked, absent when not. Defaults to public.
			isPublic: values.is_public === undefined || values.is_public === "on" || values.is_public === "true",
		},
	};
}

export function readMonitorForm(formData: FormData): MonitorFormValues {
	const values: MonitorFormValues = Object.fromEntries(
		monitorFormFields.map((field) => [field, formData.get(field)?.toString() ?? ""]),
	);
	values.alert_channels = formData.getAll("alert_channels").map(String).join(",");
	return values;
}

/** Form values that show a saved monitor's settings, for the edit dialog. */
export function settingsToFormValues(settings: MonitorSettings): MonitorFormValues {
	return {
		type: settings.type,
		name: settings.name,
		url: settings.type === "http" ? settings.url : "",
		tcp_target: settings.type === "tcp" ? settings.url : "",
		method: settings.method,
		expected_statuses: settings.expectedStatuses,
		request_headers: settings.requestHeaders ?? "",
		request_body: settings.requestBody ?? "",
		keyword: settings.keyword ?? "",
		keyword_mode: settings.keywordMode,
		json_path: settings.jsonPath ?? "",
		json_expected: settings.jsonExpected ?? "",
		interval_seconds: String(settings.intervalSeconds),
		timeout_seconds: String(settings.timeoutSeconds),
		degraded_after_ms: String(settings.degradedAfterMs),
		grace_seconds: String(settings.graceSeconds),
		failure_threshold: String(settings.failureThreshold),
		reminder_minutes: String(settings.reminderMinutes),
		alert_mode: settings.alertChannelIds === null ? "all" : "selected",
		alert_channels: (settings.alertChannelIds ?? []).join(","),
		is_public: settings.isPublic ? "on" : "",
	};
}

export function isValidTcpTarget(target: string): boolean {
	const match = target.match(/^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]+):(\d{1,5})$/);
	if (!match) return false;
	const port = Number(match[2]);
	const host = match[1];
	return port >= 1 && port <= 65535 && (host.startsWith("[") || /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/.test(host));
}

function optional(raw: string | undefined): string | null {
	const value = raw?.trim();
	return value ? value : null;
}

function readInteger(raw: string | undefined, fallback: number): number | null {
	if (raw === undefined || raw.trim() === "") return fallback;
	const value = Number(raw);
	return Number.isInteger(value) ? value : null;
}
