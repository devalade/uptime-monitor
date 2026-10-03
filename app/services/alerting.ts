/**
 * Alerting service for uptime incident notifications.
 * Sends each alert to every channel that applies (email and webhook from the environment,
 * plus webhook, Telegram, PagerDuty, Pushover, Opsgenie, Twilio SMS and email channels added on
 * the dashboard). A channel that fails is logged and never stops the others or the check that
 * triggered it.
 */

import { Mailer } from "@sdxc/mail";
import { eq } from "remix/data-table";
import type { AppDatabase } from "~/app/contracts/database";
import type { Transport } from "~/app/contracts/transport";
import { alertChannels, type SelectAlertChannel, type SelectMonitor } from "~/database/schema";
import { logger } from "~/bootstrap/logger";

const DELIVERY_TIMEOUT_MS = 5000;

export interface EmailAlerts {
	transport: Transport;
	from: string;
	to: string;
}

/** Sends email from the Worker: the send_email binding and a sender address. */
export interface MailSender {
	transport: Transport;
	from: string;
}

/** Channels and services configured through the Worker environment. */
export interface AlertSettings {
	email?: EmailAlerts;
	/** Discord, Slack, ntfy.sh, Teams and Google Chat URLs get their native format; anything else gets JSON. */
	webhookUrl?: string;
	/** Lets dashboard email channels and status page subscribers receive mail. */
	mailer?: MailSender;
	/** Public origin of this app, for links in emails. */
	publicUrl?: string;
}

/** Ids of the environment channels, so a monitor can pick them like any other channel. */
export const ENV_EMAIL_CHANNEL_ID = "env-email";
export const ENV_WEBHOOK_CHANNEL_ID = "env-webhook";

export type AlertChannel =
	| { id: string; name: string; kind: "email"; email: EmailAlerts }
	| { id: string; name: string; kind: "webhook"; url: string }
	| { id: string; name: string; kind: "telegram"; botToken: string; chatId: string }
	| { id: string; name: string; kind: "pagerduty"; routingKey: string }
	| { id: string; name: string; kind: "pushover"; token: string; user: string }
	| { id: string; name: string; kind: "opsgenie"; apiKey: string; region: "us" | "eu" }
	| { id: string; name: string; kind: "twilio"; accountSid: string; authToken: string; from: string; to: string };

export type AlertKind =
	| "down"
	| "recovered"
	| "reminder"
	| "degraded"
	| "normal"
	| "cert_expiring"
	| "cert_renewed"
	| "domain_expiring"
	| "domain_renewed";

/** Alerts that open a problem; the rest close one. */
const problemKinds = new Set<AlertKind>(["down", "reminder", "degraded", "cert_expiring", "domain_expiring"]);

/** Problems that close each other share a family, e.g. a PagerDuty dedup key. */
function alertFamily(kind: AlertKind): "status" | "slow" | "cert" | "domain" {
	if (kind === "degraded" || kind === "normal") return "slow";
	if (kind === "cert_expiring" || kind === "cert_renewed") return "cert";
	if (kind === "domain_expiring" || kind === "domain_renewed") return "domain";
	return "status";
}

export interface IncidentAlertPayload {
	monitor: Pick<SelectMonitor, "id" | "name" | "url">;
	previousStatus: string | null;
	currentStatus: string;
	reason: string;
	timestamp: number;
	/** A repeat of the DOWN alert while the outage lasts. */
	isReminder?: boolean;
	/** For alerts other than down / reminder / recovered. */
	kind?: AlertKind;
	/** Marks alerts sent from the "Send test alert" buttons. */
	isTest?: boolean;
}

export interface AlertDelivery {
	channel: string;
	ok: boolean;
	error?: string;
}

/* ---------- Which channels apply ---------- */

