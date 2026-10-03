/**
 * Emails status page subscribers about incidents written by people and about maintenance.
 * Outages detected by checks are announced from the monitor service.
 */

import type { AppDatabase } from "~/app/contracts/database";
import type { AlertSettings } from "~/app/services/alerting";
import { windowCoversMonitor } from "~/app/services/maintenance";
import { listMonitors } from "~/app/services/monitor-service";
import { statusPostStatusLabels } from "~/app/services/status-posts";
import { notifySubscribers } from "~/app/services/subscribers";
import type { SelectMaintenanceWindow, SelectStatusPost, StatusPostStatus } from "~/database/schema";

export async function announceStatusPost(
	db: AppDatabase,
	alerts: AlertSettings | undefined,
	post: SelectStatusPost,
	update: { status: StatusPostStatus; message: string },
): Promise<void> {
	await notifySubscribers(db, alerts, {
		subject: `${statusPostStatusLabels[update.status]}: ${post.title}`,
		text: `${post.title}\n${statusPostStatusLabels[update.status]}\n\n${update.message}`,
	});
}

/** Only windows that cover a public service are announced. */
export async function announceMaintenance(db: AppDatabase, alerts: AlertSettings | undefined, window: SelectMaintenanceWindow): Promise<void> {
	const affected = (await listMonitors(db)).filter((m) => m.is_public && m.is_enabled && windowCoversMonitor(window, m.id));
	if (affected.length === 0) return;

	const scope = window.monitor_ids === null ? "all services" : affected.map((m) => m.name).join(", ");
	await notifySubscribers(db, alerts, {
		subject: `Scheduled maintenance: ${window.title}`,
		text: `${window.title}\n\nFrom ${new Date(window.starts_at).toUTCString()} to ${new Date(window.ends_at).toUTCString()}.\nAffects ${scope}.`,
	});
}
