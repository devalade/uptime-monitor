/**
 * Modern Monitor Detail View for Uptime Monitor.
 * Displays real-time status, latency metrics, recent check history, and incidents log.
 */

import type { Handle } from "remix/component";
import { formatSeconds, parseRegionSnapshot, type MonitorDetailData } from "~/app/services/monitor-service";
import { daysLeft, httpsTarget } from "~/app/services/expiry";
import type { UptimePeriod } from "~/app/services/uptime-stats";
import { Layout } from "~/app/http/views/layout";
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

const statusBadgeClasses: Record<string, string> = { up: "badge-up", down: "badge-down", degraded: "badge-degraded" };

export function MonitorDetailPage(handle: Handle<MonitorDetailPageProps>) {
	return () => {
		const props = handle.props;
		const data = props.data;
		const m = data.monitor;
		const isPaused = !m.is_enabled;
		const status = isPaused ? "paused" : m.last_status ?? "pending";

		return (
			<Layout title={m.name} channels={props.channels}>
				<div style="margin-bottom: 1.5rem;">
					<a
						href={routes.home.href()}
						style="font-size: 0.8125rem; font-weight: 500; color: var(--text-muted); display: inline-flex; align-items: center; gap: 0.5rem; transition: color 150ms ease;"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="19" y1="12" x2="5" y2="12"></line>
							<polyline points="12 19 5 12 12 5"></polyline>
						</svg>
						Back to All Monitors
					</a>
				</div>

				<div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 1rem; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);">
					<div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1.5rem;">
						<div>
							<div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
								<span class={`badge ${statusBadgeClasses[status] ?? "badge-pending"}`}>
									{status !== "pending" && !isPaused ? <span class="dot-pulse"></span> : null}
									{isPaused ? "PAUSED" : status.toUpperCase()}
								</span>
								<TypeChip monitor={m} />
								{data.inMaintenance ? <span class="badge badge-maintenance">Maintenance</span> : null}
							</div>
							<h1 style="font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; color: #fff; margin-bottom: 0.375rem;">{m.name}</h1>
							<p style="font-family: var(--font-mono); font-size: 0.875rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem;">
								<MonitorTarget monitor={m} />
							</p>
						</div>

						<div style="display: flex; gap: 0.625rem; flex-wrap: wrap;">
							<button type="button" class="btn btn-secondary btn-sm" data-dialog-open={EDIT_DIALOG_ID}>
								Edit
							</button>
							<form method="POST" action={routes.checkMonitor.href({ id: m.id })}>
								<button type="submit" class="btn btn-primary btn-sm" data-busy="Checking…">
									<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="23 4 23 10 17 10"></polyline>
										<polyline points="1 20 1 14 7 14"></polyline>
										<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
									</svg>
									Check Now
								</button>
							</form>
							<form method="POST" action={routes.toggleMonitor.href({ id: m.id })}>
								<button type="submit" class="btn btn-secondary btn-sm">
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
									class="btn btn-secondary btn-sm"
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
								<button type="submit" class="btn btn-danger btn-sm">
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
					<div class="alert" style="border-color: rgba(56, 139, 253, 0.35); background: var(--brand-bg); color: var(--brand);">
						This monitor is in a maintenance window. Checks still run, but no incident is opened and nobody is alerted.
					</div>
				) : null}

				{m.type === "heartbeat" && props.pingUrl ? <HeartbeatSetup monitor={m} pingUrl={props.pingUrl} /> : null}

				<section class="stats-grid">
					<div class="stat-card">
						<div class="stat-label">24h Uptime</div>
						<div class="stat-value" style={`color: ${uptimeColor(data.uptimePercentage24h)};`}>
							{formatPercentage(data.uptimePercentage24h)}
						</div>
						<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
							{data.uptimePercentage24h === null ? "No checks in the last 24 hours" : "Successful checks, last 24 hours"}
						</div>
					</div>

					<div class="stat-card">
						<div class="stat-label">Uptime 7 / 30 / 90 days</div>
						<div style="display: flex; gap: 1rem; margin-top: 0.625rem; font-family: var(--font-mono); font-size: 1.0625rem; font-weight: 700;">
							{([7, 30, 90] as const).map((days) => (
								<span style={`color: ${uptimeColor(props.uptime[days])};`} title={`Last ${days} days`}>
									{formatPercentage(props.uptime[days])}
								</span>
							))}
						</div>
						<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">From daily totals, updated hourly</div>
					</div>

					{m.type === "heartbeat" ? (
						<div class="stat-card">
							<div class="stat-label">Last ping</div>
							<div class="stat-value" style="font-size: 1.125rem; margin-top: 0.75rem; font-family: var(--font-mono); color: var(--text-secondary);">
								{m.last_ping_at ? <LocalTime at={m.last_ping_at} /> : "Never"}
							</div>
							<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
								Expected every {formatSeconds(m.interval_seconds)}, {formatSeconds(m.grace_seconds)} grace
							</div>
						</div>
					) : (
						<div class="stat-card">
							<div class="stat-label">Average response</div>
							<div class="stat-value">
								{data.averageLatencyMs}
								<span style="font-size: 1rem; color: var(--text-muted); margin-left: 4px; font-weight: 500;">ms</span>
							</div>
							<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">Over the last {data.results.length} checks</div>
						</div>
					)}

					<div class="stat-card">
						<div class="stat-label">Last Checked</div>
						<div class="stat-value" style="font-size: 1.125rem; margin-top: 0.75rem; font-family: var(--font-mono); color: var(--text-secondary);">
							{m.last_checked_at ? <LocalTime at={m.last_checked_at} /> : "Never"}
						</div>
						<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
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

				<section class="card" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.5rem;">
					<div>
						<h2>Settings</h2>
						<dl class="settings-list">
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
							<h2>Response time</h2>
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

				<section style="margin-bottom: 3rem;">
					<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
						<h2 style="font-size: 1.125rem; font-weight: 700; letter-spacing: -0.01em;">Incident History ({data.incidents.length})</h2>
					</div>

					{data.incidents.length === 0 ? (
						<div class="stat-card" style="padding: 2.5rem; text-align: center;">
							<div style="width: 42px; height: 42px; border-radius: 50%; background: var(--up-bg); display: flex; align-items: center; justify-content: center; margin: 0 auto 0.75rem;">
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--up)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
									<polyline points="20 6 9 17 4 12"></polyline>
								</svg>
							</div>
							<h3 style="font-size: 1rem; font-weight: 600; color: #fff; margin-bottom: 0.25rem;">No incidents</h3>
							<p style="color: var(--text-muted); font-size: 0.8125rem;">This monitor has not had an outage yet.</p>
						</div>
					) : (
						<div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 0.75rem; overflow: hidden;">
							<table class="data-table">
								<thead>
									<tr>
										<th>Started At</th>
										<th>Resolved At</th>
										<th>Duration</th>
										<th>Failure Cause</th>
									</tr>
								</thead>
								<tbody>
									{data.incidents.map((inc) => (
										<tr key={inc.id}>
											<td style="font-family: var(--font-mono); font-size: 0.8125rem;">
												<LocalTime at={inc.started_at} />
											</td>
											<td style="font-family: var(--font-mono); font-size: 0.8125rem;">
												{inc.resolved_at ? <LocalTime at={inc.resolved_at} /> : "Ongoing"}
											</td>
											<td>
												{inc.resolved_at ? formatDuration(inc.resolved_at - inc.started_at) : <span class="badge badge-down">Active</span>}
											</td>
											<td style="color: var(--text-secondary);">{inc.cause}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>

				<section>
					<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
						<h2 style="font-size: 1.125rem; font-weight: 700; letter-spacing: -0.01em;">Recent Probe Telemetry ({data.results.length})</h2>
					</div>

					<div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 0.75rem; overflow: hidden; box-shadow: 0 4px 16px -2px rgba(0,0,0,0.3);">
						<table class="data-table">
							<thead>
								<tr>
									<th>Timestamp</th>
									<th>Status</th>
									<th>HTTP Code</th>
									<th>Latency</th>
									<th>Details</th>
								</tr>
							</thead>
							<tbody>
								{data.results.length === 0 ? (
									<tr>
										<td colSpan={5} style="text-align: center; color: var(--text-muted); padding: 3rem;">
											{m.type === "heartbeat" ? "No pings recorded yet." : 'No probes recorded yet. Click "Check Now" above to run an instant health check.'}
										</td>
									</tr>
								) : (
									data.results.map((r) => {
										const latencyColor =
											r.response_time_ms && r.response_time_ms < 500
												? "color: var(--up);"
												: r.response_time_ms && r.response_time_ms < 1500
													? "color: var(--degraded);"
													: "color: var(--down);";
										return (
											<tr key={r.id}>
												<td style="font-family: var(--font-mono); font-size: 0.8125rem; color: var(--text-secondary);">
													<LocalTime at={r.created_at} />
												</td>
												<td>
													{!r.is_up ? (
														<span class="badge badge-down">DOWN</span>
													) : r.error_message ? (
														<span class="badge badge-degraded">SLOW</span>
													) : (
														<span class="badge badge-up">UP</span>
													)}
													{r.is_maintenance ? (
														<>
															{" "}
															<span class="badge badge-maintenance" title="During maintenance: not counted in uptime">
																MAINT
															</span>
														</>
													) : null}
												</td>
												<td style="font-family: var(--font-mono); font-weight: 600;">{r.response_status ?? "-"}</td>
												<td style={`font-family: var(--font-mono); font-weight: 600; ${latencyColor}`}>
													{r.response_time_ms !== null ? `${r.response_time_ms}ms` : "-"}
												</td>
												<td style={`color: ${r.is_up ? "var(--text-muted)" : "var(--down)"}; font-size: 0.8125rem;`}>{r.error_message ?? "OK"}</td>
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
					<a
						href={/^https?:\/\//i.test(m.url) ? m.url : "#"}
						target="_blank"
						rel="noopener"
						style="color: var(--text-secondary); text-decoration: underline; text-underline-offset: 3px;"
					>
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
						style="color: var(--text-dim);"
					>
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
						<polyline points="15 3 21 3 21 9"></polyline>
						<line x1="10" y1="14" x2="21" y2="3"></line>
					</svg>
				</>
			);
		}
		if (m.type === "tcp") return <span style="color: var(--text-secondary);">tcp://{m.url}</span>;
		if (m.type === "dns") return <span style="color: var(--text-secondary);">{`${m.dns_record_type} ${m.url}`}</span>;
		return <span>Heartbeat monitor</span>;
	};
}

function ExpiryCard(handle: Handle<{ monitor: SelectMonitor }>) {
	return () => {
		const m = handle.props.monitor;
		const now = Date.now();
		const describe = (expiresAt: number | null) => {
			if (expiresAt === null) return { text: "Unknown", color: "var(--text-muted)" };
			const days = daysLeft(expiresAt, now);
			const color = days < 0 ? "var(--down)" : m.expiry_warning_days > 0 && days <= m.expiry_warning_days ? "var(--degraded)" : "var(--up)";
			return { text: days < 0 ? `Expired ${-days} day${days === -1 ? "" : "s"} ago` : `${days} day${days === 1 ? "" : "s"} left`, color };
		};
		const cert = describe(m.cert_expires_at);
		const domain = describe(m.domain_expires_at);

		return (
			<section class="card">
				<div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.875rem;">
					<h2 style="margin: 0;">Certificate and domain</h2>
					<form method="POST" action={routes.checkExpiry.href({ id: m.id })}>
						<button type="submit" class="btn btn-secondary btn-sm" data-busy="Checking…">
							Check now
						</button>
					</form>
				</div>
				<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; font-size: 0.8125rem;">
					<div>
						<div class="stat-label">TLS certificate</div>
						<div style={`font-size: 1.125rem; font-weight: 700; color: ${cert.color}; margin-top: 0.375rem;`}>{cert.text}</div>
						<div class="dim" style="margin-top: 0.25rem;">
							{m.cert_expires_at ? (
								<>
									Expires <LocalTime at={m.cert_expires_at} format="date" />
									{m.cert_issuer ? ` · issued by ${m.cert_issuer}` : null}
								</>
							) : null}
							{m.cert_error ? <div style="color: var(--degraded); margin-top: 0.25rem;">{m.cert_error}</div> : null}
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
						<div class="stat-label">Domain registration</div>
						<div style={`font-size: 1.125rem; font-weight: 700; color: ${domain.color}; margin-top: 0.375rem;`}>{domain.text}</div>
						<div class="dim" style="margin-top: 0.25rem;">
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

const regionBadges: Record<string, { css: string; label: string }> = {
	up: { css: "badge-up", label: "UP" },
	degraded: { css: "badge-degraded", label: "SLOW" },
	down: { css: "badge-down", label: "DOWN" },
};

function RegionsCard(handle: Handle<{ monitor: SelectMonitor }>) {
	return () => {
		const m = handle.props.monitor;
		const snapshot = parseRegionSnapshot(m.region_results);

		return (
			<section class="card">
				<div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.875rem;">
					<div>
						<h2 style="margin: 0;">From every region</h2>
						<p class="dim" style="margin-top: 0.25rem;">
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
						<button type="submit" class="btn btn-secondary btn-sm" data-busy="Checking…">
							Check from every region
						</button>
					</form>
				</div>
				{snapshot ? (
					<table class="data-table">
						<thead>
							<tr>
								<th>Location</th>
								<th>Status</th>
								<th>Time</th>
								<th>Details</th>
							</tr>
						</thead>
						<tbody>
							{snapshot.results.map((r) => {
								const badge = regionBadges[r.status] ?? { css: "badge-pending", label: "ERROR" };
								return (
									<tr>
										<td>{r.label}</td>
										<td>
											<span class={`badge ${badge.css}`}>{badge.label}</span>
										</td>
										<td class="mono">{r.responseTimeMs !== null ? `${r.responseTimeMs}ms` : "-"}</td>
										<td class="muted">{r.errorMessage ?? "OK"}</td>
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
			<section class="card">
				<h2>Ping this URL from your job</h2>
				<p class="muted" style="font-size: 0.8125rem; margin-bottom: 0.75rem;">
					Call it each time the job succeeds.{" "}
					{m.last_ping_at ? null : "The monitor stays pending until the first ping, so nobody is paged before you set it up. "}
					Keep it secret: anyone with the URL can report in.
				</p>
				<div class="copy-field" style="margin-bottom: 0.5rem;">
					<code>{pingUrl}</code>
					<button type="button" class="btn btn-secondary btn-sm" data-copy={pingUrl}>
						Copy
					</button>
				</div>
				<div class="copy-field" style="margin-bottom: 0.5rem;">
					<code>{curl}</code>
					<button type="button" class="btn btn-secondary btn-sm" data-copy={curl}>
						Copy
					</button>
				</div>
				<p class="dim">
					Report a failure straight away with <code class="mono">{`${pingUrl}/fail`}</code>. GET, POST and HEAD all work.
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