export function envChannels(settings?: AlertSettings): AlertChannel[] {
	const channels: AlertChannel[] = [];
	if (settings?.email) channels.push({ id: ENV_EMAIL_CHANNEL_ID, name: "email", kind: "email", email: settings.email });
	if (settings?.webhookUrl) channels.push({ id: ENV_WEBHOOK_CHANNEL_ID, name: "webhook", kind: "webhook", url: settings.webhookUrl });
	return channels;
}

/** Every channel that can receive alerts: the environment ones, then the enabled dashboard ones. */
export async function loadAlertChannels(db: AppDatabase, settings?: AlertSettings): Promise<AlertChannel[]> {
	const rows = await db.findMany(alertChannels, {
		where: eq(alertChannels.is_enabled, true),
		orderBy: [["created_at", "asc"]],
	});
	return [...envChannels(settings), ...rows.flatMap((row) => toAlertChannel(row, settings) ?? [])];
}

/** The channel a dashboard row describes, or null when its settings are incomplete. */
export function toAlertChannel(row: SelectAlertChannel, settings?: AlertSettings): AlertChannel | null {
	const config = parseJsonObject(row.config);
	const text = (key: string) => (typeof config[key] === "string" ? (config[key] as string) : "");

	if (row.type === "webhook" && text("url").startsWith("https://")) {
		return { id: row.id, name: row.name, kind: "webhook", url: text("url") };
	}
	if (row.type === "telegram" && text("botToken") && text("chatId")) {
		return { id: row.id, name: row.name, kind: "telegram", botToken: text("botToken"), chatId: text("chatId") };
	}
	if (row.type === "pagerduty" && text("routingKey")) {
		return { id: row.id, name: row.name, kind: "pagerduty", routingKey: text("routingKey") };
	}
	if (row.type === "pushover" && text("token") && text("user")) {
		return { id: row.id, name: row.name, kind: "pushover", token: text("token"), user: text("user") };
	}
	if (row.type === "opsgenie" && text("apiKey")) {
		return { id: row.id, name: row.name, kind: "opsgenie", apiKey: text("apiKey"), region: text("region") === "eu" ? "eu" : "us" };
	}
	if (row.type === "twilio" && text("accountSid") && text("authToken") && text("from") && text("to")) {
		return {
			id: row.id,
			name: row.name,
			kind: "twilio",
			accountSid: text("accountSid"),
			authToken: text("authToken"),
			from: text("from"),
			to: text("to"),
		};
	}
	if (row.type === "email" && text("to") && settings?.mailer) {
		return { id: row.id, name: row.name, kind: "email", email: { ...settings.mailer, to: text("to") } };
	}
	return null;
}

/** A monitor without a selection alerts every channel; otherwise only the ones it picked. */
export function channelsForMonitor(channels: AlertChannel[], alertChannelIds: string | null): AlertChannel[] {
	const selected = parseIdList(alertChannelIds);
	return selected === null ? channels : channels.filter((channel) => selected.includes(channel.id));
}

export function parseIdList(json: string | null): string[] | null {
	if (json === null || json === "") return null;
	try {
		const value: unknown = JSON.parse(json);
		return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : null;
	} catch {
		return null;
	}
}

/**
 * Sends an alert about one monitor to the channels it uses.
 */
export async function notifyMonitor(
	db: AppDatabase,
	settings: AlertSettings | undefined,
	monitor: Pick<SelectMonitor, "id" | "name" | "url" | "alert_channel_ids">,
	payload: IncidentAlertPayload,
): Promise<AlertDelivery[]> {
	const channels = channelsForMonitor(await loadAlertChannels(db, settings), monitor.alert_channel_ids);
	return sendAlert(channels, payload);
}

/** Sends to the environment channels only. */
export function sendIncidentAlert(settings: AlertSettings, payload: IncidentAlertPayload): Promise<AlertDelivery[]> {
	return sendAlert(envChannels(settings), payload);
}

export function sendAlert(channels: AlertChannel[], payload: IncidentAlertPayload): Promise<AlertDelivery[]> {
	return Promise.all(channels.map((channel) => deliver(channel, payload)));
}

