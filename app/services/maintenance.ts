/**
 * Maintenance windows: planned work during which checks keep running but no incident is opened,
 * no DOWN alert is sent and the checks do not count against uptime.
 */

import { and, gt, lte } from "remix/data-table";
import type { AppDatabase } from "~/app/contracts/database";
import { parseIdList } from "~/app/services/alerting";
import { maintenanceWindows, type SelectMaintenanceWindow } from "~/database/schema";

export interface CreateMaintenanceInput {
	title: string;
	startsAt: number;
	endsAt: number;
	/** null covers every monitor. */
	monitorIds: string[] | null;
}

export async function createMaintenanceWindow(db: AppDatabase, input: CreateMaintenanceInput): Promise<SelectMaintenanceWindow> {
	return db.create(
		maintenanceWindows,
		{
			id: crypto.randomUUID(),
			title: input.title,
			starts_at: input.startsAt,
			ends_at: input.endsAt,
			monitor_ids: input.monitorIds === null ? null : JSON.stringify(input.monitorIds),
			created_at: Date.now(),
		},
		{ returnRow: true },
	);
}

export async function deleteMaintenanceWindow(db: AppDatabase, id: string): Promise<void> {
	await db.delete(maintenanceWindows, id);
}

/** Ends a running window now, keeping it in the history. */
export async function endMaintenanceWindow(db: AppDatabase, id: string, now: number = Date.now()): Promise<void> {
	const window = await db.find(maintenanceWindows, id);
	if (!window) return;
	if (window.starts_at > now) {
		await db.delete(maintenanceWindows, id);
		return;
	}
	await db.update(maintenanceWindows, id, { ends_at: now });
}

export async function listActiveMaintenance(db: AppDatabase, now: number = Date.now()): Promise<SelectMaintenanceWindow[]> {
	return db.findMany(maintenanceWindows, {
		where: and(lte(maintenanceWindows.starts_at, now), gt(maintenanceWindows.ends_at, now)),
		orderBy: [["starts_at", "asc"]],
	});
}

/** Windows that have not ended yet (running or upcoming), soonest first. */
export async function listCurrentAndUpcomingMaintenance(db: AppDatabase, now: number = Date.now()): Promise<SelectMaintenanceWindow[]> {
	return db.findMany(maintenanceWindows, {
		where: gt(maintenanceWindows.ends_at, now),
		orderBy: [["starts_at", "asc"]],
		limit: 50,
	});
}

export async function listPastMaintenance(db: AppDatabase, now: number = Date.now(), limit = 10): Promise<SelectMaintenanceWindow[]> {
	return db.findMany(maintenanceWindows, {
		where: lte(maintenanceWindows.ends_at, now),
		orderBy: [["ends_at", "desc"]],
		limit,
	});
}

export function windowCoversMonitor(window: SelectMaintenanceWindow, monitorId: string): boolean {
	const ids = parseIdList(window.monitor_ids);
	return ids === null || ids.includes(monitorId);
}

export function isUnderMaintenance(windows: SelectMaintenanceWindow[], monitorId: string, now: number = Date.now()): boolean {
	return windows.some((w) => w.starts_at <= now && w.ends_at > now && windowCoversMonitor(w, monitorId));
}

export type MaintenanceFormField = "title" | "starts_at" | "ends_at" | "tz_offset" | "scope" | "monitor_ids";
export type MaintenanceFormValues = Partial<Record<MaintenanceFormField, string>>;
export type MaintenanceFormErrors = Partial<Record<MaintenanceFormField, string>>;

export function readMaintenanceForm(formData: FormData): MaintenanceFormValues {
	return {
		title: formData.get("title")?.toString() ?? "",
		starts_at: formData.get("starts_at")?.toString() ?? "",
		ends_at: formData.get("ends_at")?.toString() ?? "",
		tz_offset: formData.get("tz_offset")?.toString() ?? "",
		scope: formData.get("scope")?.toString() ?? "all",
		monitor_ids: formData.getAll("monitor_ids").map(String).join(","),
	};
}

/**
 * Parses the maintenance form. Times come from `datetime-local` inputs, which carry no time zone,
 * so the browser sends its offset (minutes, as `Date#getTimezoneOffset`); without it they are UTC.
 */
export function parseMaintenanceInput(
	values: MaintenanceFormValues,
	now: number = Date.now(),
): { ok: true; value: CreateMaintenanceInput } | { ok: false; errors: MaintenanceFormErrors } {
	const errors: MaintenanceFormErrors = {};

	const title = values.title?.trim() ?? "";
	if (!title) errors.title = "Describe the maintenance, e.g. Database upgrade.";
	else if (title.length > 120) errors.title = "Title must be 120 characters or fewer.";

	const offsetMinutes = Number(values.tz_offset || 0);
	const startsAt = parseLocalDateTime(values.starts_at, offsetMinutes);
	const endsAt = parseLocalDateTime(values.ends_at, offsetMinutes);
	if (startsAt === null) errors.starts_at = "Pick when the maintenance starts.";
	if (endsAt === null) errors.ends_at = "Pick when the maintenance ends.";
	if (startsAt !== null && endsAt !== null) {
		if (endsAt <= startsAt) errors.ends_at = "The end must be after the start.";
		else if (endsAt <= now) errors.ends_at = "This window has already ended.";
		else if (endsAt - startsAt > 7 * 24 * 60 * 60 * 1000) errors.ends_at = "A window can last at most 7 days.";
	}

	const monitorIds = (values.monitor_ids ?? "").split(",").map((id) => id.trim()).filter(Boolean);
	const scoped = values.scope === "selected";
	if (scoped && monitorIds.length === 0) errors.monitor_ids = "Pick at least one monitor, or cover all of them.";

	if (Object.keys(errors).length > 0 || startsAt === null || endsAt === null) return { ok: false, errors };
	return { ok: true, value: { title, startsAt, endsAt, monitorIds: scoped ? monitorIds : null } };
}

function parseLocalDateTime(raw: string | undefined, offsetMinutes: number): number | null {
	const match = raw?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
	if (!match || !Number.isFinite(offsetMinutes)) return null;
	const [, year, month, day, hour, minute] = match.map(Number);
	const utc = Date.UTC(year, month - 1, day, hour, minute);
	return Number.isNaN(utc) ? null : utc + offsetMinutes * 60_000;
}
