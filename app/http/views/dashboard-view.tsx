/**
 * Production Dashboard View for Uptime Monitor.
 * Tabular monitor list with each monitor's latest checks, 24h uptime and quick actions.
 */

import type { Handle } from "remix/component";
import type { DashboardMonitor } from "~/app/services/monitor-service";
import { CREATE_DIALOG_ID, type ChannelOption, type MonitorFormState } from "~/app/http/views/monitor-form-dialog";
import { Layout } from "~/app/http/views/layout";
import { formatPercentage, LocalTime, Timeline, TypeChip } from "~/app/http/views/ui";
import { daysLeft } from "~/app/services/expiry";
import routes from "~/routes/web";

export const TIMELINE_LENGTH = 45;

const dashboardFilters = ["all", "up", "down", "paused"] as const;
export type DashboardFilter = (typeof dashboardFilters)[number];

export function parseDashboardFilter(raw: string | null): DashboardFilter {
	return dashboardFilters.find((filter) => filter === raw) ?? "all";
}

export interface DashboardPageProps {
	monitors: DashboardMonitor[];
	filter: DashboardFilter;
	alertsEnabled: boolean;
	form?: MonitorFormState;
	channels?: ChannelOption[];
}

function displayStatus(entry: DashboardMonitor): "up" | "down" | "degraded" | "paused" | "pending" {
	if (!entry.monitor.is_enabled) return "paused";
	return entry.monitor.last_status ?? "pending";
}

export function DashboardPage(handle: Handle<DashboardPageProps>) {
	return () => {
		const props = handle.props;
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

		const filterLink = (filter: DashboardFilter, label: string, style?: string) => (
			<a
				href={`${routes.home.href()}${filter === "all" ? "" : `?filter=${filter}`}`}
				class={`filter-btn ${props.filter === filter ? "active" : ""}`}
				style={style}
			>
				{label}
			</a>
		);

		return (
			<Layout title="Dashboard" currentPath={routes.home.href()} addMonitorForm={props.form} channels={props.channels}>
				{props.alertsEnabled ? null : (
					<div class="alert alert-warning">
						<b>Alerts are off.</b> Checks still run, but nobody is notified when a monitor goes down.{" "}
						<a href={routes.alertChannels.href()} style="color: inherit; text-decoration: underline;">
							Add an alert channel
						</a>{" "}
						(Discord, Slack, ntfy.sh, Telegram, PagerDuty or any webhook).
					</div>
				)}

				{total === 0 ? null : (
					<>
						<div class="health-banner">
							<div style="display: flex; align-items: center; gap: 24px; flex-wrap: wrap;">
								<div style="display: flex; align-items: center; gap: 8px;">
									<span class={`status-dot ${downCount > 0 ? "down" : "up"}`}></span>
									<span style={`font-weight: 600; color: ${downCount > 0 ? "var(--down)" : "var(--text-primary)"};`}>
										{downCount > 0 ? `${downCount} of ${activeCount} down` : `All ${activeCount} active monitor${activeCount === 1 ? "" : "s"} up`}
									</span>
								</div>
								{pausedCount > 0 ? <div style="font-size: 12px; color: var(--text-muted);">{pausedCount} paused</div> : null}
							</div>

							<div style="display: flex; align-items: center; gap: 12px;">
								<span style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">Checks run every minute</span>
								{props.alertsEnabled ? (
									<form method="POST" action={routes.testAlert.href()}>
										<button type="submit" class="btn btn-secondary btn-sm" data-busy="Sending…">
											Send test alert
										</button>
									</form>
								) : null}
							</div>
						</div>

						<nav class="filter-bar" aria-label="Filter monitors">
							<div style="display: flex; gap: 6px; flex-wrap: wrap;">
								{filterLink("all", `All (${total})`)}
								{filterLink("up", `Up (${upCount})`)}
								{filterLink("down", `Down (${downCount})`, downCount > 0 ? "border-color: var(--down-border); color: #ff7b72;" : undefined)}
								{filterLink("paused", `Paused (${pausedCount})`)}
							</div>

							<div style="font-size: 11px; color: var(--text-dim);">Last {TIMELINE_LENGTH} checks · hover a bar for details</div>
						</nav>
					</>
				)}

				{total === 0 ? (
					<div class="table-card" style="text-align: center; padding: 3.5rem 2rem;">
						<h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.375rem; color: var(--text-primary);">Monitor your first URL</h3>
						<p style="color: var(--text-muted); font-size: 0.8125rem; margin-bottom: 1.5rem;">Three steps and you're covered:</p>
						<ol class="onboarding">
							<li>Add the URL of a page or health endpoint you want to watch.</li>
							<li>We check it right away, then on the schedule you pick.</li>
							<li>
								Share the{" "}
								<a href={routes.status.href()} style="color: var(--brand);">
									public status page
								</a>{" "}
								with your users.
							</li>
						</ol>
						<button type="button" class="btn btn-primary" data-dialog-open={CREATE_DIALOG_ID}>
							+ Add your first monitor
						</button>
					</div>
				) : visible.length === 0 ? (
					<div class="table-card" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
						No monitors match this filter.{" "}
						<a href={routes.home.href()} style="color: var(--brand);">
							Show all
						</a>
					</div>
				) : (
					<div class="table-card">
						<div class="table-header">
							<div>Monitor</div>
							<div>Recent checks</div>
							<div>Last response</div>
							<div style="text-align: right;">Actions</div>
						</div>

						{visible.map((entry) => (
							<MonitorRow key={entry.monitor.id} entry={entry} />
						))}
					</div>
				)}
			</Layout>
		);
	};
}