/** What the "Test" buttons send. */
export function testAlertPayload(origin: string): IncidentAlertPayload {
	return {
		monitor: { id: "test", name: "Test alert", url: origin },
		previousStatus: "up",
		currentStatus: "down",
		reason: "This is a test alert from your uptime monitor. No action needed.",
		timestamp: Date.now(),
		isTest: true,
	};
}

/* ---------- Message formats ---------- */

export function alertKind(payload: IncidentAlertPayload): AlertKind {
	if (payload.kind) return payload.kind;
	if (payload.currentStatus !== "down") return "recovered";
	return payload.isReminder ? "reminder" : "down";
}

const alertLabels: Record<AlertKind, string> = {
	down: "🚨 DOWN",
	reminder: "⏰ STILL DOWN",
	recovered: "✅ RECOVERED",
	degraded: "🐢 SLOW",
	normal: "✅ BACK TO NORMAL",
	cert_expiring: "⚠️ CERTIFICATE EXPIRING",
	cert_renewed: "✅ CERTIFICATE RENEWED",
	domain_expiring: "⚠️ DOMAIN EXPIRING",
	domain_renewed: "✅ DOMAIN RENEWED",
};

export function describeAlert(payload: IncidentAlertPayload): { isDown: boolean; title: string; body: string } {
	const kind = alertKind(payload);
	const label = alertLabels[kind];
	const title = `${payload.isTest ? "[TEST] " : ""}${label}: ${payload.monitor.name}`;
	const body = [
		payload.monitor.url ? `URL: ${payload.monitor.url}` : "",
		alertFamily(kind) === "status" || alertFamily(kind) === "slow"
			? `Status: ${payload.currentStatus.toUpperCase()} (was ${payload.previousStatus ? payload.previousStatus.toUpperCase() : "UNKNOWN"})`
			: "",
		`Reason: ${payload.reason}`,
		`Time: ${new Date(payload.timestamp).toISOString()}`,
	]
		.filter(Boolean)
		.join("\n");
	return { isDown: problemKinds.has(kind), title, body };
}

const webhookEvents: Record<AlertKind, string> = {
	down: "monitor.down",
	reminder: "monitor.still_down",
	recovered: "monitor.recovered",
	degraded: "monitor.degraded",
	normal: "monitor.normal",
	cert_expiring: "monitor.certificate_expiring",
	cert_renewed: "monitor.certificate_renewed",
	domain_expiring: "monitor.domain_expiring",
	domain_renewed: "monitor.domain_renewed",
};

/**
 * Shapes the webhook request for the service behind the URL.
 */
export function buildWebhookRequest(webhookUrl: string, payload: IncidentAlertPayload): { url: string; init: RequestInit } {
	const { isDown, title, body } = describeAlert(payload);
	const host = new URL(webhookUrl).hostname;

	if (host === "discord.com" || host === "discordapp.com") {
		return { url: webhookUrl, init: postJson({ content: `**${title}**\n${body}`.slice(0, 2000) }) };
	}
	if (host === "hooks.slack.com") {
		return { url: webhookUrl, init: postJson({ text: `*${title}*\n${body}` }) };
	}
	if (host === "chat.googleapis.com") {
		return { url: webhookUrl, init: postJson({ text: `*${title}*\n${body}` }) };
	}
	if (isTeamsWebhook(host)) {
		// Teams workflows ("Post to a channel when a webhook request is received") take an Adaptive Card.
		return {
			url: webhookUrl,
			init: postJson({
				type: "message",
				attachments: [
					{
						contentType: "application/vnd.microsoft.card.adaptive",
						content: {
							type: "AdaptiveCard",
							$schema: "http://adaptivecards.io/schemas/adaptive-card.json",
							version: "1.4",
							body: [
								{ type: "TextBlock", text: title, weight: "Bolder", size: "Medium", wrap: true, color: isDown ? "Attention" : "Good" },
								{ type: "TextBlock", text: body.replace(/\n/g, "\n\n"), wrap: true },
							],
						},
					},
				],
			}),
		};
	}
	if (host === "ntfy.sh") {
		return {
			url: webhookUrl,
			init: {
				method: "POST",
				headers: {
					Title: encodeHeader(title),
					Priority: isDown ? "high" : "default",
					Tags: isDown ? "rotating_light" : "white_check_mark",
				},
				body,
			},
		};
	}

	return {
		url: webhookUrl,
		init: postJson({
			event: webhookEvents[alertKind(payload)],
			test: Boolean(payload.isTest),
			monitor: payload.monitor,
			status: payload.currentStatus,
			previousStatus: payload.previousStatus,
			reason: payload.reason,
			timestamp: new Date(payload.timestamp).toISOString(),
			text: `${title}\n${body}`,
		}),
	};
}

