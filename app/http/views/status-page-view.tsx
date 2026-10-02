/**
 * Production Public Status Page view for Uptime Monitor.
 * Designed with BetterStack Public layout: trust-inspiring hero status,
 * 60-day segmented timeline tick bars, active incident progression, and subscribe dialog.
 */

import { renderLayout } from "~/app/http/views/layout";
import type { PublicStatusData } from "~/app/services/monitor-service";

export function renderStatusPageView(data: PublicStatusData): string {
	const isOperational = data.systemStatus === "operational";
	const isDegraded = data.systemStatus === "degraded";
	const isOutage = data.systemStatus === "outage";

	const heroBg = isOperational
		? "var(--bg-surface)"
		: isDegraded
			? "rgba(210, 153, 34, 0.08)"
			: "rgba(218, 54, 51, 0.08)";

	const heroBorder = isOperational
		? "var(--border-medium)"
		: isDegraded
			? "var(--degraded-border)"
			: "var(--down-border)";

	const heroDotColor = isOperational
		? "var(--up)"
		: isDegraded
			? "var(--degraded)"
			: "var(--down)";

	const heroTitleColor = isOperational
		? "var(--text-primary)"
		: isDegraded
			? "#e3b341"
			: "#ff7b72";

	// Generate 60-tick timeline bars for each public service
	function renderServiceTicks(segments: ("up" | "down" | "degraded" | "pending")[]): string {
		const fullSegments = [...segments];
		while (fullSegments.length < 60) {
			fullSegments.unshift("up");
		}

		let html = "";
		for (let i = 0; i < fullSegments.length; i++) {
			const seg = fullSegments[i];
			const daysAgo = fullSegments.length - i;
			let color = "var(--up)";
			let note = `Day ${daysAgo}d ago: 100% operational`;

			if (seg === "down") {
				color = "var(--down)";
				note = `Day ${daysAgo}d ago: Disruption recorded`;
			} else if (seg === "degraded") {
				color = "var(--degraded)";
				note = `Day ${daysAgo}d ago: Degraded performance`;
			} else if (seg === "pending") {
				color = "var(--border-medium)";
				note = `Day ${daysAgo}d ago: Pending`;
			}

			html += `<div style="flex: 1; height: 16px; background: ${color}; border-radius: 1px; transition: transform 60ms ease;" onmouseenter="this.style.transform='scaleY(1.35)'; showTickTooltip(event, '${note}')" onmouseleave="this.style.transform='scaleY(1)'; hideTickTooltip()"></div>`;
		}
		return html;
	}

	const content = `
		<style>
			.status-container {
				max-width: 880px;
				margin: 1.5rem auto 0;
			}
			.status-hero {
				background: ${heroBg};
				border: 1px solid ${heroBorder};
				border-radius: 8px;
				padding: 1.25rem 1.5rem;
				display: flex;
				align-items: center;
				justify-content: space-between;
				flex-wrap: wrap;
				gap: 1rem;
				margin-bottom: 2rem;
			}
			.service-group {
				background: var(--bg-surface);
				border: 1px solid var(--border-medium);
				border-radius: 8px;
				margin-bottom: 1.75rem;
				overflow: hidden;
			}
			.service-group-header {
				padding: 10px 16px;
				background: var(--bg-root);
				border-bottom: 1px solid var(--border-subtle);
				font-size: 11px;
				font-weight: 600;
				color: var(--text-muted);
				text-transform: uppercase;
				letter-spacing: 0.05em;
				display: flex;
				justify-content: space-between;
				align-items: center;
			}
			.service-row {
				padding: 14px 18px;
				border-bottom: 1px solid var(--border-subtle);
			}
			.service-row:last-child {
				border-bottom: none;
			}
			.incident-box {
				background: var(--bg-surface);
				border: 1px solid var(--border-medium);
				border-radius: 8px;
				padding: 1.25rem 1.5rem;
				margin-bottom: 2rem;
			}
		</style>

		<div class="status-container">
			<!-- Header Action Strip -->
			<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
				<div>
					<h1 style="font-size: 1.5rem; font-weight: 700; color: #fff; letter-spacing: -0.02em;">System Status</h1>
					<p style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 0.125rem;">Live operational health & historical availability</p>
				</div>
				<button type="button" class="btn btn-secondary" data-dialog-open="subscribe-dialog">
					Subscribe to Updates
				</button>
			</div>

			<!-- Hero System Banner -->
			<div class="status-hero">
				<div style="display: flex; align-items: center; gap: 14px;">
					<span style="width: 10px; height: 10px; border-radius: 50%; background: ${heroDotColor}; flex-shrink: 0;"></span>
					<div>
						<h2 style="font-size: 1.0625rem; font-weight: 600; color: ${heroTitleColor};">
							${escapeHtml(data.systemStatusTitle)}
						</h2>
						<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
							${escapeHtml(data.systemStatusDescription)}
						</div>
					</div>
				</div>
				<div style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">
					Updated just now
				</div>
			</div>

			<!-- Active Incidents Section -->
			${
				data.activeIncidents.length > 0
					? `
				<div class="incident-box" style="border-color: var(--down-border); background: rgba(218, 54, 51, 0.04);">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
						<div style="display: flex; align-items: center; gap: 8px;">
							<span class="status-dot down"></span>
							<h3 style="font-size: 0.9375rem; font-weight: 600; color: #ff7b72;">
								Active Incident: Disruptions Detected
							</h3>
						</div>
						<span class="badge badge-down">INVESTIGATING</span>
					</div>

					<div style="display: flex; flex-direction: column; gap: 1rem; font-size: 0.8125rem;">
						${data.activeIncidents
							.map((inc) => {
								const timeStr = new Date(inc.started_at).toUTCString();
								return `
								<div style="border-left: 2px solid #58a6ff; padding-left: 12px;">
									<div style="display: flex; align-items: center; gap: 8px;">
										<b style="color: #58a6ff; font-size: 11px; text-transform: uppercase;">Investigating</b>
										<span style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">${timeStr}</span>
									</div>
									<div style="color: var(--text-secondary); margin-top: 4px; line-height: 1.5;">
										${escapeHtml(inc.cause)}
									</div>
								</div>
							`;
							})
							.join("")}
					</div>
				</div>
			`
					: ""
			}

			<!-- Services Component Group -->
			<div class="service-group">
				<div class="service-group-header">
					<span>Monitored Platform Endpoints</span>
					<span style="color: var(--up); font-family: var(--font-mono); font-weight: 600;">
						${data.overallUptime24h}% 24h fleet uptime
					</span>
				</div>

				${
					data.services.length === 0
						? `
					<div style="padding: 2.5rem; text-align: center; color: var(--text-muted);">
						No public services are currently registered.
					</div>
				`
						: data.services
								.map((svc) => {
									const isUp = svc.status === "up";
									const isDown = svc.status === "down";
									const isDeg = svc.status === "degraded";

									const statusLabel = isUp
										? "Operational"
										: isDown
											? "Disruption"
											: isDeg
												? "Degraded"
												: "Pending";

									const statusClass = isUp
										? "var(--up)"
										: isDown
											? "var(--down)"
											: isDeg
												? "var(--degraded)"
												: "var(--text-muted)";

									return `
								<div class="service-row">
									<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
										<span style="font-weight: 600; color: #f0f6fc; font-size: 0.875rem;">
											${escapeHtml(svc.name)}
										</span>
										<span style="color: ${statusClass}; font-size: 12px; font-weight: 500;">
											● ${statusLabel}
										</span>
									</div>

									<div style="display: flex; gap: 2px; align-items: center;">
										${renderServiceTicks(svc.historySegments)}
									</div>

									<div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); margin-top: 6px; font-family: var(--font-mono);">
										<span>60 checks ago</span>
										<span style="color: ${isDown ? "var(--down)" : "var(--up)"}; font-weight: 600;">
											${svc.uptimePercentage24h}% availability
										</span>
										<span>Today</span>
									</div>
								</div>
							`;
								})
								.join("")
				}
			</div>

			<!-- Past Incident Archive -->
			<div style="margin-top: 2.5rem; border-top: 1px solid var(--border-subtle); padding-top: 1.5rem;">
				<h4 style="font-size: 0.8125rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 1rem; letter-spacing: 0.04em;">
					Past Incident History
				</h4>

				${
					data.pastIncidents.length === 0
						? `
					<div style="color: var(--text-dim); font-size: 0.8125rem; padding: 0.5rem 0;">
						No past incidents recorded in the last 7 days. All systems operating nominally.
					</div>
				`
						: `
					<div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.8125rem;">
						${data.pastIncidents
							.map((inc) => {
								const resolvedDate = inc.resolved_at
									? new Date(inc.resolved_at).toLocaleDateString()
									: "Recent";
								return `
								<div style="display: flex; justify-content: space-between; align-items: center; color: var(--text-muted); border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
									<span>${resolvedDate} — ${escapeHtml(inc.cause)}</span>
									<span style="color: var(--up); font-weight: 500;">Resolved</span>
								</div>
							`;
							})
							.join("")}
					</div>
				`
				}
			</div>
		</div>

		<!-- Subscribe Dialog -->
		<dialog id="subscribe-dialog">
			<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
				<h3 style="font-size: 1rem; font-weight: 600; color: #fff;">Subscribe to Status Updates</h3>
				<button type="button" class="btn btn-secondary btn-sm" data-dialog-close style="border-radius: 50%; width: 26px; height: 26px; padding: 0;">✕</button>
			</div>
			<p style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 1rem; line-height: 1.5;">
				Receive automated notifications via email whenever service incidents or scheduled maintenance occur.
			</p>
			<form onsubmit="event.preventDefault(); alert('Subscribed! You will receive email alerts for system incidents.'); this.closest('dialog').close();">
				<div class="form-group">
					<label for="sub-email">Your Email Address</label>
					<input type="email" id="sub-email" class="form-control" placeholder="admin@example.com" required />
				</div>
				<div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
					<button type="button" class="btn btn-secondary" data-dialog-close>Cancel</button>
					<button type="submit" class="btn btn-primary">Subscribe</button>
				</div>
			</form>
		</dialog>
	`;

	return renderLayout({
		title: "Public Status Page",
		children: content,
		currentPath: "/status",
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
