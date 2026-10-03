/**
 * Small components shared by the server-rendered pages.
 */

import type { Handle, RemixNode } from "remix/component";
import type { CheckSegment } from "~/app/services/monitor-service";
import type { DailyUptime } from "~/app/services/uptime-stats";
import type { SelectMonitor } from "~/database/schema";

export function formatPercentage(value: number | null): string {
	return value === null ? "—" : `${value}%`;
}

export function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * A timestamp the browser rewrites into the viewer's local time; UTC is the no-JS fallback.
 */
export function LocalTime(handle: Handle<{ at: number; format?: "datetime" | "date" }>) {
	return () => {
		const format = handle.props.format ?? "datetime";
		const iso = new Date(handle.props.at).toISOString();
		const fallback = format === "date" ? iso.slice(0, 10) : `${iso.slice(0, 16).replace("T", " ")} UTC`;
		return (
			<time datetime={iso} data-local={format}>
				{fallback}
			</time>
		);
	};
}

/**
 * Bars for the most recent checks, oldest on the left. Slots with no check yet stay grey
 * rather than being drawn as healthy.
 */
export function Timeline(handle: Handle<{ checks: CheckSegment[]; length: number; height?: number }>) {
	return () => {
		const { checks, length, height = 14 } = handle.props;
		const empty = Math.max(0, length - checks.length);
		return (
			<div class="timeline">
				{Array.from({ length: empty }, () => (
					<div class="tick empty" style={`height: ${height}px;`} data-tip="No check recorded"></div>
				))}
				{checks.slice(-length).map((check) => {
					const lines = [
						new Date(check.checkedAt).toISOString().slice(0, 19).replace("T", " ") + " UTC",
						check.status.toUpperCase(),
						check.statusCode !== null ? `HTTP ${check.statusCode}` : "No response",
						check.responseTimeMs !== null ? `${check.responseTimeMs}ms` : "",
					].filter(Boolean);
					return <div class={`tick ${check.status}`} style={`height: ${height}px;`} data-tip={lines.join("\n")}></div>;
				})}
			</div>
		);
	};
}

/**
 * One bar per day, oldest on the left, coloured by that day's uptime.
 */
export function DailyBars(handle: Handle<{ days: DailyUptime[]; height?: number }>) {
	return () => {
		const { days, height = 28 } = handle.props;
		return (
			<div class="timeline">
				{days.map((day) => {
					const status =
						day.uptimePercentage === null ? "empty" : day.uptimePercentage >= 99.9 ? "up" : day.uptimePercentage >= 98 ? "degraded" : "down";
					const tip =
						day.uptimePercentage === null
							? `${day.day}\nNo data`
							: `${day.day}\n${day.uptimePercentage}% uptime\n${day.totalChecks} checks${day.avgResponseMs !== null ? `, avg ${day.avgResponseMs}ms` : ""}`;
					return <div key={day.day} class={`tick ${status}`} style={`height: ${height}px;`} data-tip={tip}></div>;
				})}
			</div>
		);
	};
}

/** HTTP method for http monitors, otherwise the monitor type. */
export function TypeChip(handle: Handle<{ monitor: Pick<SelectMonitor, "type" | "method"> }>) {
	return () => {
		const { monitor } = handle.props;
		const label = monitor.type === "http" ? monitor.method : monitor.type.toUpperCase();
		const css = monitor.type === "http" ? `method-${monitor.method.toLowerCase()}` : `method-${monitor.type}`;
		return <span class={`method-chip ${css}`}>{label}</span>;
	};
}

/**
 * Response times as an SVG line, oldest on the left. Failed checks are marked in red.
 */
export function ResponseChart(handle: Handle<{ checks: CheckSegment[]; height?: number }>) {
	return () => {
		const { checks, height = 90 } = handle.props;
		const points = checks.filter((c) => c.responseTimeMs !== null);
		if (points.length < 2) {
			return (
				<div class="dim" style="padding: 1.5rem 0; text-align: center;">
					Not enough checks yet to draw response times.
				</div>
			);
		}
		const width = 600;
		const max = Math.max(...points.map((p) => p.responseTimeMs ?? 0), 1);
		const x = (i: number) => (i / (points.length - 1)) * width;
		const y = (ms: number) => height - 4 - (ms / max) * (height - 12);
		const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.responseTimeMs ?? 0).toFixed(1)}`).join(" ");

		return (
			<>
				<svg
					viewBox={`0 0 ${width} ${height}`}
					preserveAspectRatio="none"
					style={`width: 100%; height: ${height}px; display: block;`}
					role="img"
					aria-label={`Response times of the last ${points.length} checks, up to ${max}ms`}
				>
					<line x1="0" y1={y(max).toFixed(1)} x2={String(width)} y2={y(max).toFixed(1)} stroke="var(--border-subtle)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />
					<path d={path} fill="none" stroke="var(--brand)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
					{points.map((p, i) =>
						p.status === "down" ? <circle cx={x(i).toFixed(1)} cy={y(p.responseTimeMs ?? 0).toFixed(1)} r="3" fill="var(--down)" /> : null,
					)}
				</svg>
				<div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-dim); font-family: var(--font-mono); margin-top: 4px;">
					<span>Older</span>
					<span>peak {max}ms</span>
					<span>Latest</span>
				</div>
			</>
		);
	};
}

/** A green confirmation banner. */
export function SuccessNotice(handle: Handle<{ children?: RemixNode }>) {
	return () => (
		<div class="alert" role="status" style="border-color: var(--up-border); background: var(--up-bg); color: var(--up);">
			{handle.props.children}
		</div>
	);
}

export function FormErrorSummary() {
	return () => (
		<div class="alert alert-error" role="alert">
			Please fix the highlighted fields.
		</div>
	);
}

/** Shown under a field the server rejected; `id` matches the field's aria-describedby. */
export function FieldError(handle: Handle<{ id: string; message?: string }>) {
	return () =>
		handle.props.message ? (
			<p class="form-error" id={handle.props.id}>
				{handle.props.message}
			</p>
		) : null;
}

/** aria attributes for a field the server rejected. */
export function invalidProps(errorId: string, message: string | undefined) {
	return message ? { "aria-invalid": "true" as const, "aria-describedby": errorId } : {};
}
