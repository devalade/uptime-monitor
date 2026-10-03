/**
 * Modern Monitor Detail View for Uptime Monitor.
 * Displays real-time status, latency metrics, recent check history, and incidents log.
 */

import { css, type CSSMixinDescriptor, type Handle } from "remix/component";
import { formatSeconds, parseRegionSnapshot, type MonitorDetailData } from "~/app/services/monitor-service";
import { daysLeft, httpsTarget } from "~/app/services/expiry";
import type { UptimePeriod } from "~/app/services/uptime-stats";
import { Layout } from "~/app/http/views/layout";
import {
	card,
	cardSplit,
	cardTitle,
	cardTitleFlush,
	cardHeaderRow,
	sectionTitle,
	sectionHeader,
	dim,
	dimSpaced,
	mono,
	button,
	badge,
	alert,
	statsGrid,
	statCard,
	statCardEmpty,
	statLabel,
	statValue,
	statValueMono,
	statUnit,
	statCaption,
	statLine,
	dataTable,
	tableRow,
	tableHead,
	tableCell,
	tableCellPlainMono,
	tableCellMono,
	tableCellMonoBold,
	tableCellMuted,
	settingsList,
	copyFieldSpaced,
} from "~/app/http/views/styles";
import { formatDuration, formatPercentage, LocalTime, ResponseChart, TypeChip } from "~/app/http/views/ui";
import { EDIT_DIALOG_ID, MonitorDialog, type ChannelOption, type MonitorFormState } from "~/app/http/views/monitor-form-dialog";
import { settingsToFormValues } from "~/app/services/monitor-input";
import { monitorSettings } from "~/app/services/monitor-service";
import { parseIdList } from "~/app/services/alerting";
import type { SelectMonitor } from "~/database/schema";
import routes from "~/routes/web";

export interface MonitorDetailPageProps {
	data: MonitorDetailData;
	uptime: Record<UptimePeriod, number | null>;
	channels: ChannelOption[];
	/** Full URL heartbeat jobs call; set for heartbeat monitors. */
	pingUrl?: string;
	/** A rejected edit, re-shown in the open dialog. */
	editForm?: MonitorFormState;
}

const statusBadges: Record<string, CSSMixinDescriptor> = { up: badge.up, down: badge.down, degraded: badge.degraded };

