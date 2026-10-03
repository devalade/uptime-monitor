/**
 * Production Public Status Page view for Uptime Monitor.
 * Overall system status, announcements, maintenance, each service's daily uptime bars,
 * and incident history.
 */

import type { Handle } from "remix/component";
import { Layout } from "~/app/http/views/layout";
import { DailyBars, formatPercentage, LocalTime } from "~/app/http/views/ui";
import type { PublicServiceState, PublicStatusData } from "~/app/services/monitor-service";
import { statusPostStatusLabels, type PublicStatusPost } from "~/app/services/status-posts";
import type { StatusPageSettings } from "~/app/services/settings";
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

export type SubscriptionNotice = "sent" | "already" | "later" | "invalid" | "confirmed" | "unsubscribed" | "unknown";

export function parseSubscriptionNotice(raw: string | null): SubscriptionNotice | undefined {
	const notices: SubscriptionNotice[] = ["sent", "already", "later", "invalid", "confirmed", "unsubscribed", "unknown"];
	return notices.find((n) => n === raw);
}

const subscriptionMessages: Record<SubscriptionNotice, { text: string; ok: boolean }> = {
	sent: { text: "Check your inbox and click the link to confirm your subscription.", ok: true },
	already: { text: "This address is already subscribed.", ok: true },
	later: { text: "We already sent a confirmation link to this address. Check your inbox, or try again in an hour.", ok: false },
	invalid: { text: "That does not look like an email address.", ok: false },
	confirmed: { text: "You're subscribed. We'll email you about incidents and maintenance.", ok: true },
	unsubscribed: { text: "You're unsubscribed and won't get any more emails.", ok: true },
	unknown: { text: "This link is no longer valid.", ok: false },
};

function brandOf(page: StatusPageSettings) {
	return { name: page.title, logoUrl: page.logoUrl, homepageUrl: page.homepageUrl, accentColor: page.accentColor };
}

export interface StatusPageProps {
	data: PublicStatusData;
	page: StatusPageSettings;
	/** Show the email subscription form. */
	subscriptions: boolean;
	notice?: SubscriptionNotice;
}

