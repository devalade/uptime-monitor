/**
 * Production Dashboard View for Uptime Monitor.
 * Tabular monitor list with each monitor's latest checks, 24h uptime and quick actions.
 */

import type { DashboardMonitor } from "~/app/services/monitor-service";
import type { AddMonitorFormState } from "~/app/http/views/add-monitor-dialog";
import { renderLayout } from "~/app/http/views/layout";
import { escapeHtml, formatPercentage, renderTime, renderTimeline } from "~/app/http/views/html";
import routes from "~/routes/web";

export const TIMELINE_LENGTH = 45;

const dashboardFilters = ["all", "up", "down", "paused"] as const;
export type DashboardFilter = (typeof dashboardFilters)[number];

export function parseDashboardFilter(raw: string | null): DashboardFilter {
	return dashboardFilters.includes(raw as DashboardFilter) ? (raw as DashboardFilter) : "all";
}

export type DashboardNotice =
	| { kind: "test-alert-sent" }
	| { kind: "test-alert-failed"; detail: string }
	| { kind: "alerts-off" };

export function parseDashboardNotice(params: URLSearchParams): DashboardNotice | undefined {
	const kind = params.get("notice");
	if (kind === "test-alert-sent" || kind === "alerts-off") return { kind };
	if (kind === "test-alert-failed") return { kind, detail: params.get("detail") ?? "Unknown error" };
	return undefined;
}

export interface DashboardViewProps {
	monitors: DashboardMonitor[];
	filter: DashboardFilter;
	alertsEnabled: boolean;
	notice?: DashboardNotice;
	form?: AddMonitorFormState;
}

function displayStatus(entry: DashboardMonitor): "up" | "down" | "degraded" | "paused" | "pending" {
	if (!entry.monitor.is_enabled) return "paused";
	return entry.monitor.last_status ?? "pending";
}

