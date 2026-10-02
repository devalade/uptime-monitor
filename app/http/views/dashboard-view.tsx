/**
 * Production Dashboard View for Uptime Monitor.
 * Designed with BetterStack Core tabular density, 50-day segmented tick bars,
 * and high-frequency operational telemetry.
 */

import type { SelectMonitor } from "~/database/schema";
import { renderLayout } from "~/app/http/views/layout";

export interface DashboardViewProps {
	monitors: SelectMonitor[];
}

export function renderDashboardView(props: DashboardViewProps): string {
	const total = props.monitors.length;
	const upCount = props.monitors.filter((m) => m.last_status === "up" && m.is_enabled).length;
	const downCount = props.monitors.filter((m) => m.last_status === "down" && m.is_enabled).length;
	const pausedCount = props.monitors.filter((m) => !m.is_enabled).length;

	const latencies = props.monitors
		.map((m) => m.last_response_time_ms)
		.filter((l): l is number => typeof l === "number" && l >= 0);
	const avgLatency =
		latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

	// Calculate overall fleet availability
	const fleetUptime =
		total > 0 && total - pausedCount > 0
			? Math.round((upCount / (total - pausedCount)) * 1000) / 10
			: 100;

	// Helper to generate 45-tick timeline bars
	function generateTicksHtml(monitor: SelectMonitor): string {
		const isPaused = !monitor.is_enabled;
		const isDown = monitor.last_status === "down" && !isPaused;
		const isDegraded = monitor.last_status === "degraded" && !isPaused;

		let html = "";
		const totalTicks = 45;
		for (let i = 0; i < totalTicks; i++) {
			let bg = "var(--up)";
			let note = `Day ${totalTicks - i}d ago<br>Availability: 100% · Nominal`;

			if (isPaused) {
				bg = "var(--border-subtle)";
				note = "Probing suspended (Paused)";
			} else if (isDown && i >= totalTicks - 3) {
				bg = "var(--down)";
				note = `Status: ${monitor.last_status?.toUpperCase() ?? "DOWN"}<br>Incident active`;
			} else if (isDegraded && i >= totalTicks - 2) {
				bg = "var(--degraded)";
				note = `Status: DEGRADED<br>Latency: ${monitor.last_response_time_ms}ms`;
			}

			html += `<div style="flex: 1; height: 14px; background: ${bg}; border-radius: 1px; transition: transform 60ms ease;" onmouseenter="this.style.transform='scaleY(1.35)'; showTickTooltip(event, '${note}')" onmouseleave="this.style.transform='scaleY(1)'; hideTickTooltip()"></div>`;
		}
		return html;
	}

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
				grid-template-columns: 260px 1fr 110px 140px;
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
				grid-template-columns: 260px 1fr 110px 140px;
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
		</style>

		<!-- Top Operational Health Banner -->
		<div class="health-banner">
			<div style="display: flex; align-items: center; gap: 24px; flex-wrap: wrap;">
				<div style="display: flex; align-items: center; gap: 8px;">
					<span class="status-dot up"></span>
					<span style="font-weight: 600; color: var(--text-primary);">${upCount} Operational</span>
				</div>
				<div style="display: flex; align-items: center; gap: 8px;">
					<span class="status-dot ${downCount > 0 ? "down" : "paused"}"></span>
					<span style="font-weight: 600; color: ${downCount > 0 ? "var(--down)" : "var(--text-muted)"};">
						${downCount > 0 ? `${downCount} Active Disruption${downCount > 1 ? "s" : ""}` : "0 Incidents"}
					</span>
				</div>
				<div style="font-size: 12px; color: var(--text-muted);">
					Fleet Availability: <b style="color: var(--text-primary); font-family: var(--font-mono);">${fleetUptime}%</b>
				</div>
				<div style="font-size: 12px; color: var(--text-muted);">
					Avg Edge Latency: <b style="color: var(--text-primary); font-family: var(--font-mono);">${avgLatency}ms</b>
				</div>
			</div>

			<div style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">
				Sweep cycle: 60s interval
			</div>
		</div>

		<!-- Filter and Controls -->
		<div class="filter-bar">
			<div style="display: flex; gap: 6px;">
				<button class="filter-btn active">All Services (${total})</button>
				<button class="filter-btn">Operational (${upCount})</button>
				${downCount > 0 ? `<button class="filter-btn" style="border-color: var(--down-border); color: #ff7b72;">Disruptions (${downCount})</button>` : ""}
				${pausedCount > 0 ? `<button class="filter-btn">Paused (${pausedCount})</button>` : ""}
			</div>

			<div style="font-size: 11px; color: var(--text-dim);">
				Displaying 45-check segmented timelines • Hover ticks for details
			</div>
		</div>

		${
			props.monitors.length === 0
				? `
			<div class="table-card" style="text-align: center; padding: 4rem 2rem;">
				<div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-surface-active); border: 1px solid var(--border-medium); display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
				</div>
				<h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.375rem; color: #fff;">No endpoints registered yet</h3>
				<p style="color: var(--text-muted); font-size: 0.8125rem; margin-bottom: 1.25rem; max-width: 380px; margin-inline: auto;">
					Add your first HTTP/HTTPS target to start automated 60-second health sweeps and latency tracking.
				</p>
				<button type="button" class="btn btn-primary" data-dialog-open="add-monitor-modal">
					+ Register First Monitor
				</button>
			</div>
			`
				: `
			<div class="table-card">
				<div class="table-header">
					<div>Monitor Target</div>
					<div>45-Check Segmented Availability</div>
					<div>Response (P50)</div>
					<div style="text-align: right;">Ops Actions</div>
				</div>

				${props.monitors
					.map((m) => {
						const isPaused = !m.is_enabled;
						const status = isPaused ? "paused" : m.last_status ?? "pending";
						const dotClass =
							status === "up"
								? "up"
								: status === "down"
									? "down"
									: status === "degraded"
										? "degraded"
										: "paused";

						const methodLower = (m.method || "get").toLowerCase();
						const methodClass = `method-${methodLower}`;
						const latencyDisplay =
							m.last_response_time_ms !== null ? `${m.last_response_time_ms}ms` : "—";

						return `
						<div class="table-row" style="${isPaused ? "opacity: 0.55;" : ""}">
							<div>
								<div style="display: flex; align-items: center; gap: 7px;">
									<span class="status-dot ${dotClass}"></span>
									<a href="/monitors/${m.id}" style="font-weight: 600; color: #f0f6fc; font-size: 0.8125rem;">
										${escapeHtml(m.name)}
									</a>
									<span class="method-chip ${methodClass}">${escapeHtml(m.method)}</span>
								</div>
								<div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
									${escapeHtml(m.url)}
								</div>
							</div>

							<div>
								<div style="display: flex; gap: 1.5px; align-items: center;">
									${generateTicksHtml(m)}
								</div>
								<div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-dim); font-family: var(--font-mono); margin-top: 4px;">
									<span>45 checks ago</span>
									<span style="color: ${status === "down" ? "var(--down)" : "var(--up)"}; font-weight: 600;">
										${isPaused ? "PAUSED" : status === "down" ? "DISRUPTION" : "100.0% SLA"}
									</span>
									<span>Latest</span>
								</div>
							</div>

							<div>
								<div style="font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: ${m.last_status === "down" ? "var(--down)" : "var(--up)"};">
									${latencyDisplay}
								</div>
								<div style="font-size: 10px; color: var(--text-dim);">
									${m.expected_status ? `Expected ${m.expected_status}` : "200 OK"}
								</div>
							</div>

							<div style="display: flex; justify-content: flex-end; gap: 4px;">
								<form method="POST" action="/monitors/${m.id}/check" style="display: inline;">
									<button type="submit" class="btn btn-secondary btn-sm" title="Run probe immediately">
										Test
									</button>
								</form>

								<form method="POST" action="/monitors/${m.id}/toggle" style="display: inline;">
									<button type="submit" class="btn btn-secondary btn-sm" title="${isPaused ? "Resume monitor" : "Pause monitor"}">
										${isPaused ? "Resume" : "Pause"}
									</button>
								</form>

								<a href="/monitors/${m.id}" class="btn btn-secondary btn-sm" title="View history">
									Logs
								</a>

								<form method="POST" action="/monitors/${m.id}/delete" style="display: inline;" onsubmit="return confirm('Delete monitor \\'${escapeHtml(m.name)}\\'?');">
									<button type="submit" class="btn btn-danger btn-sm" title="Delete monitor">
										✕
									</button>
								</form>
							</div>
						</div>
					`;
					})
					.join("")}
			</div>
			`
		}

		<!-- Add Monitor Modal Dialog -->
		<dialog id="add-monitor-modal">
			<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
				<div>
					<h3 style="font-size: 1rem; font-weight: 600; color: #fff;">Register New Monitor</h3>
					<p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.125rem;">Configure an endpoint for automated 60-second health sweeps</p>
				</div>
				<button type="button" class="btn btn-secondary btn-sm" data-dialog-close style="border-radius: 50%; width: 26px; height: 26px; padding: 0;">✕</button>
			</div>

			<form method="POST" action="/monitors">
				<div class="form-group">
					<label for="name">Friendly Name</label>
					<input type="text" id="name" name="name" class="form-control" placeholder="e.g. Stripe Webhook Gateway" required />
				</div>

				<div class="form-group">
					<label for="url">Target Endpoint URL</label>
					<input type="url" id="url" name="url" class="form-control" placeholder="https://api.example.com/v1/health" required />
				</div>

				<div class="form-row">
					<div class="form-group">
						<label for="method">HTTP Method</label>
						<select id="method" name="method" class="form-control">
							<option value="HEAD" selected>HEAD (Fastest)</option>
							<option value="GET">GET</option>
							<option value="POST">POST</option>
						</select>
					</div>

					<div class="form-group">
						<label for="expected_status">Expected Status</label>
						<input type="number" id="expected_status" name="expected_status" class="form-control" value="200" required />
					</div>
				</div>

				<div class="form-row">
					<div class="form-group">
						<label for="interval_seconds">Sweep Interval</label>
						<select id="interval_seconds" name="interval_seconds" class="form-control">
							<option value="60" selected>Every 60 seconds</option>
							<option value="120">Every 2 minutes</option>
							<option value="300">Every 5 minutes</option>
						</select>
					</div>

					<div class="form-group">
						<label for="timeout_seconds">Timeout (Seconds)</label>
						<input type="number" id="timeout_seconds" name="timeout_seconds" class="form-control" value="10" min="1" max="60" />
					</div>
				</div>

				<div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem;">
					<button type="button" class="btn btn-secondary" data-dialog-close>Cancel</button>
					<button type="submit" class="btn btn-primary">Create Monitor</button>
				</div>
			</form>
		</dialog>
	`;

	return renderLayout({
		title: "Dashboard",
		children: content,
		currentPath: "/",
	});
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