export function buildTelegramRequest(
	channel: { botToken: string; chatId: string },
	payload: IncidentAlertPayload,
): { url: string; init: RequestInit } {
	const { title, body } = describeAlert(payload);
	return {
		url: `https://api.telegram.org/bot${channel.botToken}/sendMessage`,
		init: postJson({ chat_id: channel.chatId, text: `${title}\n${body}`, disable_web_page_preview: true }),
	};
}

function isTeamsWebhook(host: string): boolean {
	return host.endsWith(".webhook.office.com") || host.endsWith(".logic.azure.com") || host.endsWith(".powerplatform.com");
}

/**
 * PagerDuty Events API v2. One dedup key per monitor and problem family, so DOWN, reminders
 * and RECOVERED all land on the same PagerDuty incident.
 */
export function buildPagerDutyRequests(
	channel: { routingKey: string },
	payload: IncidentAlertPayload,
): { url: string; init: RequestInit }[] {
	const { isDown, title } = describeAlert(payload);
	const url = "https://events.pagerduty.com/v2/enqueue";
	const family = alertFamily(alertKind(payload));
	const dedupKey = `uptime-monitor-${payload.monitor.id}${family === "status" ? "" : `-${family}`}`;
	const trigger = {
		url,
		init: postJson({
			routing_key: channel.routingKey,
			event_action: "trigger",
			dedup_key: dedupKey,
			payload: {
				summary: `${title} — ${payload.reason}`.slice(0, 1024),
				source: payload.monitor.url || payload.monitor.name,
				severity: payload.isTest ? "info" : family === "status" ? "critical" : "warning",
				timestamp: new Date(payload.timestamp).toISOString(),
			},
		}),
	};
	const resolve = {
		url,
		init: postJson({ routing_key: channel.routingKey, event_action: "resolve", dedup_key: dedupKey }),
	};

	// A test opens and closes a PagerDuty incident straight away, so nobody stays paged.
	if (payload.isTest) return [trigger, resolve];
	return [isDown ? trigger : resolve];
}

export function buildPushoverRequest(channel: { token: string; user: string }, payload: IncidentAlertPayload): { url: string; init: RequestInit } {
	const { isDown, title, body } = describeAlert(payload);
	return {
		url: "https://api.pushover.net/1/messages.json",
		init: postJson({
			token: channel.token,
			user: channel.user,
			title: title.slice(0, 250),
			message: body.slice(0, 1024),
			priority: isDown && alertFamily(alertKind(payload)) === "status" ? 1 : 0,
			url: payload.monitor.url || undefined,
		}),
	};
}

/**
 * Opsgenie Alert API: problems create an alert, keyed by an alias per monitor and family;
 * the matching resolution closes it.
 */
