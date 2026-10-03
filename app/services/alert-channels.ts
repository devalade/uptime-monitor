/**
 * Alert channels added from the dashboard: webhooks (Discord, Slack, ntfy.sh or any URL),
 * Telegram bots and PagerDuty services. Environment channels are configured with secrets instead.
 */

import type { AppDatabase } from "~/app/contracts/database";
import { toAlertChannel, type AlertChannel } from "~/app/services/alerting";
import { alertChannels, alertChannelTypes, type AlertChannelType, type SelectAlertChannel } from "~/database/schema";

export const alertChannelTypeLabels: Record<AlertChannelType, string> = {
	webhook: "Webhook (Discord, Slack, ntfy.sh or JSON)",
	telegram: "Telegram",
	pagerduty: "PagerDuty",
};

export type AlertChannelFormField = "name" | "type" | "url" | "bot_token" | "chat_id" | "routing_key";
export type AlertChannelFormValues = Partial<Record<AlertChannelFormField, string>>;
export type AlertChannelFormErrors = Partial<Record<AlertChannelFormField, string>>;

export type AlertChannelInputResult =
	| { ok: true; value: { name: string; type: AlertChannelType; config: Record<string, string> } }
	| { ok: false; errors: AlertChannelFormErrors };

export function readAlertChannelForm(formData: FormData): AlertChannelFormValues {
	const fields: AlertChannelFormField[] = ["name", "type", "url", "bot_token", "chat_id", "routing_key"];
	return Object.fromEntries(fields.map((field) => [field, formData.get(field)?.toString().trim() ?? ""]));
}

export function parseAlertChannelInput(values: AlertChannelFormValues): AlertChannelInputResult {
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

export async function getAlertChannel(db: AppDatabase, id: string): Promise<AlertChannel | null> {
	const row = await db.find(alertChannels, id);
	return row ? toAlertChannel(row) : null;
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
	}
}
