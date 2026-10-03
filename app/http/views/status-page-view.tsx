/**
 * Production Public Status Page view for Uptime Monitor.
 * Overall system status, announcements, maintenance, each service's daily uptime bars,
 * and incident history.
 */

import { renderLayout } from "~/app/http/views/layout";
import { escapeHtml, formatPercentage, renderDailyBars, renderTime } from "~/app/http/views/html";
import type { PublicServiceState, PublicStatusData } from "~/app/services/monitor-service";
import { statusPostStatusLabels, type PublicStatusPost } from "~/app/services/status-posts";
import routes from "~/routes/web";

const heroStyles: Record<PublicStatusData["systemStatus"], { bg: string; border: string; dot: string; title: string }> = {
	operational: { bg: "var(--bg-surface)", border: "var(--border-medium)", dot: "var(--up)", title: "var(--text-primary)" },
	degraded: { bg: "rgba(210, 153, 34, 0.08)", border: "var(--degraded-border)", dot: "var(--degraded)", title: "#e3b341" },
	outage: { bg: "rgba(218, 54, 51, 0.08)", border: "var(--down-border)", dot: "var(--down)", title: "#ff7b72" },
	maintenance: { bg: "var(--brand-bg)", border: "rgba(56, 139, 253, 0.35)", dot: "var(--brand)", title: "var(--brand)" },
};

const serviceStates: Record<PublicServiceState, { label: string; color: string }> = {
	up: { label: "Operational", color: "var(--up)" },
	down: { label: "Disruption", color: "var(--down)" },
	degraded: { label: "Degraded", color: "var(--degraded)" },
	maintenance: { label: "Maintenance", color: "var(--brand)" },
	pending: { label: "Awaiting first check", color: "var(--text-muted)" },
};

export function renderStatusPageView(data: PublicStatusData): string {
	const hero = heroStyles[data.systemStatus];
	const activeMaintenance = data.maintenance.filter((w) => w.isActive);
	const upcomingMaintenance = data.maintenance.filter((w) => !w.isActive);

	const content = `
		<style>
			.status-container { max-width: 880px; margin: 1.5rem auto 0; }
			.status-hero {
				background: ${hero.bg};
				border: 1px solid ${hero.border};
				border-radius: 8px;
				padding: 1.25rem 1.5rem;
				display: flex;
				align-items: center;
				justify-content: space-between;
				flex-wrap: wrap;
				gap: 1rem;
				margin-bottom: 2rem;
			}
			.service-group { background: var(--bg-surface); border: 1px solid var(--border-medium); border-radius: 8px; margin-bottom: 1.75rem; overflow: hidden; }
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
			.service-row { padding: 14px 18px; border-bottom: 1px solid var(--border-subtle); }
			.service-row:last-child { border-bottom: none; }
			.incident-box { background: var(--bg-surface); border: 1px solid var(--border-medium); border-radius: 8px; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; }
			.post-update { border-left: 2px solid var(--border-strong); padding-left: 12px; margin-top: 0.75rem; }
			.post-update b { color: var(--text-primary); }
			.history-title { font-size: 0.8125rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 1rem; letter-spacing: 0.04em; }
		</style>

		<div class="status-container">
			<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap;">
				<div>
					<h1 style="font-size: 1.5rem; font-weight: 700; color: #fff; letter-spacing: -0.02em;">System Status</h1>
					<p style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 0.125rem;">Live operational health & historical availability</p>
				</div>
				<a href="${routes.statusFeed.href()}" class="btn btn-secondary btn-sm" title="Subscribe to incidents and maintenance in a feed reader">RSS feed</a>
			</div>

			<div class="status-hero">
				<div style="display: flex; align-items: center; gap: 14px;">
					<span style="width: 10px; height: 10px; border-radius: 50%; background: ${hero.dot}; flex-shrink: 0;"></span>
					<div>
						<h2 style="font-size: 1.0625rem; font-weight: 600; color: ${hero.title};">${escapeHtml(data.systemStatusTitle)}</h2>
						<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">${escapeHtml(data.systemStatusDescription)}</div>
					</div>
				</div>
				<div style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">Updated ${renderTime(data.generatedAt)}</div>
			</div>

			${data.activePosts.map((post) => renderActivePost(post)).join("")}

			${
				data.activeIncidents.length > 0
					? `
				<div class="incident-box" style="border-color: var(--down-border); background: rgba(218, 54, 51, 0.04);">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
						<div style="display: flex; align-items: center; gap: 8px;">
							<span class="status-dot down"></span>
							<h3 style="font-size: 0.9375rem; font-weight: 600; color: #ff7b72;">Ongoing incident${data.activeIncidents.length > 1 ? "s" : ""}</h3>
						</div>
						<span class="badge badge-down">ONGOING</span>
					</div>
					<div style="display: flex; flex-direction: column; gap: 1rem; font-size: 0.8125rem;">
						${data.activeIncidents
							.map(
								(inc) => `
							<div style="border-left: 2px solid var(--down); padding-left: 12px;">
								<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
									<b style="color: var(--text-primary);">${escapeHtml(inc.monitorName)}</b>
									<span style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">since ${renderTime(inc.startedAt)}</span>
								</div>
								<div style="color: var(--text-secondary); margin-top: 4px; line-height: 1.5;">
									This service is not responding as expected. It will update here automatically when it recovers.
								</div>
							</div>`,
							)
							.join("")}
					</div>
				</div>`
					: ""
			}

			${activeMaintenance.map((w) => renderMaintenance(w, true)).join("")}

			<div class="service-group">
				<div class="service-group-header">
					<span>Services</span>
					<span style="color: var(--text-muted); font-family: var(--font-mono); font-weight: 600;">
						${formatPercentage(data.overallUptime24h)} uptime, last 24h
					</span>
				</div>

				${
					data.services.length === 0
						? `<div style="padding: 2.5rem; text-align: center; color: var(--text-muted);">No services are being monitored yet.</div>`
						: data.services
								.map((svc) => {
									const state = serviceStates[svc.status];
									return `
								<div class="service-row">
									<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 1rem;">
										<span style="font-weight: 600; color: #f0f6fc; font-size: 0.875rem;">${escapeHtml(svc.name)}</span>
										<span style="color: ${state.color}; font-size: 12px; font-weight: 500; white-space: nowrap;">● ${state.label}</span>
									</div>

									${renderDailyBars(svc.dailyUptime, 28)}

									<div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); margin-top: 6px; font-family: var(--font-mono);">
										<span>${data.historyDays} days ago</span>
										<span style="color: ${svc.status === "down" ? "var(--down)" : "var(--text-muted)"}; font-weight: 600;">
											${formatPercentage(svc.uptimePercentageOverall)} uptime
										</span>
										<span>Today</span>
									</div>
								</div>`;
								})
								.join("")
				}
			</div>

			${
				upcomingMaintenance.length > 0
					? `<div style="margin-top: 2rem;">
				<h4 class="history-title">Scheduled maintenance</h4>
				${upcomingMaintenance.map((w) => renderMaintenance(w, false)).join("")}
			</div>`
					: ""
			}

			<div style="margin-top: 2.5rem; border-top: 1px solid var(--border-subtle); padding-top: 1.5rem;">
				<h4 class="history-title">Past 7 days</h4>
				${renderHistory(data)}
			</div>
		</div>
	`;

	return renderLayout({
		title: "Status",
		children: content,
		variant: "public",
		head: `<link rel="alternate" type="application/rss+xml" title="Status updates" href="${routes.statusFeed.href()}" />`,
		footer: `Updated every minute · <a href="${routes.statusFeed.href()}" style="text-decoration: underline;">RSS feed</a>`,
	});
}