export function renderDashboardView(props: DashboardViewProps): string {
	const all = props.monitors;
	const total = all.length;
	const upCount = all.filter((e) => ["up", "degraded"].includes(displayStatus(e))).length;
	const downCount = all.filter((e) => displayStatus(e) === "down").length;
	const pausedCount = all.filter((e) => displayStatus(e) === "paused").length;
	const activeCount = total - pausedCount;

	const visible = all.filter((e) => {
		const status = displayStatus(e);
		if (props.filter === "up") return status === "up" || status === "degraded";
		if (props.filter === "down") return status === "down";
		if (props.filter === "paused") return status === "paused";
		return true;
	});

	const filterLink = (filter: DashboardFilter, label: string, extraStyle = "") =>
		`<a href="${routes.home.href()}${filter === "all" ? "" : `?filter=${filter}`}" class="filter-btn ${props.filter === filter ? "active" : ""}" style="${extraStyle}">${label}</a>`;

	const content = `
		<style>
			.table-card {
				border: 1px solid var(--border-medium);
				border-radius: 6px;
				background: var(--bg-surface);
				overflow: hidden;
			}
			.table-header {
				display: grid;
				grid-template-columns: 260px 1fr 110px 190px;
				gap: 20px;
				padding: 10px 18px;
				background: var(--bg-root);
				border-bottom: 1px solid var(--border-subtle);
				font-size: 11px;
				font-weight: 600;
				color: var(--text-muted);
				text-transform: uppercase;
				letter-spacing: 0.04em;
			}
			.table-row {
				display: grid;
				grid-template-columns: 260px 1fr 110px 190px;
				gap: 20px;
				padding: 12px 18px;
				align-items: center;
				border-bottom: 1px solid var(--border-subtle);
				transition: background 80ms ease;
			}
			.table-row:last-child {
				border-bottom: none;
			}
			.table-row:hover {
				background: var(--bg-surface-hover);
			}
			.filter-bar {
				display: flex;
				gap: 6px;
				margin-bottom: 14px;
				align-items: center;
				justify-content: space-between;
				flex-wrap: wrap;
			}
			.filter-btn {
				background: transparent;
				border: 1px solid var(--border-medium);
				color: var(--text-muted);
				padding: 4px 10px;
				border-radius: 4px;
				font-size: 11px;
				cursor: pointer;
				font-family: inherit;
			}
			.filter-btn.active {
				background: var(--bg-surface-active);
				color: var(--text-primary);
				border-color: var(--border-strong);
				font-weight: 600;
			}
			.onboarding { list-style: none; counter-reset: step; text-align: left; max-width: 420px; margin: 0 auto 1.5rem; }
			.onboarding li { counter-increment: step; display: flex; gap: 10px; margin-bottom: 0.625rem; color: var(--text-muted); font-size: 0.8125rem; }
			.onboarding li::before { content: counter(step); flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; background: var(--bg-surface-active); border: 1px solid var(--border-medium); color: var(--text-primary); font-size: 11px; display: flex; align-items: center; justify-content: center; }
			@media (max-width: 900px) {
				.table-header { display: none; }
				.table-row { grid-template-columns: 1fr; gap: 10px; }
				.table-row .row-actions { justify-content: flex-start !important; }
			}
		</style>

		${renderNotice(props.notice)}

		${
			props.alertsEnabled
				? ""
				: `<div class="alert alert-warning">
				<b>Alerts are off.</b> Checks still run, but nobody is notified when a monitor goes down.
				Set the <code>ALERT_WEBHOOK_URL</code> secret to a Discord, Slack or ntfy.sh URL
				(<code>npx wrangler secret put ALERT_WEBHOOK_URL</code>), or configure <code>ALERT_EMAIL</code>.
			</div>`
		}

		${
			total === 0
				? ""
				: `
		<!-- Top Operational Health Banner -->
		<div class="health-banner">
			<div style="display: flex; align-items: center; gap: 24px; flex-wrap: wrap;">
				<div style="display: flex; align-items: center; gap: 8px;">
					<span class="status-dot ${downCount > 0 ? "down" : "up"}"></span>
					<span style="font-weight: 600; color: ${downCount > 0 ? "var(--down)" : "var(--text-primary)"};">
						${downCount > 0 ? `${downCount} of ${activeCount} down` : `All ${activeCount} active monitor${activeCount === 1 ? "" : "s"} up`}
					</span>
				</div>
				${pausedCount > 0 ? `<div style="font-size: 12px; color: var(--text-muted);">${pausedCount} paused</div>` : ""}
			</div>

			<div style="display: flex; align-items: center; gap: 12px;">
				<span style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">Checks run every minute</span>
				${
					props.alertsEnabled
						? `<form method="POST" action="${routes.testAlert.href()}">
					<button type="submit" class="btn btn-secondary btn-sm" data-busy="Sending…">Send test alert</button>
				</form>`
						: ""
				}
			</div>
		</div>

		<!-- Filter and Controls -->
		<nav class="filter-bar" aria-label="Filter monitors">
			<div style="display: flex; gap: 6px; flex-wrap: wrap;">
				${filterLink("all", `All (${total})`)}
				${filterLink("up", `Up (${upCount})`)}
				${filterLink("down", `Down (${downCount})`, downCount > 0 ? "border-color: var(--down-border); color: #ff7b72;" : "")}
				${filterLink("paused", `Paused (${pausedCount})`)}
			</div>

			<div style="font-size: 11px; color: var(--text-dim);">
				Last ${TIMELINE_LENGTH} checks · hover a bar for details
			</div>
		</nav>`
		}

		${
			total === 0
				? `
			<div class="table-card" style="text-align: center; padding: 3.5rem 2rem;">
				<h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.375rem; color: var(--text-primary);">Monitor your first URL</h3>
				<p style="color: var(--text-muted); font-size: 0.8125rem; margin-bottom: 1.5rem;">Three steps and you're covered:</p>
				<ol class="onboarding">
					<li>Add the URL of a page or health endpoint you want to watch.</li>
					<li>We check it right away, then on the schedule you pick.</li>
					<li>Share the <a href="${routes.status.href()}" style="color: var(--brand);">public status page</a> with your users.</li>
				</ol>
				<button type="button" class="btn btn-primary" data-dialog-open="add-monitor-modal">
					+ Add your first monitor
				</button>
			</div>
			`
				: visible.length === 0
					? `<div class="table-card" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No monitors match this filter. <a href="${routes.home.href()}" style="color: var(--brand);">Show all</a></div>`
					: `
			<div class="table-card">
				<div class="table-header">
					<div>Monitor</div>
					<div>Recent checks</div>
					<div>Last response</div>
					<div style="text-align: right;">Actions</div>
				</div>

				${visible.map(renderMonitorRow).join("")}
			</div>
			`
		}
	`;

	return renderLayout({
		title: "Dashboard",
		children: content,
		currentPath: routes.home.href(),
		addMonitorForm: props.form,
	});
}

