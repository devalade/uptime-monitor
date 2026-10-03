/**
 * Production Dashboard View for Uptime Monitor.
 * Tabular monitor list with each monitor's latest checks, 24h uptime and quick actions.
 */

import { css, type Handle } from "remix/component";
import type { DashboardMonitor } from "~/app/services/monitor-service";
import { CREATE_DIALOG_ID, type ChannelOption, type MonitorFormState } from "~/app/http/views/monitor-form-dialog";
import { Layout } from "~/app/http/views/layout";
import { alert, badge, button, filterButton, link, statusDot, underlinedLink } from "~/app/http/views/styles";
import { formatPercentage, LocalTime, Timeline, TypeChip } from "~/app/http/views/ui";
import { daysLeft } from "~/app/services/expiry";
import routes from "~/routes/web";

export const TIMELINE_LENGTH = 45;

const healthBanner = css({
	background: "var(--bg-surface)",
	border: "1px solid var(--border-medium)",
	borderRadius: "6px",
	padding: "0.875rem 1.25rem",
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	flexWrap: "wrap",
	gap: "1rem",
	marginBottom: "1.5rem",
});
const healthSummary = css({ display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" });
const healthHeadline = css({ display: "flex", alignItems: "center", gap: "8px" });
const healthHeadlineText = css({ fontWeight: "600", color: "var(--text-primary)" });
const healthHeadlineDown = css({ fontWeight: "600", color: "var(--down)" });
const pausedNote = css({ fontSize: "12px", color: "var(--text-muted)" });
const healthMeta = css({ display: "flex", alignItems: "center", gap: "12px" });
const healthMetaNote = css({ fontSize: "11px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" });
const filterBar = css({
	display: "flex",
	gap: "6px",
	marginBottom: "14px",
	alignItems: "center",
	justifyContent: "space-between",
	flexWrap: "wrap",
});
const filterGroup = css({ display: "flex", gap: "6px", flexWrap: "wrap" });
const filterCaption = css({ fontSize: "11px", color: "var(--text-dim)" });

const tableCard = css({
	border: "1px solid var(--border-medium)",
	borderRadius: "6px",
	background: "var(--bg-surface)",
	overflow: "hidden",
});
const emptyCard = css({
	border: "1px solid var(--border-medium)",
	borderRadius: "6px",
	background: "var(--bg-surface)",
	overflow: "hidden",
	textAlign: "center",
	padding: "3.5rem 2rem",
});
const noMatchCard = css({
	border: "1px solid var(--border-medium)",
	borderRadius: "6px",
	background: "var(--bg-surface)",
	overflow: "hidden",
	textAlign: "center",
	padding: "2.5rem",
	color: "var(--text-muted)",
});
const emptyTitle = css({ fontSize: "1rem", fontWeight: "600", marginBottom: "0.375rem", color: "var(--text-primary)" });
const emptyLead = css({ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: "1.5rem" });
const onboarding = css({
	listStyle: "none",
	counterReset: "step",
	textAlign: "left",
	maxWidth: "420px",
	margin: "0 auto 1.5rem",
	"& li": {
		counterIncrement: "step",
		display: "flex",
		gap: "10px",
		marginBottom: "0.625rem",
		color: "var(--text-muted)",
		fontSize: "0.8125rem",
	},
	"& li::before": {
		content: "counter(step)",
		flexShrink: 0,
		width: "20px",
		height: "20px",
		borderRadius: "50%",
		background: "var(--bg-surface-active)",
		border: "1px solid var(--border-medium)",
		color: "var(--text-primary)",
		fontSize: "11px",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
	},
});

const columns = "260px 1fr 110px 190px";
const tableHeader = css({
	display: "grid",
	gridTemplateColumns: columns,
	gap: "20px",
	padding: "10px 18px",
	background: "var(--bg-root)",
	borderBottom: "1px solid var(--border-subtle)",
	fontSize: "11px",
	fontWeight: "600",
	color: "var(--text-muted)",
	textTransform: "uppercase",
	letterSpacing: "0.04em",
	"@media (max-width: 900px)": { display: "none" },
});
const tableHeaderRight = css({ textAlign: "right" });

const rowBase = {
	display: "grid",
	gridTemplateColumns: columns,
	gap: "20px",
	padding: "12px 18px",
	alignItems: "center",
	borderBottom: "1px solid var(--border-subtle)",
	transition: "background 80ms ease",
	"&:last-child": { borderBottom: "none" },
	"&:hover": { background: "var(--bg-surface-hover)" },
	"@media (max-width: 900px)": { gridTemplateColumns: "1fr", gap: "10px" },
};
const tableRow = css(rowBase);
const tableRowPaused = css({ ...rowBase, opacity: 0.55 });

const monitorCell = css({ minWidth: 0 });
const monitorTitle = css({ display: "flex", alignItems: "center", gap: "7px" });
const monitorName = css({ fontWeight: "600", color: "var(--text-primary)", fontSize: "0.8125rem" });
const monitorTarget = css({
	fontSize: "11px",
	color: "var(--text-muted)",
	fontFamily: "var(--font-mono)",
	marginTop: "3px",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
});
const timelineLegend = css({
	display: "flex",
	justifyContent: "space-between",
	fontSize: "10px",
	color: "var(--text-dim)",
	fontFamily: "var(--font-mono)",
	marginTop: "4px",
});
const summaryText = css({ color: "var(--text-muted)", fontWeight: "600" });
const summaryTextDown = css({ color: "var(--down)", fontWeight: "600" });

const latencyBase = { fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: "600" };
const latency = {
	up: css({ ...latencyBase, color: "var(--up)" }),
	degraded: css({ ...latencyBase, color: "var(--degraded)" }),
	down: css({ ...latencyBase, color: "var(--down)" }),
	idle: css({ ...latencyBase, color: "var(--text-muted)" }),
};
const latencyCaption = css({ fontSize: "10px", color: "var(--text-dim)" });
const actions = css({
	display: "flex",
	justifyContent: "flex-end",
	gap: "4px",
	"@media (max-width: 900px)": { justifyContent: "flex-start" },
});
const inlineForm = css({ display: "inline" });

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

		const filterLink = (filter: DashboardFilter, label: string, alarming = false) => (
			<a
				href={`${routes.home.href()}${filter === "all" ? "" : `?filter=${filter}`}`}
				mix={props.filter === filter ? filterButton.active : alarming ? filterButton.idleDown : filterButton.idle}
			>
				{label}
			</a>
		);

		return (
			<Layout title="Dashboard" currentPath={routes.home.href()} addMonitorForm={props.form} channels={props.channels}>
				{props.alertsEnabled ? null : (
					<div mix={alert.warning}>
						<b>Alerts are off.</b> Checks still run, but nobody is notified when a monitor goes down.{" "}
						<a href={routes.alertChannels.href()} mix={underlinedLink}>
							Add an alert channel
						</a>{" "}
						(Discord, Slack, ntfy.sh, Telegram, PagerDuty or any webhook).
					</div>
				)}

				{total === 0 ? null : (
					<>
						<div mix={healthBanner}>
							<div mix={healthSummary}>
								<div mix={healthHeadline}>
									<span mix={downCount > 0 ? statusDot.down : statusDot.up}></span>
									<span mix={downCount > 0 ? healthHeadlineDown : healthHeadlineText}>
										{downCount > 0 ? `${downCount} of ${activeCount} down` : `All ${activeCount} active monitor${activeCount === 1 ? "" : "s"} up`}
									</span>
								</div>
								{pausedCount > 0 ? <div mix={pausedNote}>{pausedCount} paused</div> : null}
							</div>

							<div mix={healthMeta}>
								<span mix={healthMetaNote}>Checks run every minute</span>
								{props.alertsEnabled ? (
									<form method="POST" action={routes.testAlert.href()}>
										<button type="submit" mix={button.secondarySmall} data-busy="Sending…">
											Send test alert
										</button>
									</form>
								) : null}
							</div>
						</div>

						<nav mix={filterBar} aria-label="Filter monitors">
							<div mix={filterGroup}>
								{filterLink("all", `All (${total})`)}
								{filterLink("up", `Up (${upCount})`)}
								{filterLink("down", `Down (${downCount})`, downCount > 0)}
								{filterLink("paused", `Paused (${pausedCount})`)}
							</div>

							<div mix={filterCaption}>Last {TIMELINE_LENGTH} checks · hover a bar for details</div>
						</nav>
					</>
				)}

				{total === 0 ? (
					<div mix={emptyCard}>
						<h3 mix={emptyTitle}>Monitor your first URL</h3>
						<p mix={emptyLead}>Three steps and you're covered:</p>
						<ol mix={onboarding}>
							<li>Add the URL of a page or health endpoint you want to watch.</li>
							<li>We check it right away, then on the schedule you pick.</li>
							<li>
								Share the{" "}
								<a href={routes.status.href()} mix={link}>
									public status page
								</a>{" "}
								with your users.
							</li>
						</ol>
						<button type="button" mix={button.primary} data-dialog-open={CREATE_DIALOG_ID}>
							+ Add your first monitor
						</button>
					</div>
				) : visible.length === 0 ? (
					<div mix={noMatchCard}>
						No monitors match this filter.{" "}
						<a href={routes.home.href()} mix={link}>
							Show all
						</a>
					</div>
				) : (
					<div mix={tableCard}>
						<div mix={tableHeader}>
							<div>Monitor</div>
							<div>Recent checks</div>
							<div>Last response</div>
							<div mix={tableHeaderRight}>Actions</div>
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
		const dot = statusDot[status === "pending" ? "paused" : status];

		const latencyStyle = status === "down" ? latency.down : status === "degraded" ? latency.degraded : status === "up" ? latency.up : latency.idle;

		const summary = isPaused
			? "Paused"
			: status === "pending"
				? m.type === "heartbeat"
					? "Waiting for first ping"
					: "Waiting for first check"
				: `${formatPercentage(entry.uptimePercentage24h)} uptime (24h)`;

		return (
			<div mix={isPaused ? tableRowPaused : tableRow}>
				<div mix={monitorCell}>
					<div mix={monitorTitle}>
						<span mix={dot} title={status}></span>
						<a href={routes.monitor.href({ id: m.id })} mix={monitorName}>
							{m.name}
						</a>
						<TypeChip monitor={m} />
						{m.is_public ? null : (
							<span mix={badge.pending} title="Hidden from the public status page">
								Private
							</span>
						)}
						{entry.inMaintenance ? (
							<span mix={badge.maintenance} title="In a maintenance window: no alerts">
								Maintenance
							</span>
						) : null}
						<ExpiryBadge monitor={m} />
					</div>
					<div mix={monitorTarget}>
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
					<div mix={timelineLegend}>
						<span>Older</span>
						<span mix={status === "down" ? summaryTextDown : summaryText}>{summary}</span>
						<span>Latest</span>
					</div>
				</div>

				<div>
					<div mix={latencyStyle}>
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
					<div mix={latencyCaption}>
						{m.last_checked_at ? <LocalTime at={m.last_checked_at} /> : m.type === "http" ? `Expects ${m.expected_statuses}` : null}
					</div>
				</div>

				<div mix={actions}>
					<form method="POST" action={routes.checkMonitor.href({ id: m.id })} mix={inlineForm}>
						<button type="submit" mix={button.secondarySmall} title="Run a check now" data-busy="Checking…">
							Check now
						</button>
					</form>

					<form method="POST" action={routes.toggleMonitor.href({ id: m.id })} mix={inlineForm}>
						<button type="submit" mix={button.secondarySmall}>
							{isPaused ? "Resume" : "Pause"}
						</button>
					</form>

					<form
						method="POST"
						action={routes.deleteMonitor.href({ id: m.id })}
						mix={inlineForm}
						data-confirm={`Delete “${m.name}” and all of its history?`}
					>
						<button type="submit" mix={button.dangerSmall} title="Delete monitor" aria-label={`Delete ${m.name}`}>
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
			<span mix={days < 0 ? badge.down : badge.degraded} title={`${soonest.what} expiry`}>
				{soonest.what} {days < 0 ? "expired" : `${days}d`}
			</span>
		);
	};
}