export function StatusPage(handle: Handle<StatusPageProps>) {
	return () => {
		const { data, page, subscriptions, notice } = handle.props;
		const hero = heroStyles[data.systemStatus];
		const activeMaintenance = data.maintenance.filter((w) => w.isActive);
		const upcomingMaintenance = data.maintenance.filter((w) => !w.isActive);
		const message = notice ? subscriptionMessages[notice] : undefined;

		return (
			<Layout
				title="Status"
				variant="public"
				brand={brandOf(page)}
				head={<link rel="alternate" type="application/rss+xml" title="Status updates" href={routes.statusFeed.href()} />}
				footer={
					<>
						{page.footer ? `${page.footer} · ` : null}Updated every minute ·{" "}
						<a href={routes.statusFeed.href()} style="text-decoration: underline;">
							RSS feed
						</a>
					</>
				}
			>
				<div class="status-container">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap;">
						<div>
							<h1 style="font-size: 1.5rem; font-weight: 700; color: #fff; letter-spacing: -0.02em;">{page.title}</h1>
							{page.description ? <p style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 0.125rem;">{page.description}</p> : null}
						</div>
						<div style="display: flex; gap: 0.5rem; align-items: center;">
							{subscriptions ? (
								<a href="#subscribe" class="btn btn-secondary btn-sm">
									Get email updates
								</a>
							) : null}
							<a href={routes.statusFeed.href()} class="btn btn-secondary btn-sm" title="Subscribe to incidents and maintenance in a feed reader">
								RSS feed
							</a>
						</div>
					</div>

					{message ? (
						<div
							class={`alert ${message.ok ? "" : "alert-error"}`}
							role="status"
							style={message.ok ? "border-color: var(--up-border); background: var(--up-bg); color: var(--up);" : undefined}
						>
							{message.text}
						</div>
					) : null}

					<div class="status-hero" style={`background: ${hero.bg}; border: 1px solid ${hero.border};`}>
						<div style="display: flex; align-items: center; gap: 14px;">
							<span style={`width: 10px; height: 10px; border-radius: 50%; background: ${hero.dot}; flex-shrink: 0;`}></span>
							<div>
								<h2 style={`font-size: 1.0625rem; font-weight: 600; color: ${hero.title};`}>{data.systemStatusTitle}</h2>
								<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">{data.systemStatusDescription}</div>
							</div>
						</div>
						<div style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">
							Updated <LocalTime at={data.generatedAt} />
						</div>
					</div>

					{data.activePosts.map((post) => (
						<ActivePost key={post.id} post={post} />
					))}

					{data.activeIncidents.length > 0 ? (
						<div class="incident-box" style="border-color: var(--down-border); background: rgba(218, 54, 51, 0.04);">
							<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
								<div style="display: flex; align-items: center; gap: 8px;">
									<span class="status-dot down"></span>
									<h3 style="font-size: 0.9375rem; font-weight: 600; color: #ff7b72;">Ongoing incident{data.activeIncidents.length > 1 ? "s" : ""}</h3>
								</div>
								<span class="badge badge-down">ONGOING</span>
							</div>
							<div style="display: flex; flex-direction: column; gap: 1rem; font-size: 0.8125rem;">
								{data.activeIncidents.map((inc) => (
									<div key={inc.id} style="border-left: 2px solid var(--down); padding-left: 12px;">
										<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
											<b style="color: var(--text-primary);">{inc.monitorName}</b>
											<span style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">
												since <LocalTime at={inc.startedAt} />
											</span>
										</div>
										<div style="color: var(--text-secondary); margin-top: 4px; line-height: 1.5;">
											This service is not responding as expected. It will update here automatically when it recovers.
										</div>
									</div>
								))}
							</div>
						</div>
					) : null}

					{activeMaintenance.map((w) => (
						<MaintenanceNotice key={w.id} window={w} isActive />
					))}

					<div class="service-group">
						<div class="service-group-header">
							<span>Services</span>
							<span style="color: var(--text-muted); font-family: var(--font-mono); font-weight: 600;">
								{formatPercentage(data.overallUptime24h)} uptime, last 24h
							</span>
						</div>

						{data.services.length === 0 ? (
							<div style="padding: 2.5rem; text-align: center; color: var(--text-muted);">No services are being monitored yet.</div>
						) : (
							data.services.map((svc) => {
								const state = serviceStates[svc.status];
								return (
									<div class="service-row">
										<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 1rem;">
											<span style="font-weight: 600; color: #f0f6fc; font-size: 0.875rem;">{svc.name}</span>
											<span style={`color: ${state.color}; font-size: 12px; font-weight: 500; white-space: nowrap;`}>● {state.label}</span>
										</div>

										<DailyBars days={svc.dailyUptime} height={28} />

										<div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); margin-top: 6px; font-family: var(--font-mono);">
											<span>{data.historyDays} days ago</span>
											<span style={`color: ${svc.status === "down" ? "var(--down)" : "var(--text-muted)"}; font-weight: 600;`}>
												{formatPercentage(svc.uptimePercentageOverall)} uptime
											</span>
											<span>Today</span>
										</div>
									</div>
								);
							})
						)}
					</div>

					{upcomingMaintenance.length > 0 ? (
						<div style="margin-top: 2rem;">
							<h4 class="history-title">Scheduled maintenance</h4>
							{upcomingMaintenance.map((w) => (
								<MaintenanceNotice key={w.id} window={w} isActive={false} />
							))}
						</div>
					) : null}

					<div style="margin-top: 2.5rem; border-top: 1px solid var(--border-subtle); padding-top: 1.5rem;">
						<h4 class="history-title">Past 7 days</h4>
						<History data={data} />
					</div>

					{subscriptions ? (
						<div id="subscribe" class="incident-box" style="margin-top: 2.5rem;">
							<h3 style="font-size: 0.9375rem; font-weight: 600; color: var(--text-primary);">Get email updates</h3>
							<p class="muted" style="font-size: 0.8125rem; margin: 0.25rem 0 0.875rem;">
								We'll email you when an incident starts, when it's resolved, and before planned maintenance.
							</p>
							<form method="POST" action={routes.subscribe.href()} style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
								<input
									type="email"
									name="email"
									required
									placeholder="you@example.com"
									class="form-control"
									style="flex: 1; min-width: 220px;"
									aria-label="Email address"
								/>
								{/* Bots fill every field, including this one hidden from people. */}
								<input type="text" name="website" tabIndex={-1} autocomplete="off" aria-hidden="true" style="position: absolute; left: -9999px;" />
								<button type="submit" class="btn btn-primary">
									Subscribe
								</button>
							</form>
						</div>
					) : null}
				</div>
			</Layout>
		);
	};
}