function MonitorRow(handle: Handle<{ entry: DashboardMonitor }>) {
	return () => {
		const entry = handle.props.entry;
		const m = entry.monitor;
		const status = displayStatus(entry);
		const isPaused = status === "paused";
		const dotClass = status === "pending" ? "paused" : status;

		const latencyColor =
			status === "down" ? "var(--down)" : status === "degraded" ? "var(--degraded)" : status === "up" ? "var(--up)" : "var(--text-muted)";

		const summary = isPaused
			? "Paused"
			: status === "pending"
				? m.type === "heartbeat"
					? "Waiting for first ping"
					: "Waiting for first check"
				: `${formatPercentage(entry.uptimePercentage24h)} uptime (24h)`;

		return (
			<div class="table-row" style={isPaused ? "opacity: 0.55;" : undefined}>
				<div style="min-width: 0;">
					<div style="display: flex; align-items: center; gap: 7px;">
						<span class={`status-dot ${dotClass}`} title={status}></span>
						<a href={routes.monitor.href({ id: m.id })} style="font-weight: 600; color: var(--text-primary); font-size: 0.8125rem;">
							{m.name}
						</a>
						<TypeChip monitor={m} />
						{m.is_public ? null : (
							<span class="badge badge-pending" title="Hidden from the public status page">
								Private
							</span>
						)}
						{entry.inMaintenance ? (
							<span class="badge badge-maintenance" title="In a maintenance window: no alerts">
								Maintenance
							</span>
						) : null}
						<ExpiryBadge monitor={m} />
					</div>
					<div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
						{m.type === "heartbeat" ? (
							m.last_ping_at ? (
								<>
									Last ping <LocalTime at={m.last_ping_at} />
								</>
							) : (
								"Waiting for the first ping"
							)
						) : m.type === "dns" ? (
							`${m.dns_record_type} ${m.url}`
						) : (
							m.url
						)}
					</div>
				</div>

				<div>
					<Timeline checks={entry.recentChecks} length={TIMELINE_LENGTH} />
					<div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-dim); font-family: var(--font-mono); margin-top: 4px;">
						<span>Older</span>
						<span style={`color: ${status === "down" ? "var(--down)" : "var(--text-muted)"}; font-weight: 600;`}>{summary}</span>
						<span>Latest</span>
					</div>
				</div>

				<div>
					<div style={`font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: ${latencyColor};`}>
						{m.type === "heartbeat"
							? status === "down"
								? "Late"
								: status === "pending"
									? "—"
									: "On time"
							: m.last_response_time_ms !== null
								? `${m.last_response_time_ms}ms`
								: "—"}
					</div>
					<div style="font-size: 10px; color: var(--text-dim);">
						{m.last_checked_at ? <LocalTime at={m.last_checked_at} /> : m.type === "http" ? `Expects ${m.expected_statuses}` : null}
					</div>
				</div>

				<div class="row-actions" style="display: flex; justify-content: flex-end; gap: 4px;">
					<form method="POST" action={routes.checkMonitor.href({ id: m.id })} style="display: inline;">
						<button type="submit" class="btn btn-secondary btn-sm" title="Run a check now" data-busy="Checking…">
							Check now
						</button>
					</form>

					<form method="POST" action={routes.toggleMonitor.href({ id: m.id })} style="display: inline;">
						<button type="submit" class="btn btn-secondary btn-sm">
							{isPaused ? "Resume" : "Pause"}
						</button>
					</form>

					<form
						method="POST"
						action={routes.deleteMonitor.href({ id: m.id })}
						style="display: inline;"
						data-confirm={`Delete “${m.name}” and all of its history?`}
					>
						<button type="submit" class="btn btn-danger btn-sm" title="Delete monitor" aria-label={`Delete ${m.name}`}>
							✕
						</button>
					</form>
				</div>
			</div>
		);
	};
}

/** Shown only when the certificate or domain is inside its warning period. */
function ExpiryBadge(handle: Handle<{ monitor: DashboardMonitor["monitor"] }>) {
	return () => {
		const m = handle.props.monitor;
		if (m.expiry_warning_days <= 0) return null;
		const now = Date.now();
		const soonest = [
			{ what: "SSL", at: m.cert_expires_at },
			{ what: "Domain", at: m.domain_expires_at },
		]
			.filter((e): e is { what: string; at: number } => e.at !== null && daysLeft(e.at, now) <= m.expiry_warning_days)
			.sort((a, b) => a.at - b.at)[0];
		if (!soonest) return null;
		const days = daysLeft(soonest.at, now);
		return (
			<span class={`badge ${days < 0 ? "badge-down" : "badge-degraded"}`} title={`${soonest.what} expiry`}>
				{soonest.what} {days < 0 ? "expired" : `${days}d`}
			</span>
		);
	};
}
