/**
 * Alert channels added from the dashboard: webhooks (Discord, Slack, ntfy.sh, Microsoft Teams,
 * Google Chat or any URL), Telegram, PagerDuty, Pushover, Opsgenie, Twilio SMS and email.
 * Environment channels are configured with secrets instead.
 */

import type { AppDatabase } from "~/app/contracts/database";
import { toAlertChannel, type AlertChannel, type AlertSettings } from "~/app/services/alerting";
import { alertChannels, alertChannelTypes, type AlertChannelType, type SelectAlertChannel } from "~/database/schema";

export const alertChannelTypeLabels: Record<AlertChannelType, string> = {
	webhook: "Webhook (Discord, Slack, Teams, Google Chat, ntfy.sh or JSON)",
	telegram: "Telegram",
	pagerduty: "PagerDuty",
	pushover: "Pushover",
	opsgenie: "Opsgenie",
	twilio: "SMS (Twilio)",
	email: "Email",
};

export type AlertChannelFormField =
	| "name"
	| "type"
	| "url"
	| "bot_token"
	| "chat_id"
	| "routing_key"
	| "pushover_token"
	| "pushover_user"
	| "opsgenie_key"
	| "opsgenie_region"
	| "twilio_sid"
	| "twilio_token"
	| "twilio_from"
	| "twilio_to"
	| "email_to";

const alertChannelFormFields: AlertChannelFormField[] = [
	"name",
	"type",
	"url",
	"bot_token",
	"chat_id",
	"routing_key",
	"pushover_token",
	"pushover_user",
	"opsgenie_key",
	"opsgenie_region",
	"twilio_sid",
	"twilio_token",
	"twilio_from",
	"twilio_to",
	"email_to",
];
export type AlertChannelFormValues = Partial<Record<AlertChannelFormField, string>>;
export type AlertChannelFormErrors = Partial<Record<AlertChannelFormField, string>>;

export type AlertChannelInputResult =
	| { ok: true; value: { name: string; type: AlertChannelType; config: Record<string, string> } }
	| { ok: false; errors: AlertChannelFormErrors };

export function readAlertChannelForm(formData: FormData): AlertChannelFormValues {
	return Object.fromEntries(alertChannelFormFields.map((field) => [field, formData.get(field)?.toString().trim() ?? ""]));
}

