/**
 * Daily uptime rollups. Raw check results are kept for 30 days; these per-day totals are kept
 * for good, so uptime can be reported over 7, 30 and 90 days and drawn as daily bars.
 */

import { and, gte, inList, eq } from "remix/data-table";
import { sql } from "remix/data-table";
import type { AppDatabase } from "~/app/contracts/database";
import { monitorDailyStats } from "~/database/schema";

export const DAY_MS = 24 * 60 * 60 * 1000;

export const UPTIME_PERIODS = [7, 30, 90] as const;
export type UptimePeriod = (typeof UPTIME_PERIODS)[number];

export interface DailyUptime {
	/** UTC date, YYYY-MM-DD. */
	day: string;
	/** null when there were no checks that day. */
	uptimePercentage: number | null;
	totalChecks: number;
	avgResponseMs: number | null;
}

export function utcDay(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

export function startOfUtcDay(ms: number): number {
	return Math.floor(ms / DAY_MS) * DAY_MS;
}

/**
 * Recomputes the rollups of every whole UTC day from `since` on. Maintenance checks are left out.
 */
export async function refreshDailyStats(db: AppDatabase, since: number, now: number = Date.now()): Promise<void> {
	const from = startOfUtcDay(since);
	await db.exec(sql`
		INSERT INTO monitor_daily_stats (id, monitor_id, day, total_checks, up_checks, avg_response_ms, updated_at)
		SELECT
			monitor_id || ':' || date(created_at / 1000, 'unixepoch'),
			monitor_id,
			date(created_at / 1000, 'unixepoch'),
			COUNT(*),
			SUM(is_up),
			CAST(AVG(response_time_ms) AS INTEGER),
			${now}
		FROM monitor_results
		WHERE created_at >= ${from} AND is_maintenance = 0
		GROUP BY monitor_id, date(created_at / 1000, 'unixepoch')
		ON CONFLICT(id) DO UPDATE SET
			total_checks = excluded.total_checks,
			up_checks = excluded.up_checks,
			avg_response_ms = excluded.avg_response_ms,
			updated_at = excluded.updated_at
	`);
}

/**
 * Uptime over the last 7, 30 and 90 days (today included), or null for a period with no checks.
 */
export async function getUptimeReport(
	db: AppDatabase,
	monitorId: string,
	now: number = Date.now(),
): Promise<Record<UptimePeriod, number | null>> {
	const longest = Math.max(...UPTIME_PERIODS);
	const rows = await db.findMany(monitorDailyStats, {
		where: and(eq(monitorDailyStats.monitor_id, monitorId), gte(monitorDailyStats.day, utcDay(now - (longest - 1) * DAY_MS))),
	});

	const report = {} as Record<UptimePeriod, number | null>;
	for (const days of UPTIME_PERIODS) {
		const first = utcDay(now - (days - 1) * DAY_MS);
		const inPeriod = rows.filter((row) => row.day >= first);
		report[days] = percentage(
			inPeriod.reduce((sum, row) => sum + row.up_checks, 0),
			inPeriod.reduce((sum, row) => sum + row.total_checks, 0),
		);
	}
	return report;
}

/**
 * One entry per day for the last `days` days, oldest first, for each monitor.
 */
export async function getDailyUptime(
	db: AppDatabase,
	monitorIds: string[],
	days: number,
	now: number = Date.now(),
): Promise<Map<string, DailyUptime[]>> {
	const result = new Map<string, DailyUptime[]>();
	if (monitorIds.length === 0) return result;

	const dayList = Array.from({ length: days }, (_, i) => utcDay(now - (days - 1 - i) * DAY_MS));
	const rows = await db.findMany(monitorDailyStats, {
		where: and(inList(monitorDailyStats.monitor_id, monitorIds), gte(monitorDailyStats.day, dayList[0])),
	});

	const byKey = new Map(rows.map((row) => [`${row.monitor_id}:${row.day}`, row]));
	for (const monitorId of monitorIds) {
		result.set(
			monitorId,
			dayList.map((day) => {
				const row = byKey.get(`${monitorId}:${day}`);
				return {
					day,
					uptimePercentage: row ? percentage(row.up_checks, row.total_checks) : null,
					totalChecks: row?.total_checks ?? 0,
					avgResponseMs: row?.avg_response_ms ?? null,
				};
			}),
		);
	}
	return result;
}

/** Uptime over a list of days, weighting each day by how many checks it had. */
export function overallUptime(days: DailyUptime[]): number | null {
	let up = 0;
	let total = 0;
	for (const day of days) {
		if (day.uptimePercentage === null) continue;
		up += (day.uptimePercentage / 100) * day.totalChecks;
		total += day.totalChecks;
	}
	return percentage(up, total);
}

function percentage(up: number, total: number): number | null {
	return total === 0 ? null : Math.round((up / total) * 10000) / 100;
}
