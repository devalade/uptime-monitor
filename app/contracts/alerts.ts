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
}): AlertSettings | undefined {
	const settings: AlertSettings = {};

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

	return settings.email || settings.webhookUrl ? settings : undefined;
}
