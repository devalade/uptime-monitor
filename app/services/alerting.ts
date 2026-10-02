/**
 * Alerting service for uptime incident notifications.
 * Dispatches emails through the Transport contract and logs alert events.
 */

import { Mailer } from "@sdxc/mail";
import type { Transport } from "~/app/contracts/transport";
import type { SelectMonitor } from "~/database/schema";
import { logger } from "~/bootstrap/logger";

export interface IncidentAlertPayload {
	monitor: SelectMonitor;
	previousStatus: string | null;
	currentStatus: string;
	reason: string;
	timestamp: number;
}

export async function sendIncidentAlert(
	transport: Transport,
	recipientEmail: string,
	fromEmail: string,
	payload: IncidentAlertPayload,
): Promise<void> {
	const isDown = payload.currentStatus === "down";
	const subject = isDown
		? `🚨 [ALERT] Monitor DOWN: ${payload.monitor.name}`
		: `✅ [RECOVERY] Monitor UP: ${payload.monitor.name}`;

	const textBody = [
		`Monitor: ${payload.monitor.name}`,
		`URL: ${payload.monitor.url}`,
		`Status: ${payload.currentStatus.toUpperCase()}`,
		`Previous: ${payload.previousStatus ? payload.previousStatus.toUpperCase() : "UNKNOWN"}`,
		`Reason: ${payload.reason}`,
		`Time: ${new Date(payload.timestamp).toISOString()}`,
	].join("\n");

	try {
		const mailer = new Mailer({ transport, from: { email: fromEmail } });
		const result = await mailer.send({
			to: { email: recipientEmail },
			subject,
			text: textBody,
		});

		if (result.status === "failure") {
			const log = logger.open("job", {
				monitorId: payload.monitor.id,
				error: result.error?.message || "Mail delivery rejected",
			});
			log.note("Failed to dispatch incident notification");
			log.emit();
			return;
		}

		const log = logger.open("job", {
			monitorId: payload.monitor.id,
			status: payload.currentStatus,
			recipient: recipientEmail,
		});
		log.note("Incident notification dispatched");
		log.emit();
	} catch (error) {
		const log = logger.open("job", {
			monitorId: payload.monitor.id,
			error: error instanceof Error ? error.message : String(error),
		});
		log.note("Failed to dispatch incident notification");
		log.fail(error instanceof Error ? error : new Error(String(error)));
		log.emit();
	}
}

