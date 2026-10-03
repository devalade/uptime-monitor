/**
 * Builds alert settings from the Worker environment.
 * Each channel is on only when it is fully configured; with none, alerts are switched off
 * instead of being silently written to an in-memory transport.
 */

import { CloudflareTransport } from "@sdxc/mail/cloudflare";
import type { AlertSettings } from "~/app/services/alerting";

export function createAlertSettings(env: {
	EMAIL?: SendEmail;
	MAIL_FROM?: string;
	ALERT_EMAIL?: string;
	ALERT_WEBHOOK_URL?: string;
	APP_URL?: string;
}): AlertSettings | undefined {
	const settings: AlertSettings = {};

	// Email needs the send_email binding and a sender on a domain onboarded to Email Sending.
	if (env.EMAIL && env.MAIL_FROM) {
		settings.mailer = { transport: new CloudflareTransport(env.EMAIL), from: env.MAIL_FROM };
	}

	if (env.EMAIL && env.ALERT_EMAIL) {
		settings.email = {
			transport: new CloudflareTransport(env.EMAIL),
			from: env.MAIL_FROM ?? "alerts@uptime.local",
			to: env.ALERT_EMAIL,
		};
	}

	if (env.ALERT_WEBHOOK_URL?.startsWith("https://")) {
		settings.webhookUrl = env.ALERT_WEBHOOK_URL;
	}

	if (!settings.email && !settings.webhookUrl && !settings.mailer) return undefined;
	if (env.APP_URL?.startsWith("https://")) settings.publicUrl = env.APP_URL.replace(/\/+$/, "");
	return settings;
}