export function buildOpsgenieRequest(
	channel: { apiKey: string; region: "us" | "eu" },
	payload: IncidentAlertPayload,
): { url: string; init: RequestInit } {
	const { isDown, title, body } = describeAlert(payload);
	const base = channel.region === "eu" ? "https://api.eu.opsgenie.com/v2/alerts" : "https://api.opsgenie.com/v2/alerts";
	const family = alertFamily(alertKind(payload));
	const alias = `uptime-monitor-${payload.monitor.id}-${payload.isTest ? "test" : family}`;
	const headers = { "Content-Type": "application/json", Authorization: `GenieKey ${channel.apiKey}` };

	if (!isDown && !payload.isTest) {
		return {
			url: `${base}/${encodeURIComponent(alias)}/close?identifierType=alias`,
			init: { method: "POST", headers, body: JSON.stringify({ source: "uptime-monitor", note: body }) },
		};
	}
	return {
		url: base,
		init: {
			method: "POST",
			headers,
			body: JSON.stringify({
				message: title.slice(0, 130),
				alias,
				description: body,
				source: "uptime-monitor",
				priority: payload.isTest ? "P5" : family === "status" ? "P1" : "P3",
			}),
		},
	};
}

export function buildTwilioRequest(
	channel: { accountSid: string; authToken: string; from: string; to: string },
	payload: IncidentAlertPayload,
): { url: string; init: RequestInit } {
	const { title } = describeAlert(payload);
	const text = `${title} — ${payload.reason}`.slice(0, 320);
	return {
		url: `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(channel.accountSid)}/Messages.json`,
		init: {
			method: "POST",
			headers: {
				Authorization: `Basic ${btoa(`${channel.accountSid}:${channel.authToken}`)}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({ To: channel.to, From: channel.from, Body: text }).toString(),
		},
	};
}

/* ---------- Delivery ---------- */

async function sendToChannel(channel: AlertChannel, payload: IncidentAlertPayload): Promise<void> {
	switch (channel.kind) {
		case "email":
			return sendEmailAlert(channel.email, payload);
		case "webhook": {
			const { url, init } = buildWebhookRequest(channel.url, payload);
			return post(url, init, "Webhook");
		}
		case "telegram": {
			const { url, init } = buildTelegramRequest(channel, payload);
			return post(url, init, "Telegram");
		}
		case "pagerduty":
			for (const { url, init } of buildPagerDutyRequests(channel, payload)) await post(url, init, "PagerDuty");
			return;
		case "pushover": {
			const { url, init } = buildPushoverRequest(channel, payload);
			return post(url, init, "Pushover");
		}
		case "opsgenie": {
			const { url, init } = buildOpsgenieRequest(channel, payload);
			return post(url, init, "Opsgenie");
		}
		case "twilio": {
			const { url, init } = buildTwilioRequest(channel, payload);
			return post(url, init, "Twilio");
		}
	}
}

async function post(url: string, init: RequestInit, service: string): Promise<void> {
	const response = await fetch(url, { ...init, signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS) });
	if (!response.ok) {
		throw new Error(`${service} responded with HTTP ${response.status}`);
	}
}

async function sendEmailAlert(email: EmailAlerts, payload: IncidentAlertPayload): Promise<void> {
	const { title, body } = describeAlert(payload);
	const mailer = new Mailer({ transport: email.transport, from: { email: email.from } });
	const result = await mailer.send({ to: { email: email.to }, subject: title, text: body });
	if (result.status === "failure") {
		throw new Error(result.error?.message || "Mail delivery rejected");
	}
}

async function deliver(channel: AlertChannel, payload: IncidentAlertPayload): Promise<AlertDelivery> {
	try {
		await sendToChannel(channel, payload);
		const log = logger.open("job", { monitorId: payload.monitor.id, status: payload.currentStatus, channel: channel.name });
		log.note("Incident notification dispatched");
		log.emit();
		return { channel: channel.name, ok: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const log = logger.open("job", { monitorId: payload.monitor.id, channel: channel.name, error: message });
		log.note("Failed to dispatch incident notification");
		log.emit();
		return { channel: channel.name, ok: false, error: message };
	}
}

function postJson(data: unknown): RequestInit {
	return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
}

function parseJsonObject(json: string): Record<string, unknown> {
	try {
		const value: unknown = JSON.parse(json);
		return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

/** HTTP header values must be Latin-1; ntfy decodes RFC 2047 encoded titles. */
function encodeHeader(value: string): string {
	return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(value)))}?=`;
}