/** `canEmail` is false when no sender is configured, so email channels could never deliver. */
export function parseAlertChannelInput(values: AlertChannelFormValues, options: { canEmail?: boolean } = {}): AlertChannelInputResult {
	const errors: AlertChannelFormErrors = {};
	const type = alertChannelTypes.find((t) => t === values.type);
	if (!type) errors.type = "Pick a channel type.";

	const name = values.name?.trim() || (type ? type[0].toUpperCase() + type.slice(1) : "");
	if (name.length > 60) errors.name = "Name must be 60 characters or fewer.";

	const config: Record<string, string> = {};
	if (type === "webhook") {
		const url = values.url ?? "";
		try {
			if (new URL(url).protocol !== "https:") errors.url = "Use an https:// URL.";
			else config.url = url;
		} catch {
			errors.url = "Enter the webhook URL.";
		}
	}
	if (type === "telegram") {
		if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(values.bot_token ?? "")) errors.bot_token = "Paste the bot token from @BotFather, e.g. 123456:ABC-DEF…";
		else config.botToken = values.bot_token ?? "";
		if (!/^(-?\d+|@[A-Za-z0-9_]{4,})$/.test(values.chat_id ?? "")) errors.chat_id = "Enter a numeric chat id or a @channel name.";
		else config.chatId = values.chat_id ?? "";
	}
	if (type === "pagerduty") {
		if (!/^[A-Za-z0-9]{32}$/.test(values.routing_key ?? "")) errors.routing_key = "The integration (routing) key is 32 letters and digits.";
		else config.routingKey = values.routing_key ?? "";
	}
	if (type === "pushover") {
		if (!/^[A-Za-z0-9]{30}$/.test(values.pushover_token ?? "")) errors.pushover_token = "The application token is 30 letters and digits.";
		else config.token = values.pushover_token ?? "";
		if (!/^[A-Za-z0-9]{30}$/.test(values.pushover_user ?? "")) errors.pushover_user = "The user or group key is 30 letters and digits.";
		else config.user = values.pushover_user ?? "";
	}
	if (type === "opsgenie") {
		if (!/^[0-9a-fA-F-]{36}$/.test(values.opsgenie_key ?? "")) errors.opsgenie_key = "Paste the API key of an Opsgenie API integration.";
		else config.apiKey = values.opsgenie_key ?? "";
		config.region = values.opsgenie_region === "eu" ? "eu" : "us";
	}
	if (type === "twilio") {
		if (!/^AC[0-9a-fA-F]{32}$/.test(values.twilio_sid ?? "")) errors.twilio_sid = "The Account SID starts with AC followed by 32 characters.";
		else config.accountSid = values.twilio_sid ?? "";
		if (!/^[0-9a-fA-F]{32}$/.test(values.twilio_token ?? "")) errors.twilio_token = "The Auth Token is 32 characters.";
		else config.authToken = values.twilio_token ?? "";
		const phone = /^\+[1-9]\d{6,14}$/;
		if (!phone.test(values.twilio_from ?? "")) errors.twilio_from = "Use the international format of your Twilio number, e.g. +15551234567.";
		else config.from = values.twilio_from ?? "";
		if (!phone.test(values.twilio_to ?? "")) errors.twilio_to = "Use the international format, e.g. +22990000000.";
		else config.to = values.twilio_to ?? "";
	}
	if (type === "email") {
		if (!options.canEmail) errors.type = "Email needs the EMAIL binding and MAIL_FROM on a domain onboarded to Cloudflare Email Sending.";
		else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email_to ?? "")) errors.email_to = "Enter the address to send alerts to.";
		else config.to = values.email_to ?? "";
	}

	if (Object.keys(errors).length > 0 || !type) return { ok: false, errors };
	return { ok: true, value: { name, type, config } };
}

export async function createAlertChannel(
	db: AppDatabase,
	input: { name: string; type: AlertChannelType; config: Record<string, string> },
): Promise<SelectAlertChannel> {
	const now = Date.now();
	return db.create(
		alertChannels,
		{
			id: crypto.randomUUID(),
			name: input.name,
			type: input.type,
			config: JSON.stringify(input.config),
			is_enabled: true,
			created_at: now,
			updated_at: now,
		},
		{ returnRow: true },
	);
}

export async function listAlertChannelRows(db: AppDatabase): Promise<SelectAlertChannel[]> {
	return db.findMany(alertChannels, { orderBy: [["created_at", "asc"]] });
}

export async function getAlertChannel(db: AppDatabase, id: string, settings?: AlertSettings): Promise<AlertChannel | null> {
	const row = await db.find(alertChannels, id);
	return row ? toAlertChannel(row, settings) : null;
}

export async function deleteAlertChannel(db: AppDatabase, id: string): Promise<void> {
	await db.delete(alertChannels, id);
}

export async function toggleAlertChannel(db: AppDatabase, id: string): Promise<SelectAlertChannel | null> {
	const row = await db.find(alertChannels, id);
	if (!row) return null;
	return db.update(alertChannels, id, { is_enabled: !row.is_enabled, updated_at: Date.now() });
}

/** Where a channel sends, with secrets masked, for listing on the dashboard. */
export function describeChannelTarget(channel: AlertChannel): string {
	switch (channel.kind) {
		case "email":
			return channel.email.to;
		case "webhook": {
			const url = new URL(channel.url);
			return `${url.host}${url.pathname.length > 12 ? `${url.pathname.slice(0, 12)}…` : url.pathname}`;
		}
		case "telegram":
			return `chat ${channel.chatId}`;
		case "pagerduty":
			return `routing key …${channel.routingKey.slice(-4)}`;
		case "pushover":
			return `user …${channel.user.slice(-4)}`;
		case "opsgenie":
			return `${channel.region.toUpperCase()} API key …${channel.apiKey.slice(-4)}`;
		case "twilio":
			return `${channel.from} → ${channel.to}`;
	}
}
