/**
 * Shared HTML helpers for the server-rendered views.
 */

import type { CheckSegment } from "~/app/services/monitor-service";

export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

/**
 * A timestamp the browser rewrites into the viewer's local time; UTC is the no-JS fallback.
 */
export function renderTime(ms: number, format: "datetime" | "date" = "datetime"): string {
	const iso = new Date(ms).toISOString();
	const fallback = format === "date" ? iso.slice(0, 10) : `${iso.slice(0, 16).replace("T", " ")} UTC`;
	return `<time datetime="${iso}" data-local="${format}">${fallback}</time>`;
}

export function formatPercentage(value: number | null): string {
	return value === null ? "—" : `${value}%`;
}

/**
 * Bars for the most recent checks, oldest on the left. Slots with no check yet stay grey
 * rather than being drawn as healthy.
 */
export function renderTimeline(checks: CheckSegment[], length: number, height = 14): string {
	const empty = Math.max(0, length - checks.length);
	const slots = [
		...Array.from({ length: empty }, () => `<div class="tick empty" style="height: ${height}px;" data-tip="No check recorded"></div>`),
		...checks.slice(-length).map((check) => {
			const lines = [
				new Date(check.checkedAt).toISOString().slice(0, 19).replace("T", " ") + " UTC",
				check.status.toUpperCase(),
				check.statusCode !== null ? `HTTP ${check.statusCode}` : "No response",
				check.responseTimeMs !== null ? `${check.responseTimeMs}ms` : "",
			].filter(Boolean);
			return `<div class="tick ${check.status}" style="height: ${height}px;" data-tip="${escapeHtml(lines.join("\n"))}"></div>`;
		}),
	];
	return `<div class="timeline">${slots.join("")}</div>`;
}