function renderActivePost(post: PublicStatusPost): string {
	const color = post.impact === "major" ? "var(--down)" : post.impact === "minor" ? "var(--degraded)" : "var(--brand)";
	const titleColor = post.impact === "major" ? "#ff7b72" : post.impact === "minor" ? "#e3b341" : "var(--brand)";
	return `
		<div class="incident-box" style="border-color: ${color};">
			<div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
				<h3 style="font-size: 0.9375rem; font-weight: 600; color: ${titleColor};">${escapeHtml(post.title)}</h3>
				<span class="badge badge-pending">${statusPostStatusLabels[post.status]}</span>
			</div>
			${renderPostUpdates(post)}
		</div>`;
}

function renderPostUpdates(post: PublicStatusPost): string {
	return post.updates
		.map(
			(update) => `
		<div class="post-update" style="font-size: 0.8125rem;">
			<div><b>${statusPostStatusLabels[update.status]}</b> <span class="dim mono">${renderTime(update.createdAt)}</span></div>
			<div style="color: var(--text-secondary); margin-top: 2px; line-height: 1.5; white-space: pre-line;">${escapeHtml(update.message)}</div>
		</div>`,
		)
		.join("");
}

function renderMaintenance(window: PublicStatusData["maintenance"][number], isActive: boolean): string {
	const scope = window.serviceNames.length === 0 ? "All services" : window.serviceNames.map(escapeHtml).join(", ");
	return `
		<div class="incident-box" style="border-color: rgba(56, 139, 253, 0.35); ${isActive ? "background: var(--brand-bg);" : ""}">
			<div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
				<h3 style="font-size: 0.9375rem; font-weight: 600; color: var(--brand);">${isActive ? "Maintenance in progress: " : ""}${escapeHtml(window.title)}</h3>
				<span class="badge badge-maintenance">${isActive ? "IN PROGRESS" : "SCHEDULED"}</span>
			</div>
			<div style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 0.5rem;">
				${renderTime(window.startsAt)} → ${renderTime(window.endsAt)} · ${scope}
			</div>
		</div>`;
}

function renderHistory(data: PublicStatusData): string {
	const entries = [
		...data.pastIncidents.map((inc) => {
			const minutes = Math.max(1, Math.round(((inc.resolvedAt ?? inc.startedAt) - inc.startedAt) / 60000));
			return {
				at: inc.startedAt,
				html: `
				<div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; color: var(--text-muted); border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
					<span>${renderTime(inc.startedAt, "date")} — <b style="color: var(--text-secondary);">${escapeHtml(inc.monitorName)}</b> was unavailable</span>
					<span style="color: var(--up); font-weight: 500; white-space: nowrap;">Resolved after ${minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`}</span>
				</div>`,
			};
		}),
		...data.pastPosts.map((post) => ({
			at: post.createdAt,
			html: `
				<details style="color: var(--text-muted); border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
					<summary style="cursor: pointer; display: flex; justify-content: space-between; gap: 1rem;">
						<span>${renderTime(post.createdAt, "date")} — <b style="color: var(--text-secondary);">${escapeHtml(post.title)}</b></span>
						<span style="color: var(--up); font-weight: 500; white-space: nowrap;">Resolved</span>
					</summary>
					${renderPostUpdates(post)}
				</details>`,
		})),
	].sort((a, b) => b.at - a.at);

	if (entries.length === 0) {
		return `<div style="color: var(--text-dim); font-size: 0.8125rem; padding: 0.5rem 0;">No incidents in the last 7 days.</div>`;
	}
	return `<div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.8125rem;">${entries.map((e) => e.html).join("")}</div>`;
}
