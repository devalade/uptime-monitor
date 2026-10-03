/**
 * Monthly uptime reports (SLA): uptime, downtime and incidents per monitor for one UTC month,
 * as a page that prints to PDF and as CSV.
 */

import { and, gte, lt, or, isNull } from "remix/data-table";
import type { AppDatabase } from "~/app/contracts/database";
import { listMonitors } from "~/app/services/monitor-service";
import { incidents, monitorDailyStats } from "~/database/schema";

export interface MonitorReportRow {
	id: string;
	name: string;
	type: string;
	/** null when there were no checks that month. */
	uptimePercentage: number | null;
	totalChecks: number;
	avgResponseMs: number | null;
	incidents: number;
	/** Downtime from incidents, clipped to the month. */
	downtimeMinutes: number;
	longestIncidentMinutes: number;
}

export interface MonthlyReport {
	/** YYYY-MM */
	month: string;
	label: string;
	startsAt: number;
	endsAt: number;
	rows: MonitorReportRow[];
	overallUptime: number | null;
}

/** "2026-10" → its UTC bounds, or null when malformed. */
export function parseMonth(month: string | null | undefined): { month: string; startsAt: number; endsAt: number } | null {
	const match = month?.match(/^(\d{4})-(\d{2})$/);
	if (!match) return null;
	const year = Number(match[1]);
	const index = Number(match[2]) - 1;
	if (index < 0 || index > 11) return null;
	return { month: month as string, startsAt: Date.UTC(year, index, 1), endsAt: Date.UTC(year, index + 1, 1) };
}

export function currentMonth(now: number = Date.now()): string {
	return new Date(now).toISOString().slice(0, 7);
}

/** The month before, e.g. "2026-01" → "2025-12". */
export function shiftMonth(month: string, by: number): string {
	const bounds = parseMonth(month);
	if (!bounds) return currentMonth();
	const date = new Date(bounds.startsAt);
	date.setUTCMonth(date.getUTCMonth() + by);
	return date.toISOString().slice(0, 7);
}

export async function getMonthlyReport(db: AppDatabase, month: string, now: number = Date.now()): Promise<MonthlyReport | null> {
	const bounds = parseMonth(month);
	if (!bounds) return null;
	const until = Math.min(bounds.endsAt, now);

	const [monitors, stats, monthIncidents] = await Promise.all([
		listMonitors(db),
		db.findMany(monitorDailyStats, {
			where: and(gte(monitorDailyStats.day, `${bounds.month}-01`), lt(monitorDailyStats.day, `${new Date(bounds.endsAt).toISOString().slice(0, 10)}`)),
		}),
		db.findMany(incidents, {
			where: and(lt(incidents.started_at, bounds.endsAt), or(isNull(incidents.resolved_at), gte(incidents.resolved_at, bounds.startsAt))),
		}),
	]);

	const rows: MonitorReportRow[] = monitors.map((monitor) => {
		const days = stats.filter((s) => s.monitor_id === monitor.id);
		const totalChecks = days.reduce((sum, d) => sum + d.total_checks, 0);
		const upChecks = days.reduce((sum, d) => sum + d.up_checks, 0);
		const weightedResponse = days.filter((d) => d.avg_response_ms !== null);
		const responseChecks = weightedResponse.reduce((sum, d) => sum + d.total_checks, 0);

		const own = monthIncidents.filter((i) => i.monitor_id === monitor.id);
		const durations = own.map((i) => Math.max(0, Math.min(i.resolved_at ?? until, until) - Math.max(i.started_at, bounds.startsAt)));

		return {
			id: monitor.id,
			name: monitor.name,
			type: monitor.type,
			uptimePercentage: totalChecks === 0 ? null : Math.round((upChecks / totalChecks) * 10000) / 100,
			totalChecks,
			avgResponseMs:
				responseChecks === 0
					? null
					: Math.round(weightedResponse.reduce((sum, d) => sum + (d.avg_response_ms ?? 0) * d.total_checks, 0) / responseChecks),
			incidents: own.length,
			downtimeMinutes: Math.round(durations.reduce((a, b) => a + b, 0) / 60000),
			longestIncidentMinutes: Math.round(Math.max(0, ...durations) / 60000),
		};
	});

	const measured = rows.filter((r) => r.uptimePercentage !== null);
	const totalChecks = measured.reduce((sum, r) => sum + r.totalChecks, 0);
	const overallUptime =
		totalChecks === 0
			? null
			: Math.round((measured.reduce((sum, r) => sum + ((r.uptimePercentage ?? 0) / 100) * r.totalChecks, 0) / totalChecks) * 10000) / 100;

	return {
		month: bounds.month,
		label: new Date(bounds.startsAt).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
		startsAt: bounds.startsAt,
		endsAt: bounds.endsAt,
		rows,
		overallUptime,
	};
}

export function reportToCsv(report: MonthlyReport): string {
	const header = ["Monitor", "Type", "Uptime %", "Checks", "Avg response ms", "Incidents", "Downtime minutes", "Longest incident minutes"];
	const cell = (value: string | number | null) => {
		// A leading =, +, - or @ would run as a formula in spreadsheet apps.
		const raw = value === null ? "" : String(value);
		const text = typeof value === "string" && /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
		return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	};
	const lines = report.rows.map((r) =>
		[r.name, r.type, r.uptimePercentage, r.totalChecks, r.avgResponseMs, r.incidents, r.downtimeMinutes, r.longestIncidentMinutes].map(cell).join(","),
	);
	return `${[header.join(","), ...lines].join("\r\n")}\r\n`;
}