const backLinkRow = css({ marginBottom: "1.5rem" });
const backLink = css({
	fontSize: "0.8125rem",
	fontWeight: "500",
	color: "var(--text-muted)",
	display: "inline-flex",
	alignItems: "center",
	gap: "0.5rem",
	transition: "color 150ms ease",
});
const hero = css({
	background: "var(--bg-surface)",
	border: "1px solid var(--border-subtle)",
	borderRadius: "1rem",
	padding: "2rem",
	marginBottom: "2rem",
	boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.5)",
});
const heroLayout = css({ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1.5rem" });
const heroBadges = css({ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" });
const heroTitle = css({ fontSize: "1.75rem", fontWeight: "700", letterSpacing: "-0.02em", color: "#fff", marginBottom: "0.375rem" });
const heroTarget = css({
	fontFamily: "var(--font-mono)",
	fontSize: "0.875rem",
	color: "var(--text-muted)",
	display: "flex",
	alignItems: "center",
	gap: "0.5rem",
});
const heroActions = css({ display: "flex", gap: "0.625rem", flexWrap: "wrap" });

const emptyIcon = css({
	width: "42px",
	height: "42px",
	borderRadius: "50%",
	background: "var(--up-bg)",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	margin: "0 auto 0.75rem",
});
const emptyTitle = css({ fontSize: "1rem", fontWeight: "600", color: "#fff", marginBottom: "0.25rem" });
const emptyText = css({ color: "var(--text-muted)", fontSize: "0.8125rem" });
const historySection = css({ marginBottom: "3rem" });
const incidentPanel = css({
	background: "var(--bg-surface)",
	border: "1px solid var(--border-subtle)",
	borderRadius: "0.75rem",
	overflow: "hidden",
});
const telemetryPanel = css({
	background: "var(--bg-surface)",
	border: "1px solid var(--border-subtle)",
	borderRadius: "0.75rem",
	overflow: "hidden",
	boxShadow: "0 4px 16px -2px rgba(0, 0, 0, 0.3)",
});
const noProbes = css({ textAlign: "center", color: "var(--text-muted)", padding: "3rem" });

const latencyBase = { fontFamily: "var(--font-mono)", fontWeight: "600" };
const latencyCell = {
	fast: css({ ...latencyBase, padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", color: "var(--up)" }),
	medium: css({ ...latencyBase, padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", color: "var(--degraded)" }),
	slow: css({ ...latencyBase, padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", color: "var(--down)" }),
};
const detailsBase = { padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", fontSize: "0.8125rem" };
const detailsCell = {
	ok: css({ ...detailsBase, color: "var(--text-muted)" }),
	failed: css({ ...detailsBase, color: "var(--down)" }),
};
const targetLink = css({ color: "var(--text-secondary)", textDecoration: "underline", textUnderlineOffset: "3px" });
const targetText = css({ color: "var(--text-secondary)" });
const targetIcon = css({ color: "var(--text-dim)" });

const expiryGrid = css({
	display: "grid",
	gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
	gap: "1.25rem",
	fontSize: "0.8125rem",
});
const expiryWarn = css({ color: "var(--degraded)", marginTop: "0.25rem" });
const expiryColor = {
	up: css({ fontSize: "1.125rem", fontWeight: "700", marginTop: "0.375rem", color: "var(--up)" }),
	degraded: css({ fontSize: "1.125rem", fontWeight: "700", marginTop: "0.375rem", color: "var(--degraded)" }),
	down: css({ fontSize: "1.125rem", fontWeight: "700", marginTop: "0.375rem", color: "var(--down)" }),
	unknown: css({ fontSize: "1.125rem", fontWeight: "700", marginTop: "0.375rem", color: "var(--text-muted)" }),
};
const copyLead = css({ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: "0.75rem" });

export function MonitorDetailPage(handle: Handle<MonitorDetailPageProps>) {
	return () => {
		const props = handle.props;
		const data = props.data;
		const m = data.monitor;
		const isPaused = !m.is_enabled;
		const status = isPaused ? "paused" : m.last_status ?? "pending";

		return (
			<Layout title={m.name} channels={props.channels}>
				<div mix={backLinkRow}>
					<a href={routes.home.href()} mix={backLink}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="19" y1="12" x2="5" y2="12"></line>
							<polyline points="12 19 5 12 12 5"></polyline>
						</svg>
						Back to All Monitors
					</a>
				</div>

				<div mix={hero}>
					<div mix={heroLayout}>
						<div>
							<div mix={heroBadges}>
								<span mix={statusBadges[status] ?? badge.pending}>
									{isPaused ? "PAUSED" : status.toUpperCase()}
								</span>
								<TypeChip monitor={m} />
								{data.inMaintenance ? <span mix={badge.maintenance}>Maintenance</span> : null}
							</div>
							<h1 mix={heroTitle}>{m.name}</h1>
							<p mix={heroTarget}>
								<MonitorTarget monitor={m} />
							</p>
						</div>

						<div mix={heroActions}>
							<button type="button" mix={button.secondarySmall} data-dialog-open={EDIT_DIALOG_ID}>
								Edit
							</button>
							<form method="POST" action={routes.checkMonitor.href({ id: m.id })}>
								<button type="submit" mix={button.primarySmall} data-busy="Checking…">
									<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="23 4 23 10 17 10"></polyline>
										<polyline points="1 20 1 14 7 14"></polyline>
										<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
									</svg>
									Check Now
								</button>
							</form>
							<form method="POST" action={routes.toggleMonitor.href({ id: m.id })}>
								<button type="submit" mix={button.secondarySmall}>
									{m.is_enabled ? (
										<>
											<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<rect x="6" y="4" width="4" height="16"></rect>
												<rect x="14" y="4" width="4" height="16"></rect>
											</svg>{" "}
											Pause
										</>
									) : (
										<>
											<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<polygon points="5 3 19 12 5 21 5 3"></polygon>
											</svg>{" "}
											Resume
										</>
									)}
								</button>
							</form>
							<form method="POST" action={routes.toggleVisibility.href({ id: m.id })}>
								<button
									type="submit"
									mix={button.secondarySmall}
									title={m.is_public ? "Currently shown on the public status page" : "Currently hidden from the public status page"}
								>
									{m.is_public ? "Hide from status page" : "Show on status page"}
								</button>
							</form>
							<form
								method="POST"
								action={routes.deleteMonitor.href({ id: m.id })}
								data-confirm={`Delete “${m.name}” and all of its history? This cannot be undone.`}
							>
								<button type="submit" mix={button.dangerSmall}>
									<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="3 6 5 6 21 6"></polyline>
										<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
									</svg>
									Delete
								</button>
							</form>
						</div>
					</div>
				</div>

				{data.inMaintenance ? (
					<div mix={alert.maintenance}>
						This monitor is in a maintenance window. Checks still run, but no incident is opened and nobody is alerted.
					</div>
				) : null}

				{m.type === "heartbeat" && props.pingUrl ? <HeartbeatSetup monitor={m} pingUrl={props.pingUrl} /> : null}

				<section mix={statsGrid}>
					<div mix={statCard}>
						<div mix={statLabel}>24h Uptime</div>
						<div mix={statValue} style={{ color: uptimeColor(data.uptimePercentage24h) }}>
							{formatPercentage(data.uptimePercentage24h)}
						</div>
						<div mix={statCaption}>
							{data.uptimePercentage24h === null ? "No checks in the last 24 hours" : "Successful checks, last 24 hours"}
						</div>
					</div>

					<div mix={statCard}>
						<div mix={statLabel}>Uptime 7 / 30 / 90 days</div>
						<div mix={statLine}>
							{([7, 30, 90] as const).map((days) => (
								<span style={{ color: uptimeColor(props.uptime[days]) }} title={`Last ${days} days`}>
									{formatPercentage(props.uptime[days])}
								</span>
							))}
						</div>
						<div mix={statCaption}>From daily totals, updated hourly</div>
					</div>

					{m.type === "heartbeat" ? (
						<div mix={statCard}>
							<div mix={statLabel}>Last ping</div>
							<div mix={statValueMono}>
								{m.last_ping_at ? <LocalTime at={m.last_ping_at} /> : "Never"}
							</div>
							<div mix={statCaption}>
								Expected every {formatSeconds(m.interval_seconds)}, {formatSeconds(m.grace_seconds)} grace
							</div>
						</div>
					) : (
						<div mix={statCard}>
							<div mix={statLabel}>Average response</div>
							<div mix={statValue}>
								{data.averageLatencyMs}
								<span mix={statUnit}>ms</span>
							</div>
							<div mix={statCaption}>Over the last {data.results.length} checks</div>
						</div>
					)}

					<div mix={statCard}>
						<div mix={statLabel}>Last Checked</div>
						<div mix={statValueMono}>
							{m.last_checked_at ? <LocalTime at={m.last_checked_at} /> : "Never"}
						</div>
						<div mix={statCaption}>
							{isPaused ? (
								"Paused — resume to check again"
							) : m.next_due_at ? (
								<>
									Next check around <LocalTime at={Math.max(m.next_due_at, Date.now())} />
								</>
							) : (
								"Next check within a minute"
							)}
						</div>
					</div>
				</section>

				<section mix={cardSplit}>
					<div>
						<h2 mix={cardTitle}>Settings</h2>
						<dl mix={settingsList}>
							{describeSettings(m).map(([term, detail]) => (
								<div>
									<dt>{term}</dt>
									<dd>{detail}</dd>
								</div>
							))}
						</dl>
					</div>
					{m.type === "heartbeat" ? null : (
						<div>
							<h2 mix={cardTitle}>Response time</h2>
							<ResponseChart
								checks={[...data.results].reverse().map((r) => ({
									status: !r.is_up ? "down" : r.error_message ? "degraded" : "up",
									checkedAt: r.created_at,
									responseTimeMs: r.response_time_ms,
									statusCode: r.response_status,
								}))}
							/>
						</div>
					)}
				</section>

				{m.type === "http" && httpsTarget(m.url) ? <ExpiryCard monitor={m} /> : null}

				{m.type === "heartbeat" ? null : <RegionsCard monitor={m} />}

				<section mix={historySection}>
					<div mix={sectionHeader}>
						<h2 mix={sectionTitle}>Incident History ({data.incidents.length})</h2>
					</div>

					{data.incidents.length === 0 ? (
						<div mix={statCardEmpty}>
							<div mix={emptyIcon}>
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--up)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
									<polyline points="20 6 9 17 4 12"></polyline>
								</svg>
							</div>
							<h3 mix={emptyTitle}>No incidents</h3>
							<p mix={emptyText}>This monitor has not had an outage yet.</p>
						</div>
					) : (
						<div mix={incidentPanel}>
							<table mix={dataTable}>
								<thead>
									<tr>
										<th mix={tableHead}>Started At</th>
										<th mix={tableHead}>Resolved At</th>
										<th mix={tableHead}>Duration</th>
										<th mix={tableHead}>Failure Cause</th>
									</tr>
								</thead>
								<tbody>
									{data.incidents.map((inc) => (
										<tr key={inc.id} mix={tableRow}>
											<td mix={tableCellMono}>
												<LocalTime at={inc.started_at} />
											</td>
											<td mix={tableCellMono}>
												{inc.resolved_at ? <LocalTime at={inc.resolved_at} /> : "Ongoing"}
											</td>
											<td mix={tableCell}>
												{inc.resolved_at ? formatDuration(inc.resolved_at - inc.started_at) : <span mix={badge.down}>Active</span>}
											</td>
											<td mix={tableCell}>{inc.cause}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>

				<section>
					<div mix={sectionHeader}>
						<h2 mix={sectionTitle}>Recent Probe Telemetry ({data.results.length})</h2>
					</div>

					<div mix={telemetryPanel}>
						<table mix={dataTable}>
							<thead>
								<tr>
									<th mix={tableHead}>Timestamp</th>
									<th mix={tableHead}>Status</th>
									<th mix={tableHead}>HTTP Code</th>
									<th mix={tableHead}>Latency</th>
									<th mix={tableHead}>Details</th>
								</tr>
							</thead>
							<tbody>
								{data.results.length === 0 ? (
									<tr>
										<td colSpan={5} mix={noProbes}>
											{m.type === "heartbeat" ? "No pings recorded yet." : 'No probes recorded yet. Click "Check Now" above to run an instant health check.'}
										</td>
									</tr>
								) : (
									data.results.map((r) => {
										const latency =
											r.response_time_ms && r.response_time_ms < 500
												? latencyCell.fast
												: r.response_time_ms && r.response_time_ms < 1500
													? latencyCell.medium
													: latencyCell.slow;
										return (
											<tr key={r.id} mix={tableRow}>
												<td mix={tableCellMono}>
													<LocalTime at={r.created_at} />
												</td>
												<td mix={tableCell}>
													{!r.is_up ? (
														<span mix={badge.down}>DOWN</span>
													) : r.error_message ? (
														<span mix={badge.degraded}>SLOW</span>
													) : (
														<span mix={badge.up}>UP</span>
													)}
													{r.is_maintenance ? (
														<>
															{" "}
															<span mix={badge.maintenance} title="During maintenance: not counted in uptime">
																MAINT
															</span>
														</>
													) : null}
												</td>
												<td mix={tableCellMonoBold}>{r.response_status ?? "-"}</td>
												<td mix={latency}>
													{r.response_time_ms !== null ? `${r.response_time_ms}ms` : "-"}
												</td>
												<td mix={r.is_up ? detailsCell.ok : detailsCell.failed}>{r.error_message ?? "OK"}</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>
				</section>

				<MonitorDialog
					mode="edit"
					monitorId={m.id}
					initialValues={settingsToFormValues(monitorSettings(m))}
					form={props.editForm}
					channels={props.channels}
				/>
			</Layout>
		);
	};
}

/** What the monitor checks: a link for http, host and port for tcp, the record for dns. */
function MonitorTarget(handle: Handle<{ monitor: SelectMonitor }>) {
	return () => {
		const m = handle.props.monitor;
		if (m.type === "http") {
			return (
				<>
					<a href={/^https?:\/\//i.test(m.url) ? m.url : "#"} target="_blank" rel="noopener" mix={targetLink}>
						{m.url}
					</a>
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						mix={targetIcon}
					>
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
						<polyline points="15 3 21 3 21 9"></polyline>
						<line x1="10" y1="14" x2="21" y2="3"></line>
					</svg>
				</>
			);
		}
		if (m.type === "tcp") return <span mix={targetText}>tcp://{m.url}</span>;
		if (m.type === "dns") return <span mix={targetText}>{`${m.dns_record_type} ${m.url}`}</span>;
		return <span>Heartbeat monitor</span>;
	};
}

function ExpiryCard(handle: Handle<{ monitor: SelectMonitor }>) {
	return () => {
		const m = handle.props.monitor;
		const now = Date.now();
		const describe = (expiresAt: number | null) => {
			if (expiresAt === null) return { text: "Unknown", mix: expiryColor.unknown };
			const days = daysLeft(expiresAt, now);
			const mix = days < 0 ? expiryColor.down : m.expiry_warning_days > 0 && days <= m.expiry_warning_days ? expiryColor.degraded : expiryColor.up;
			return { text: days < 0 ? `Expired ${-days} day${days === -1 ? "" : "s"} ago` : `${days} day${days === 1 ? "" : "s"} left`, mix };
		};
		const cert = describe(m.cert_expires_at);
		const domain = describe(m.domain_expires_at);

		return (
			<section mix={card}>
				<div mix={cardHeaderRow}>
					<h2 mix={cardTitleFlush}>Certificate and domain</h2>
					<form method="POST" action={routes.checkExpiry.href({ id: m.id })}>
						<button type="submit" mix={button.secondarySmall} data-busy="Checking…">
							Check now
						</button>
					</form>
				</div>
				<div mix={expiryGrid}>
					<div>
						<div mix={statLabel}>TLS certificate</div>
						<div mix={cert.mix}>{cert.text}</div>
						<div mix={dimSpaced}>
							{m.cert_expires_at ? (
								<>
									Expires <LocalTime at={m.cert_expires_at} format="date" />
									{m.cert_issuer ? ` · issued by ${m.cert_issuer}` : null}
								</>
							) : null}
							{m.cert_error ? <div mix={expiryWarn}>{m.cert_error}</div> : null}
							{m.cert_checked_at ? (
								<div>
									Checked <LocalTime at={m.cert_checked_at} />
								</div>
							) : (
								<div>Not checked yet</div>
							)}
						</div>
					</div>
					<div>
						<div mix={statLabel}>Domain registration</div>
						<div mix={domain.mix}>{domain.text}</div>
						<div mix={dimSpaced}>
							{m.domain_expires_at ? (
								<>
									Expires <LocalTime at={m.domain_expires_at} format="date" />
								</>
							) : m.domain_checked_at ? (
								"The registry does not publish an expiry date for this domain."
							) : null}
							{m.domain_checked_at ? (
								<div>
									Checked <LocalTime at={m.domain_checked_at} />
								</div>
							) : (
								<div>Not checked yet</div>
							)}
						</div>
					</div>
				</div>
			</section>
		);
	};
}

const regionBadges: Record<string, { mix: CSSMixinDescriptor; label: string }> = {
	up: { mix: badge.up, label: "UP" },
	degraded: { mix: badge.degraded, label: "SLOW" },
	down: { mix: badge.down, label: "DOWN" },
};

function RegionsCard(handle: Handle<{ monitor: SelectMonitor }>) {
	return () => {
		const m = handle.props.monitor;
		const snapshot = parseRegionSnapshot(m.region_results);

		return (
			<section mix={card}>
				<div mix={cardHeaderRow}>
					<div>
						<h2 mix={cardTitleFlush}>From every region</h2>
						<p mix={dimSpaced}>
							{snapshot ? (
								<>
									Checked <LocalTime at={snapshot.checkedAt} />. Also updated whenever a failure is confirmed.
								</>
							) : (
								"See how the service answers from each Cloudflare probe region."
							)}
						</p>
					</div>
					<form method="POST" action={routes.checkRegions.href({ id: m.id })}>
						<button type="submit" mix={button.secondarySmall} data-busy="Checking…">
							Check from every region
						</button>
					</form>
				</div>
				{snapshot ? (
					<table mix={dataTable}>
						<thead>
							<tr>
								<th mix={tableHead}>Location</th>
								<th mix={tableHead}>Status</th>
								<th mix={tableHead}>Time</th>
								<th mix={tableHead}>Details</th>
							</tr>
						</thead>
						<tbody>
							{snapshot.results.map((r) => {
								const regionBadge = regionBadges[r.status] ?? { mix: badge.pending, label: "ERROR" };
								return (
									<tr mix={tableRow}>
										<td mix={tableCell}>{r.label}</td>
										<td mix={tableCell}>
											<span mix={regionBadge.mix}>{regionBadge.label}</span>
										</td>
										<td mix={tableCellPlainMono}>{r.responseTimeMs !== null ? `${r.responseTimeMs}ms` : "-"}</td>
										<td mix={tableCellMuted}>{r.errorMessage ?? "OK"}</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				) : null}
			</section>
		);
	};
}

function uptimeColor(value: number | null): string {
	if (value === null) return "var(--text-muted)";
	if (value >= 99) return "var(--up)";
	if (value >= 95) return "var(--degraded)";
	return "var(--down)";
}

function HeartbeatSetup(handle: Handle<{ monitor: SelectMonitor; pingUrl: string }>) {
	return () => {
		const { monitor: m, pingUrl } = handle.props;
		const curl = `curl -fsS -m 10 --retry 3 ${pingUrl}`;
		return (
			<section mix={card}>
				<h2 mix={cardTitle}>Ping this URL from your job</h2>
				<p mix={copyLead}>
					Call it each time the job succeeds.{" "}
					{m.last_ping_at ? null : "The monitor stays pending until the first ping, so nobody is paged before you set it up. "}
					Keep it secret: anyone with the URL can report in.
				</p>
				<div mix={copyFieldSpaced}>
					<code>{pingUrl}</code>
					<button type="button" mix={button.secondarySmall} data-copy={pingUrl}>
						Copy
					</button>
				</div>
				<div mix={copyFieldSpaced}>
					<code>{curl}</code>
					<button type="button" mix={button.secondarySmall} data-copy={curl}>
						Copy
					</button>
				</div>
				<p mix={dim}>
					Report a failure straight away with <code mix={mono}>{`${pingUrl}/fail`}</code>. GET, POST and HEAD all work.
				</p>
			</section>
		);
	};
}

/** The monitor's settings as label/value pairs. */
function describeSettings(m: SelectMonitor): [string, string][] {
	const rows: [string, string][] = [];
	const channels = parseIdList(m.alert_channel_ids);

	if (m.type === "heartbeat") {
		rows.push(["Expected every", formatSeconds(m.interval_seconds)], ["Grace period", formatSeconds(m.grace_seconds)]);
	} else {
		rows.push(["Checked every", formatSeconds(m.interval_seconds)], ["Timeout", `${m.timeout_seconds}s`], ["Slow after", `${m.degraded_after_ms}ms`]);
	}

	if (m.type === "dns") {
		rows.push(["Record", `${m.dns_record_type} ${m.url}`], ["Must contain", m.dns_expected ? m.dns_expected : "any answer"]);
	}

	if (m.type === "http") {
		rows.push(["Accepted status", m.expected_statuses]);
		if (m.request_headers) rows.push(["Headers", `${m.request_headers.split(/\r?\n/).filter((l) => l.trim()).length} custom`]);
		if (m.request_body) rows.push(["Body", `${m.request_body.length} characters`]);
		if (m.keyword) rows.push([m.keyword_mode === "not_contains" ? "Must not contain" : "Must contain", `"${m.keyword}"`]);
		if (m.json_path) rows.push(["JSON check", m.json_expected ? `${m.json_path} = ${m.json_expected}` : `${m.json_path} exists`]);
	}

	rows.push(
		["Goes down after", `${m.failure_threshold} failed check${m.failure_threshold === 1 ? "" : "s"}`],
		["Reminders", m.reminder_minutes > 0 ? `every ${formatSeconds(m.reminder_minutes * 60)}` : "off"],
		...(m.type === "heartbeat" ? [] : ([["Slowness alerts", m.alert_on_degraded ? "on" : "off"]] as [string, string][])),
		...(m.type === "http" && httpsTarget(m.url)
			? ([["Expiry warnings", m.expiry_warning_days > 0 ? `${m.expiry_warning_days} days ahead` : "off"]] as [string, string][])
			: []),
		["Alerts", channels === null ? "every channel" : `${channels.length} selected channel${channels.length === 1 ? "" : "s"}`],
		["Status page", m.is_public ? "shown" : "hidden"],
	);
	return rows;
}
