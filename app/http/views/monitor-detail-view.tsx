/**
 * Modern Monitor Detail View for Uptime Monitor.
 * Displays real-time status, latency metrics, recent check history, and incidents log.
 */

import type { MonitorDetailData } from "~/app/services/monitor-service";
import { renderLayout } from "~/app/http/views/layout";
import { escapeHtml, formatPercentage, renderTime } from "~/app/http/views/html";
import routes from "~/routes/web";

export function renderMonitorDetailView(data: MonitorDetailData): string {
	const m = data.monitor;
	const isPaused = !m.is_enabled;
	const status = isPaused ? "paused" : m.last_status ?? "pending";
	const badgeClass =
		status === "up"
			? "badge-up"
			: status === "down"
				? "badge-down"
				: status === "degraded"
					? "badge-degraded"
					: "badge-pending";

	const lastChecked = m.last_checked_at ? renderTime(m.last_checked_at) : "Never";
	const nextCheck = isPaused
		? "Paused — resume to check again"
		: m.next_due_at
			? `Next check around ${renderTime(Math.max(m.next_due_at, Date.now()))}`
			: "Next check within a minute";
	const uptimeColor =
		data.uptimePercentage24h === null
			? "var(--text-muted)"
			: data.uptimePercentage24h >= 99
				? "var(--up)"
				: data.uptimePercentage24h >= 95
					? "var(--degraded)"
					: "var(--down)";

	const methodLower = (m.method || "get").toLowerCase();
	const methodClass = `method-${methodLower}`;

	const content = `
		<div style="margin-bottom: 1.5rem;">
			<a href="${routes.home.href()}" style="font-size: 0.8125rem; font-weight: 500; color: var(--text-muted); display: inline-flex; align-items: center; gap: 0.5rem; transition: color 150ms ease;">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
				Back to All Monitors
			</a>
		</div>

		<!-- Monitor Hero Header Card -->
		<div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 1rem; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);">
			<div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 1.5rem;">
				<div>
					<div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
						<span class="badge ${badgeClass}">
							${status !== "pending" && !isPaused ? '<span class="dot-pulse"></span>' : ""}
							${isPaused ? "PAUSED" : status.toUpperCase()}
						</span>
						<span class="method-chip ${methodClass}">${escapeHtml(m.method)}</span>
					</div>
					<h1 style="font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; color: #fff; margin-bottom: 0.375rem;">${escapeHtml(m.name)}</h1>
					<p style="font-family: var(--font-mono); font-size: 0.875rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem;">
						<a href="${/^https?:\/\//i.test(m.url) ? escapeHtml(m.url) : "#"}" target="_blank" rel="noopener" style="color: var(--text-secondary); text-decoration: underline; text-underline-offset: 3px;">
							${escapeHtml(m.url)}
						</a>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-dim);"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
					</p>
				</div>

				<div style="display: flex; gap: 0.625rem; flex-wrap: wrap;">
					<form method="POST" action="${routes.checkMonitor.href({ id: m.id })}">
						<button type="submit" class="btn btn-primary btn-sm" data-busy="Checking…">
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
							Check Now
						</button>
					</form>
					<form method="POST" action="${routes.toggleMonitor.href({ id: m.id })}">
						<button type="submit" class="btn btn-secondary btn-sm">
							${
								m.is_enabled
									? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Pause`
									: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Resume`
							}
						</button>
					</form>
					<form method="POST" action="${routes.toggleVisibility.href({ id: m.id })}">
						<button type="submit" class="btn btn-secondary btn-sm" title="${m.is_public ? "Currently shown on the public status page" : "Currently hidden from the public status page"}">
							${m.is_public ? "Hide from status page" : "Show on status page"}
						</button>
					</form>
					<form method="POST" action="${routes.deleteMonitor.href({ id: m.id })}" data-confirm="${escapeHtml(`Delete “${m.name}” and all of its history? This cannot be undone.`)}">
						<button type="submit" class="btn btn-danger btn-sm">
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
							Delete
						</button>
					</form>
				</div>
			</div>
		</div>

		<!-- Bento Stats -->
		<section class="stats-grid">
			<div class="stat-card">
				<div class="stat-label">24h Uptime</div>
				<div class="stat-value" style="color: ${uptimeColor};">
					${formatPercentage(data.uptimePercentage24h)}
				</div>
				<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
					${data.uptimePercentage24h === null ? "No checks in the last 24 hours" : "Successful checks, last 24 hours"}
				</div>
			</div>

			<div class="stat-card">
				<div class="stat-label">Average response</div>
				<div class="stat-value">${data.averageLatencyMs}<span style="font-size: 1rem; color: var(--text-muted); margin-left: 4px; font-weight: 500;">ms</span></div>
				<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
					Over the last ${data.results.length} checks
				</div>
			</div>

			<div class="stat-card">
				<div class="stat-label">Check Frequency</div>
				<div class="stat-value">${m.interval_seconds}<span style="font-size: 1rem; color: var(--text-muted); margin-left: 4px; font-weight: 500;">sec</span></div>
				<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
					Timeout ${m.timeout_seconds}s · expects HTTP ${m.expected_status} · slow after ${m.degraded_after_ms}ms
				</div>
			</div>

			<div class="stat-card">
				<div class="stat-label">Last Checked</div>
				<div class="stat-value" style="font-size: 1.125rem; margin-top: 0.75rem; font-family: var(--font-mono); color: var(--text-secondary);">
					${lastChecked}
				</div>
				<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
					${nextCheck}
				</div>
			</div>
		</section>

		<!-- Incidents Section -->
		<section style="margin-bottom: 3rem;">
			<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
				<h2 style="font-size: 1.125rem; font-weight: 700; letter-spacing: -0.01em;">Incident History (${data.incidents.length})</h2>
			</div>

			${
				data.incidents.length === 0
					? `
				<div class="stat-card" style="padding: 2.5rem; text-align: center;">
					<div style="width: 42px; height: 42px; border-radius: 50%; background: var(--up-bg); display: flex; align-items: center; justify-content: center; margin: 0 auto 0.75rem;">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--up)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
					</div>
					<h3 style="font-size: 1rem; font-weight: 600; color: #fff; margin-bottom: 0.25rem;">No incidents</h3>
					<p style="color: var(--text-muted); font-size: 0.8125rem;">This monitor has not had an outage yet.</p>
				</div>
			`
					: `
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
							${data.incidents
								.map((inc) => {
									const started = renderTime(inc.started_at);
									const resolved = inc.resolved_at ? renderTime(inc.resolved_at) : "Ongoing";
									const duration = inc.resolved_at
										? formatDuration(inc.resolved_at - inc.started_at)
										: '<span class="badge badge-down">Active</span>';

									return `
									<tr>
										<td style="font-family: var(--font-mono); font-size: 0.8125rem;">${started}</td>
										<td style="font-family: var(--font-mono); font-size: 0.8125rem;">${resolved}</td>
										<td>${duration}</td>
										<td style="color: var(--text-secondary);">${escapeHtml(inc.cause)}</td>
									</tr>
								`;
								})
								.join("")}
						</tbody>
					</table>
				</div>
			`
			}
		</section>

		<!-- Recent Checks Section -->
		<section>
			<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
				<h2 style="font-size: 1.125rem; font-weight: 700; letter-spacing: -0.01em;">Recent Probe Telemetry (${data.results.length})</h2>
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
						${
							data.results.length === 0
								? `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 3rem;">No probes recorded yet. Click "Check Now" above to run an instant health check.</td></tr>`
								: data.results
										.map((r) => {
											const badge = !r.is_up
												? '<span class="badge badge-down">DOWN</span>'
												: r.error_message
													? '<span class="badge badge-degraded">SLOW</span>'
													: '<span class="badge badge-up">UP</span>';
											const latencyClass =
												r.response_time_ms && r.response_time_ms < 500
													? "color: var(--up);"
													: r.response_time_ms && r.response_time_ms < 1500
														? "color: var(--degraded);"
														: "color: var(--down);";

											return `
								<tr>
									<td style="font-family: var(--font-mono); font-size: 0.8125rem; color: var(--text-secondary);">${renderTime(r.created_at)}</td>
									<td>${badge}</td>
									<td style="font-family: var(--font-mono); font-weight: 600;">${r.response_status ?? "-"}</td>
									<td style="font-family: var(--font-mono); font-weight: 600; ${latencyClass}">
										${r.response_time_ms !== null ? `${r.response_time_ms}ms` : "-"}
									</td>
									<td style="color: ${r.is_up ? "var(--text-muted)" : "var(--down)"}; font-size: 0.8125rem;">
										${escapeHtml(r.error_message ?? "OK")}
									</td>
								</tr>
							`;
										})
										.join("")
						}
					</tbody>
				</table>
			</div>
		</section>
	`;

	return renderLayout({
		title: m.name,
		children: content,
	});
}

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

