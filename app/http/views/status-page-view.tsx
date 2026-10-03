/**
 * Production Public Status Page view for Uptime Monitor.
 * Overall system status, each service's latest checks and 24h uptime, and incident history.
 */

import { renderLayout } from "~/app/http/views/layout";
import { escapeHtml, formatPercentage, renderTime, renderTimeline } from "~/app/http/views/html";
import type { PublicStatusData } from "~/app/services/monitor-service";

export const TIMELINE_LENGTH = 60;

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
					Updated ${renderTime(data.generatedAt)}
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
								Ongoing incident${data.activeIncidents.length > 1 ? "s" : ""}
							</h3>
						</div>
						<span class="badge badge-down">ONGOING</span>
					</div>

					<div style="display: flex; flex-direction: column; gap: 1rem; font-size: 0.8125rem;">
						${data.activeIncidents
							.map((inc) => {
								return `
								<div style="border-left: 2px solid var(--down); padding-left: 12px;">
									<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
										<b style="color: var(--text-primary);">${escapeHtml(inc.monitorName)}</b>
										<span style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">since ${renderTime(inc.startedAt)}</span>
									</div>
									<div style="color: var(--text-secondary); margin-top: 4px; line-height: 1.5;">
										This service is not responding as expected. It will update here automatically when it recovers.
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
					<span>Services</span>
					<span style="color: var(--text-muted); font-family: var(--font-mono); font-weight: 600;">
						${formatPercentage(data.overallUptime24h)} uptime, last 24h
					</span>
				</div>

				${
					data.services.length === 0
						? `
					<div style="padding: 2.5rem; text-align: center; color: var(--text-muted);">
						No services are being monitored yet.
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
												: "Awaiting first check";

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

									${renderTimeline(svc.recentChecks, TIMELINE_LENGTH, 16)}

									<div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); margin-top: 6px; font-family: var(--font-mono);">
										<span>Older</span>
										<span style="color: ${isDown ? "var(--down)" : "var(--text-muted)"}; font-weight: 600;">
											${formatPercentage(svc.uptimePercentage24h)} uptime (24h)
										</span>
										<span>Now</span>
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
					Past 7 days
				</h4>

				${
					data.pastIncidents.length === 0
						? `
					<div style="color: var(--text-dim); font-size: 0.8125rem; padding: 0.5rem 0;">
						No incidents in the last 7 days.
					</div>
				`
						: `
					<div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.8125rem;">
						${data.pastIncidents
							.map((inc) => {
								const minutes = Math.max(1, Math.round(((inc.resolvedAt ?? inc.startedAt) - inc.startedAt) / 60000));
								return `
								<div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; color: var(--text-muted); border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
									<span>${renderTime(inc.startedAt, "date")} — <b style="color: var(--text-secondary);">${escapeHtml(inc.monitorName)}</b> was unavailable</span>
									<span style="color: var(--up); font-weight: 500; white-space: nowrap;">Resolved after ${minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`}</span>
								</div>
							`;
							})
							.join("")}
					</div>
				`
				}
			</div>
		</div>

	`;

	return renderLayout({
		title: "Status",
		children: content,
		variant: "public",
	});
}