function renderNotice(notice?: DashboardNotice): string {
	if (!notice) return "";
	if (notice.kind === "test-alert-sent") {
		return `<div class="alert" role="status" style="border-color: var(--up-border); background: var(--up-bg); color: var(--up);">Test alert sent. Check your notification channel.</div>`;
	}
	if (notice.kind === "test-alert-failed") {
		return `<div class="alert alert-error" role="alert"><b>Test alert failed.</b> ${escapeHtml(notice.detail)}</div>`;
	}
	return `<div class="alert alert-error" role="alert">No alert channel is configured, so there is nothing to test.</div>`;
}

function renderMonitorRow(entry: DashboardMonitor): string {
	const m = entry.monitor;
	const status = displayStatus(entry);
	const isPaused = status === "paused";
	const dotClass = status === "pending" ? "paused" : status;
	const detailHref = routes.monitor.href({ id: m.id });

	const methodClass = `method-${m.method.toLowerCase()}`;
	const latencyDisplay = m.last_response_time_ms !== null ? `${m.last_response_time_ms}ms` : "—";
	const latencyColor =
		status === "down" ? "var(--down)" : status === "degraded" ? "var(--degraded)" : status === "up" ? "var(--up)" : "var(--text-muted)";

	const summary = isPaused
		? "Paused"
		: status === "pending"
			? "Waiting for first check"
			: `${formatPercentage(entry.uptimePercentage24h)} uptime (24h)`;

	return `
		<div class="table-row" style="${isPaused ? "opacity: 0.55;" : ""}">
			<div style="min-width: 0;">
				<div style="display: flex; align-items: center; gap: 7px;">
					<span class="status-dot ${dotClass}" title="${status}"></span>
					<a href="${detailHref}" style="font-weight: 600; color: var(--text-primary); font-size: 0.8125rem;">
						${escapeHtml(m.name)}
					</a>
					<span class="method-chip ${methodClass}">${escapeHtml(m.method)}</span>
					${m.is_public ? "" : `<span class="badge badge-pending" title="Hidden from the public status page">Private</span>`}
				</div>
				<div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
					${escapeHtml(m.url)}
				</div>
			</div>

			<div>
				${renderTimeline(entry.recentChecks, TIMELINE_LENGTH)}
				<div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-dim); font-family: var(--font-mono); margin-top: 4px;">
					<span>Older</span>
					<span style="color: ${status === "down" ? "var(--down)" : "var(--text-muted)"}; font-weight: 600;">${summary}</span>
					<span>Latest</span>
				</div>
			</div>

			<div>
				<div style="font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: ${latencyColor};">
					${latencyDisplay}
				</div>
				<div style="font-size: 10px; color: var(--text-dim);">
					${m.last_checked_at ? renderTime(m.last_checked_at) : `Expects ${m.expected_status}`}
				</div>
			</div>

			<div class="row-actions" style="display: flex; justify-content: flex-end; gap: 4px;">
				<form method="POST" action="${routes.checkMonitor.href({ id: m.id })}" style="display: inline;">
					<button type="submit" class="btn btn-secondary btn-sm" title="Run a check now" data-busy="Checking…">
						Check now
					</button>
				</form>

				<form method="POST" action="${routes.toggleMonitor.href({ id: m.id })}" style="display: inline;">
					<button type="submit" class="btn btn-secondary btn-sm">
						${isPaused ? "Resume" : "Pause"}
					</button>
				</form>

				<form method="POST" action="${routes.deleteMonitor.href({ id: m.id })}" style="display: inline;" data-confirm="${escapeHtml(`Delete “${m.name}” and all of its history?`)}">
					<button type="submit" class="btn btn-danger btn-sm" title="Delete monitor" aria-label="Delete ${escapeHtml(m.name)}">
						✕
					</button>
				</form>
			</div>
		</div>
	`;
}