/** The page behind an unsubscribe link: one button, so link scanners in mail clients cannot unsubscribe anyone. */
export function UnsubscribePage(handle: Handle<{ page: StatusPageSettings; token: string }>) {
	return () => {
		const { page, token } = handle.props;
		return (
			<Layout title="Unsubscribe" variant="public" brand={brandOf(page)}>
				<div class="card" style="max-width: 480px; margin: 3rem auto; text-align: center;">
					<h1 class="page-title" style="margin-bottom: 0.5rem;">
						Stop email updates?
					</h1>
					<p class="muted" style="margin-bottom: 1.25rem;">
						You will no longer get emails about incidents and maintenance from {page.title}.
					</p>
					<form method="POST" action={routes.unsubscribe.href({ token })}>
						<button type="submit" class="btn btn-danger">
							Unsubscribe
						</button>
					</form>
				</div>
			</Layout>
		);
	};
}

function ActivePost(handle: Handle<{ post: PublicStatusPost }>) {
	return () => {
		const post = handle.props.post;
		const color = post.impact === "major" ? "var(--down)" : post.impact === "minor" ? "var(--degraded)" : "var(--brand)";
		const titleColor = post.impact === "major" ? "#ff7b72" : post.impact === "minor" ? "#e3b341" : "var(--brand)";
		return (
			<div class="incident-box" style={`border-color: ${color};`}>
				<div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
					<h3 style={`font-size: 0.9375rem; font-weight: 600; color: ${titleColor};`}>{post.title}</h3>
					<span class="badge badge-pending">{statusPostStatusLabels[post.status]}</span>
				</div>
				<PostUpdates post={post} />
			</div>
		);
	};
}

function PostUpdates(handle: Handle<{ post: PublicStatusPost }>) {
	return () => (
		<>
			{handle.props.post.updates.map((update) => (
				<div class="post-update" style="font-size: 0.8125rem;">
					<div>
						<b>{statusPostStatusLabels[update.status]}</b>{" "}
						<span class="dim mono">
							<LocalTime at={update.createdAt} />
						</span>
					</div>
					<div style="color: var(--text-secondary); margin-top: 2px; line-height: 1.5; white-space: pre-line;">{update.message}</div>
				</div>
			))}
		</>
	);
}

function MaintenanceNotice(handle: Handle<{ window: PublicStatusData["maintenance"][number]; isActive: boolean }>) {
	return () => {
		const { window, isActive } = handle.props;
		return (
			<div class="incident-box" style={`border-color: rgba(56, 139, 253, 0.35); ${isActive ? "background: var(--brand-bg);" : ""}`}>
				<div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
					<h3 style="font-size: 0.9375rem; font-weight: 600; color: var(--brand);">
						{isActive ? "Maintenance in progress: " : null}
						{window.title}
					</h3>
					<span class="badge badge-maintenance">{isActive ? "IN PROGRESS" : "SCHEDULED"}</span>
				</div>
				<div style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 0.5rem;">
					<LocalTime at={window.startsAt} /> → <LocalTime at={window.endsAt} /> ·{" "}
					{window.serviceNames.length === 0 ? "All services" : window.serviceNames.join(", ")}
				</div>
			</div>
		);
	};
}

function History(handle: Handle<{ data: PublicStatusData }>) {
	return () => {
		const data = handle.props.data;
		const entries = [
			...data.pastIncidents.map((inc) => {
				const minutes = Math.max(1, Math.round(((inc.resolvedAt ?? inc.startedAt) - inc.startedAt) / 60000));
				return {
					at: inc.startedAt,
					node: (
						<div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; color: var(--text-muted); border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
							<span>
								<LocalTime at={inc.startedAt} format="date" /> — <b style="color: var(--text-secondary);">{inc.monitorName}</b> was unavailable
							</span>
							<span style="color: var(--up); font-weight: 500; white-space: nowrap;">
								Resolved after {minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`}
							</span>
						</div>
					),
				};
			}),
			...data.pastPosts.map((post) => ({
				at: post.createdAt,
				node: (
					<details style="color: var(--text-muted); border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
						<summary style="cursor: pointer; display: flex; justify-content: space-between; gap: 1rem;">
							<span>
								<LocalTime at={post.createdAt} format="date" /> — <b style="color: var(--text-secondary);">{post.title}</b>
							</span>
							<span style="color: var(--up); font-weight: 500; white-space: nowrap;">Resolved</span>
						</summary>
						<PostUpdates post={post} />
					</details>
				),
			})),
		].sort((a, b) => b.at - a.at);

		if (entries.length === 0) {
			return <div style="color: var(--text-dim); font-size: 0.8125rem; padding: 0.5rem 0;">No incidents in the last 7 days.</div>;
		}
		return <div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.8125rem;">{entries.map((e) => e.node)}</div>;
	};
}
