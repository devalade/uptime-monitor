import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseMonitorInput } from "~/app/services/monitor-input";

describe("monitor input", () => {
	test("fills sensible defaults from just a URL", () => {
		const result = parseMonitorInput({ url: "https://api.example.com/health" });

		assert.ok(result.ok);
		assert.deepEqual(result.value, {
			type: "http",
			name: "api.example.com",
			url: "https://api.example.com/health",
			method: "GET",
			expectedStatuses: "200",
			requestHeaders: null,
			requestBody: null,
			keyword: null,
			keywordMode: "contains",
			jsonPath: null,
			jsonExpected: null,
			dnsRecordType: "A",
			dnsExpected: null,
			intervalSeconds: 60,
			timeoutSeconds: 10,
			degradedAfterMs: 3000,
			graceSeconds: 300,
			failureThreshold: 1,
			reminderMinutes: 0,
			alertChannelIds: null,
			expiryWarningDays: 14,
			alertOnDegraded: false,
			isPublic: true,
		});
	});

	test("rejects non-http URLs such as javascript:", () => {
		const result = parseMonitorInput({ url: "javascript:alert(1)" });
		assert.ok(!result.ok);
		assert.ok(result.errors.url);
		assert.match(result.errors.url, /http/);
	});

	test("reports every bad field at once", () => {
		const result = parseMonitorInput({
			url: "https://ok.example.com",
			method: "FOO",
			expected_statuses: "abc",
			interval_seconds: "5",
			timeout_seconds: "99",
			degraded_after_ms: "1",
		});

		assert.ok(!result.ok);
		assert.deepEqual(Object.keys(result.errors).sort(), [
			"degraded_after_ms",
			"expected_statuses",
			"interval_seconds",
			"method",
			"timeout_seconds",
		]);
	});

	test("an unticked visibility checkbox makes the monitor private", () => {
		const result = parseMonitorInput({ url: "https://ok.example.com", is_public: "" });
		assert.ok(result.ok);
		assert.equal(result.value.isPublic, false);
	});
});
