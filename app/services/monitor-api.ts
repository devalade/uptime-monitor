/**
 * Monitor input and output shared by the MCP tools and the REST API, so both accept the same
 * fields and run the same validation as the dashboard form.
 */

import { parseMonitorInput, settingsToFormValues, type MonitorFormValues, type MonitorInputResult } from "~/app/services/monitor-input";
import { monitorSettings } from "~/app/services/monitor-service";
import type { SelectMonitor } from "~/database/schema";

/** Monitor settings as API clients send them (camelCase, all optional on update). */
export interface MonitorApiInput {
	name?: string;
	type?: string;
	/** URL for http, host:port for tcp, hostname for dns. */
	url?: string;
	method?: string;
	expectedStatuses?: string;
	requestHeaders?: string;
	requestBody?: string;
	keyword?: string;
	keywordMode?: string;
	jsonPath?: string;
	jsonExpected?: string;
	dnsRecordType?: string;
	dnsExpected?: string;
	intervalSeconds?: number;
	timeoutSeconds?: number;
	degradedAfterMs?: number;
	graceSeconds?: number;
	failureThreshold?: number;
	reminderMinutes?: number;
	expiryWarningDays?: number;
	alertOnDegraded?: boolean;
	isPublic?: boolean;
	/** null sends to every channel. */
	alertChannelIds?: string[] | null;
}

/** Lays the input over existing form values, so the form validation applies to API clients too. */
export function apiInputToFormValues(input: MonitorApiInput, base: MonitorFormValues = {}): MonitorFormValues {
	const values: MonitorFormValues = { alert_mode: "all", ...base };
	const set = (field: keyof MonitorFormValues, value: string | number | boolean | undefined) => {
		if (value !== undefined && value !== null) values[field] = String(value);
	};
	set("name", input.name);
	set("type", input.type);
	set("method", input.method);
	set("expected_statuses", input.expectedStatuses);
	set("request_headers", input.requestHeaders);
	set("request_body", input.requestBody);
	set("keyword", input.keyword);
	set("keyword_mode", input.keywordMode);
	set("json_path", input.jsonPath);
	set("json_expected", input.jsonExpected);
	set("dns_record_type", input.dnsRecordType);
	set("dns_expected", input.dnsExpected);
	set("interval_seconds", input.intervalSeconds);
	set("timeout_seconds", input.timeoutSeconds);
	set("degraded_after_ms", input.degradedAfterMs);
	set("grace_seconds", input.graceSeconds);
	set("failure_threshold", input.failureThreshold);
	set("reminder_minutes", input.reminderMinutes);
	set("expiry_warning_days", input.expiryWarningDays);
	if (input.alertOnDegraded !== undefined) values.alert_on_degraded = input.alertOnDegraded ? "on" : "";
	if (input.isPublic !== undefined) values.is_public = input.isPublic ? "on" : "";
	if (input.url !== undefined) {
		values.url = input.url;
		values.tcp_target = input.url;
		values.dns_host = input.url;
	}
	if (input.alertChannelIds !== undefined) {
		values.alert_mode = input.alertChannelIds === null ? "all" : "selected";
		values.alert_channels = (input.alertChannelIds ?? []).join(",");
	}
	return values;
}

/** Validates a new monitor from API input. */
export function parseNewMonitor(input: MonitorApiInput): MonitorInputResult {
	return parseMonitorInput(apiInputToFormValues(input));
}

/** Validates changes to a monitor: given fields replace its current settings. */
export function parseMonitorChanges(monitor: SelectMonitor, input: MonitorApiInput): MonitorInputResult {
	return parseMonitorInput(apiInputToFormValues(input, settingsToFormValues(monitorSettings(monitor))));
}

export function summarizeMonitor(m: SelectMonitor) {
	return {
		id: m.id,
		name: m.name,
		type: m.type,
		target: m.type === "heartbeat" ? null : m.url,
		method: m.type === "http" ? m.method : undefined,
		status: m.is_enabled ? (m.last_status ?? "pending") : "paused",
		lastCheckedAt: m.last_checked_at ? new Date(m.last_checked_at).toISOString() : null,
		lastResponseTimeMs: m.last_response_time_ms,
		isEnabled: Boolean(m.is_enabled),
		isPublic: Boolean(m.is_public),
		certificateExpiresAt: m.cert_expires_at ? new Date(m.cert_expires_at).toISOString() : undefined,
		domainExpiresAt: m.domain_expires_at ? new Date(m.domain_expires_at).toISOString() : undefined,
	};
}
