/**
 * Alerting service for uptime incident notifications.
 * Sends each alert to every configured channel (email, webhook). A channel that fails is
 * logged and never stops the others or the check that triggered it.
 */

import { Mailer } from "@sdxc/mail";
import type { Transport } from "~/app/contracts/transport";
import type { SelectMonitor } from "~/database/schema";
import { logger } from "~/bootstrap/logger";

const WEBHOOK_TIMEOUT_MS = 5000;

export interface EmailAlerts {
	transport: Transport;
	from: string;
	to: string;
}

/** Where incident and recovery alerts go. At least one channel is set. */
export interface AlertSettings {
	email?: EmailAlerts;
	/** Discord, Slack and ntfy.sh URLs get their native format; anything else gets JSON. */
	webhookUrl?: string;
}

export interface IncidentAlertPayload {
	monitor: Pick<SelectMonitor, "id" | "name" | "url">;
	previousStatus: string | null;
	currentStatus: string;
	reason: string;
	timestamp: number;
	/** Marks alerts sent from the "Send test alert" button. */
	isTest?: boolean;
}

export interface AlertDelivery {
	channel: "email" | "webhook";
	ok: boolean;
	error?: string;
}

export async function sendIncidentAlert(alerts: AlertSettings, payload: IncidentAlertPayload): Promise<AlertDelivery[]> {
	const { email, webhookUrl } = alerts;
	const deliveries: Promise<AlertDelivery>[] = [];
	if (email) deliveries.push(deliver("email", payload, () => sendEmailAlert(email, payload)));
	if (webhookUrl) deliveries.push(deliver("webhook", payload, () => sendWebhookAlert(webhookUrl, payload)));
	return Promise.all(deliveries);
}

export function describeAlert(payload: IncidentAlertPayload): { isDown: boolean; title: string; body: string } {
	const isDown = payload.currentStatus === "down";
	const title = `${payload.isTest ? "[TEST] " : ""}${isDown ? "🚨 DOWN" : "✅ RECOVERED"}: ${payload.monitor.name}`;
	const body = [
		`URL: ${payload.monitor.url}`,
		`Status: ${payload.currentStatus.toUpperCase()} (was ${payload.previousStatus ? payload.previousStatus.toUpperCase() : "UNKNOWN"})`,
		`Reason: ${payload.reason}`,
		`Time: ${new Date(payload.timestamp).toISOString()}`,
	].join("\n");
	return { isDown, title, body };
}

/**
 * Shapes the webhook request for the service behind the URL.
 */
export function buildWebhookRequest(webhookUrl: string, payload: IncidentAlertPayload): { url: string; init: RequestInit } {
	const { isDown, title, body } = describeAlert(payload);
	const host = new URL(webhookUrl).hostname;
	const json = (data: unknown): RequestInit => ({
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	});

	if (host === "discord.com" || host === "discordapp.com") {
		return { url: webhookUrl, init: json({ content: `**${title}**\n${body}`.slice(0, 2000) }) };
	}
	if (host === "hooks.slack.com") {
		return { url: webhookUrl, init: json({ text: `*${title}*\n${body}` }) };
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
		init: json({
			event: isDown ? "monitor.down" : "monitor.recovered",
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

async function sendWebhookAlert(webhookUrl: string, payload: IncidentAlertPayload): Promise<void> {
	const { url, init } = buildWebhookRequest(webhookUrl, payload);
	const response = await fetch(url, { ...init, signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS) });
	if (!response.ok) {
		throw new Error(`Webhook responded with HTTP ${response.status}`);
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

async function deliver(
	channel: AlertDelivery["channel"],
	payload: IncidentAlertPayload,
	send: () => Promise<void>,
): Promise<AlertDelivery> {
	try {
		await send();
		const log = logger.open("job", { monitorId: payload.monitor.id, status: payload.currentStatus, channel });
		log.note("Incident notification dispatched");
		log.emit();
		return { channel, ok: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const log = logger.open("job", { monitorId: payload.monitor.id, channel, error: message });
		log.note("Failed to dispatch incident notification");
		log.emit();
		return { channel, ok: false, error: message };
	}
}

/** HTTP header values must be Latin-1; ntfy decodes RFC 2047 encoded titles. */
function encodeHeader(value: string): string {
	return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(value)))}?=`;
}
