import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildWebhookRequest, sendIncidentAlert, type IncidentAlertPayload } from "~/app/services/alerting";
import { createAlertSettings } from "~/app/contracts/alerts";
import { stubFetch } from "./helpers";

const down: IncidentAlertPayload = {
	monitor: { id: "m1", name: "API", url: "https://api.test/health" },
	previousStatus: "up",
	currentStatus: "down",
	reason: "Expected HTTP 200 but received 500",
	timestamp: Date.UTC(2026, 9, 3, 12, 0, 0),
};

describe("webhook formats", () => {
	test("Discord gets a content message", () => {
		const { init } = buildWebhookRequest("https://discord.com/api/webhooks/1/abc", down);
		const body = JSON.parse(String(init.body));
		assert.deepEqual(Object.keys(body), ["content"]);
		assert.match(body.content, /DOWN.*API/);
		assert.match(body.content, /Expected HTTP 200 but received 500/);
	});

	test("Slack gets a text message", () => {
		const { init } = buildWebhookRequest("https://hooks.slack.com/services/T/B/x", down);
		assert.match(JSON.parse(String(init.body)).text, /DOWN.*API/);
	});

	test("ntfy.sh gets a plain-text body with title, priority and tags headers", () => {
		const { init } = buildWebhookRequest("https://ntfy.sh/my-topic", down);
		const headers = new Headers(init.headers);
		assert.match(String(init.body), /^URL: https:\/\/api\.test\/health/);
		assert.equal(headers.get("Priority"), "high");
		assert.equal(headers.get("Tags"), "rotating_light");
		assert.match(headers.get("Title")!, /^=\?UTF-8\?B\?/, "emoji title is header-safe");
	});

	test("any other URL gets structured JSON", () => {
		const { init } = buildWebhookRequest("https://example.test/hook", { ...down, currentStatus: "up", previousStatus: "down" });
		const body = JSON.parse(String(init.body));
		assert.equal(body.event, "monitor.recovered");
		assert.equal(body.monitor.id, "m1");
		assert.equal(body.timestamp, "2026-10-03T12:00:00.000Z");
	});
});

describe("delivery", () => {
	test("reports a failed webhook instead of throwing", async () => {
		stubFetch({ webhookUrl: "https://example.test/hook", webhookStatus: 404 });

		const deliveries = await sendIncidentAlert({ webhookUrl: "https://example.test/hook" }, down);

		assert.deepEqual(deliveries, [{ channel: "webhook", ok: false, error: "Webhook responded with HTTP 404" }]);
	});

	test("reports success per channel", async () => {
		const { webhooks } = stubFetch({ webhookUrl: "https://example.test/hook" });

		const deliveries = await sendIncidentAlert({ webhookUrl: "https://example.test/hook" }, { ...down, isTest: true });

		assert.deepEqual(deliveries, [{ channel: "webhook", ok: true }]);
		assert.equal(JSON.parse(webhooks[0].body).test, true);
	});
});

describe("alert settings from the environment", () => {
	test("nothing configured means alerts are off", () => {
		assert.equal(createAlertSettings({}), undefined);
	});

	test("a webhook URL alone turns alerts on", () => {
		assert.deepEqual(createAlertSettings({ ALERT_WEBHOOK_URL: "https://ntfy.sh/topic" }), { webhookUrl: "https://ntfy.sh/topic" });
	});

	test("a non-https webhook URL is ignored", () => {
		assert.equal(createAlertSettings({ ALERT_WEBHOOK_URL: "http://ntfy.sh/topic" }), undefined);
	});

	test("an alert email without the EMAIL binding is ignored", () => {
		assert.equal(createAlertSettings({ ALERT_EMAIL: "me@example.com" }), undefined);
	});
});
