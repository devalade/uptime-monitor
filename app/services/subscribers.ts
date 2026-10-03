/**
 * Email subscribers of the public status page. People confirm their address through a link
 * before they receive anything, and every email carries an unsubscribe link.
 */

import { Mailer } from "@sdxc/mail";
import { eq, isNull, lt, and, notNull } from "remix/data-table";
import type { AppDatabase } from "~/app/contracts/database";
import type { AlertSettings, MailSender } from "~/app/services/alerting";
import { getStatusPageSettings } from "~/app/services/settings";
import { statusSubscribers, type SelectStatusSubscriber } from "~/database/schema";
import { logger } from "~/bootstrap/logger";

/** One confirmation email per address per hour, so the form cannot be used to flood an inbox. */
const CONFIRMATION_INTERVAL_MS = 60 * 60 * 1000;
/** Unconfirmed sign-ups are dropped after this long. */
const UNCONFIRMED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SubscriberMail {
	mailer: MailSender;
	/** Public origin used to build confirm and unsubscribe links. */
	publicUrl: string;
}

/** Subscriptions work only when email can be sent and links can be built. */
export function subscriberMail(alerts: AlertSettings | undefined, requestOrigin?: string): SubscriberMail | null {
	const publicUrl = alerts?.publicUrl ?? requestOrigin;
	return alerts?.mailer && publicUrl ? { mailer: alerts.mailer, publicUrl } : null;
}

export function isValidEmail(email: string): boolean {
	return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export type SubscribeResult = "confirmation-sent" | "already-subscribed" | "try-later";

/** Starts a subscription: stores the address and sends the confirmation link. */
export async function subscribe(db: AppDatabase, mail: SubscriberMail, email: string, now: number = Date.now()): Promise<SubscribeResult> {
	const address = email.trim().toLowerCase();
	let subscriber = await db.findOne(statusSubscribers, { where: eq(statusSubscribers.email, address) });

	if (subscriber?.confirmed_at) return "already-subscribed";
	if (subscriber?.confirmation_sent_at && now - subscriber.confirmation_sent_at < CONFIRMATION_INTERVAL_MS) return "try-later";

	if (!subscriber) {
		subscriber = await db.create(
			statusSubscribers,
			{ id: crypto.randomUUID(), email: address, token: generateToken(), confirmed_at: null, confirmation_sent_at: null, created_at: now },
			{ returnRow: true },
		);
	}

	const page = await getStatusPageSettings(db);
	await sendMail(mail, subscriber, {
		subject: `Confirm your subscription to ${page.title}`,
		text: [
			`Someone, hopefully you, asked to get updates from ${page.title} at this address.`,
			"",
			`Confirm here: ${mail.publicUrl}/status/subscribe/confirm/${subscriber.token}`,
			"",
			"If it was not you, ignore this email and nothing will be sent.",
		].join("\n"),
		withUnsubscribe: false,
	});
	await db.update(statusSubscribers, subscriber.id, { confirmation_sent_at: now });
	return "confirmation-sent";
}

export async function confirmSubscription(db: AppDatabase, token: string, now: number = Date.now()): Promise<boolean> {
	const subscriber = await db.findOne(statusSubscribers, { where: eq(statusSubscribers.token, token) });
	if (!subscriber) return false;
	if (!subscriber.confirmed_at) await db.update(statusSubscribers, subscriber.id, { confirmed_at: now });
	return true;
}

export async function unsubscribe(db: AppDatabase, token: string): Promise<boolean> {
	const subscriber = await db.findOne(statusSubscribers, { where: eq(statusSubscribers.token, token) });
	if (!subscriber) return false;
	await db.delete(statusSubscribers, subscriber.id);
	return true;
}

export async function countSubscribers(db: AppDatabase): Promise<{ confirmed: number; pending: number }> {
	const [confirmed, pending] = await Promise.all([
		db.count(statusSubscribers, { where: notNull(statusSubscribers.confirmed_at) }),
		db.count(statusSubscribers, { where: isNull(statusSubscribers.confirmed_at) }),
	]);
	return { confirmed, pending };
}

export async function pruneUnconfirmedSubscribers(db: AppDatabase, now: number = Date.now()): Promise<void> {
	await db.deleteMany(statusSubscribers, {
		where: and(isNull(statusSubscribers.confirmed_at), lt(statusSubscribers.created_at, now - UNCONFIRMED_TTL_MS)),
	});
}

/**
 * Emails every confirmed subscriber. Never throws: a failed delivery is logged and the rest go on.
 */
export async function notifySubscribers(
	db: AppDatabase,
	alerts: AlertSettings | undefined,
	message: { subject: string; text: string },
): Promise<number> {
	const mail = subscriberMail(alerts);
	if (!mail) return 0;

	try {
		const [subscribers, page] = await Promise.all([
			db.findMany(statusSubscribers, { where: notNull(statusSubscribers.confirmed_at), limit: 500 }),
			getStatusPageSettings(db),
		]);
		const results = await Promise.allSettled(
			subscribers.map((subscriber) =>
				sendMail(mail, subscriber, {
					subject: `[${page.title}] ${message.subject}`,
					text: `${message.text}\n\nStatus page: ${mail.publicUrl}/status`,
					withUnsubscribe: true,
				}),
			),
		);
		const failed = results.filter((r) => r.status === "rejected").length;
		if (failed > 0) {
			const log = logger.open("job", { failed, total: subscribers.length });
			log.note("Some subscriber emails failed");
			log.emit();
		}
		return subscribers.length - failed;
	} catch (error) {
		const log = logger.open("job", { error: error instanceof Error ? error.message : String(error) });
		log.note("Could not notify subscribers");
		log.emit();
		return 0;
	}
}

async function sendMail(
	mail: SubscriberMail,
	subscriber: SelectStatusSubscriber,
	message: { subject: string; text: string; withUnsubscribe: boolean },
): Promise<void> {
	const unsubscribeUrl = `${mail.publicUrl}/status/unsubscribe/${subscriber.token}`;
	const mailer = new Mailer({ transport: mail.mailer.transport, from: { email: mail.mailer.from } });
	const result = await mailer.send({
		to: { email: subscriber.email },
		subject: message.subject,
		text: message.withUnsubscribe ? `${message.text}\n\nUnsubscribe: ${unsubscribeUrl}` : message.text,
		// One-click unsubscribe (RFC 8058) posts straight to the unsubscribe endpoint; it must be https.
		unsubscribe: message.withUnsubscribe && unsubscribeUrl.startsWith("https://") ? { url: unsubscribeUrl } : undefined,
	});
	if (result.status === "failure") throw new Error(result.error?.message || "Mail delivery rejected");
}

function generateToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
