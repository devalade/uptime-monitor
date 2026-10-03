/**
 * Production Public Status Page view for Uptime Monitor.
 * Overall system status, announcements, maintenance, each service's daily uptime bars,
 * and incident history.
 */

import { css, type CSSMixinDescriptor, type Handle } from "remix/component";
import { Layout } from "~/app/http/views/layout";
import {
	footerLink,
	pageTitleCentered,
	dimMono,
	strong,
	button,
	statusDot,
	badge,
	alert,
	formControlGrow,
	honeypot,
} from "~/app/http/views/styles";
import { DailyBars, formatPercentage, LocalTime } from "~/app/http/views/ui";
import type { PublicServiceState, PublicStatusData } from "~/app/services/monitor-service";
import { statusPostStatusLabels, type PublicStatusPost } from "~/app/services/status-posts";
import type { StatusPageSettings } from "~/app/services/settings";
import routes from "~/routes/web";

const heroDotBase = { width: "10px", height: "10px", borderRadius: "50%", flexShrink: 0 };
const heroTitleBase = { fontSize: "1.0625rem", fontWeight: "600" };

const heroBase = {
	borderRadius: "8px",
	padding: "1.25rem 1.5rem",
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	flexWrap: "wrap",
	gap: "1rem",
	marginBottom: "2rem",
};

const heroStyles: Record<
	PublicStatusData["systemStatus"],
	{ container: CSSMixinDescriptor; dot: CSSMixinDescriptor; title: CSSMixinDescriptor }
> = {
	operational: {
		container: css({ ...heroBase, background: "var(--bg-surface)", border: "1px solid var(--border-medium)" }),
		dot: css({ ...heroDotBase, background: "var(--up)" }),
		title: css({ ...heroTitleBase, color: "var(--text-primary)" }),
	},
	degraded: {
		container: css({ ...heroBase, background: "rgba(210, 153, 34, 0.08)", border: "1px solid var(--degraded-border)" }),
		dot: css({ ...heroDotBase, background: "var(--degraded)" }),
		title: css({ ...heroTitleBase, color: "var(--degraded-text)" }),
	},
	outage: {
		container: css({ ...heroBase, background: "rgba(218, 54, 51, 0.08)", border: "1px solid var(--down-border)" }),
		dot: css({ ...heroDotBase, background: "var(--down)" }),
		title: css({ ...heroTitleBase, color: "var(--down-text)" }),
	},
	maintenance: {
		container: css({ ...heroBase, background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }),
		dot: css({ ...heroDotBase, background: "var(--brand)" }),
		title: css({ ...heroTitleBase, color: "var(--brand)" }),
	},
};

const serviceStateBase = { fontSize: "12px", fontWeight: "500", whiteSpace: "nowrap" };
const serviceStates: Record<PublicServiceState, { label: string; mix: CSSMixinDescriptor }> = {
	up: { label: "Operational", mix: css({ ...serviceStateBase, color: "var(--up)" }) },
	down: { label: "Disruption", mix: css({ ...serviceStateBase, color: "var(--down)" }) },
	degraded: { label: "Degraded", mix: css({ ...serviceStateBase, color: "var(--degraded)" }) },
	maintenance: { label: "Maintenance", mix: css({ ...serviceStateBase, color: "var(--brand)" }) },
	pending: { label: "Awaiting first check", mix: css({ ...serviceStateBase, color: "var(--text-muted)" }) },
};

export type SubscriptionNotice = "sent" | "already" | "later" | "invalid" | "confirmed" | "unsubscribed" | "unknown";

export function parseSubscriptionNotice(raw: string | null): SubscriptionNotice | undefined {
	const notices: SubscriptionNotice[] = ["sent", "already", "later", "invalid", "confirmed", "unsubscribed", "unknown"];
	return notices.find((n) => n === raw);
}

const statusContainer = css({ maxWidth: "880px", margin: "1.5rem auto 0" });
const pageTop = css({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", gap: "1rem", flexWrap: "wrap" });
const statusTitle = css({ fontSize: "1.5rem", fontWeight: "700", color: "#fff", letterSpacing: "-0.02em" });
const statusDescription = css({ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.125rem" });
const topActions = css({ display: "flex", gap: "0.5rem", alignItems: "center" });
const heroSummary = css({ display: "flex", alignItems: "center", gap: "14px" });
const heroDescription = css({ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" });
const heroUpdated = css({ fontSize: "11px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" });

const incidentBoxBase = {
	background: "var(--bg-surface)",
	border: "1px solid var(--border-medium)",
	borderRadius: "8px",
	padding: "1.25rem 1.5rem",
	marginBottom: "1.5rem",
};
const incidentBoxSpaced = css({ ...incidentBoxBase, marginTop: "2.5rem" });
const incidentBoxDown = css({ ...incidentBoxBase, borderColor: "var(--down-border)", background: "rgba(218, 54, 51, 0.04)" });
const incidentBoxMajor = css({ ...incidentBoxBase, borderColor: "var(--down)" });
const incidentBoxMinor = css({ ...incidentBoxBase, borderColor: "var(--degraded)" });
const incidentBoxInfo = css({ ...incidentBoxBase, borderColor: "var(--brand)" });
const incidentBoxMaintenance = css({ ...incidentBoxBase, borderColor: "var(--brand-border)" });
const incidentBoxMaintenanceActive = css({ ...incidentBoxBase, borderColor: "var(--brand-border)", background: "var(--brand-bg)" });

const incidentHeader = css({
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center",
	marginBottom: "1rem",
	borderBottom: "1px solid var(--border-subtle)",
	paddingBottom: "0.75rem",
});
const incidentHeading = css({ display: "flex", alignItems: "center", gap: "8px" });
const incidentTitleDown = css({ fontSize: "0.9375rem", fontWeight: "600", color: "var(--down-text)" });
const incidentList = css({ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.8125rem" });
const incidentItem = css({ borderLeft: "2px solid var(--down)", paddingLeft: "12px" });
const incidentItemHeader = css({ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" });
const incidentItemBody = css({ color: "var(--text-secondary)", marginTop: "4px", lineHeight: "1.5" });
const sinceNote = css({ fontSize: "11px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" });

const postHeader = css({ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" });
const postTitleBase = { fontSize: "0.9375rem", fontWeight: "600" };
const postTitle = {
	major: css({ ...postTitleBase, color: "var(--down-text)" }),
	minor: css({ ...postTitleBase, color: "var(--degraded-text)" }),
	info: css({ ...postTitleBase, color: "var(--brand)" }),
};
const postUpdate = css({
	borderLeft: "2px solid var(--border-strong)",
	paddingLeft: "12px",
	marginTop: "0.75rem",
	fontSize: "0.8125rem",
});
const postUpdateMessage = css({ color: "var(--text-secondary)", marginTop: "2px", lineHeight: "1.5", whiteSpace: "pre-line" });
const maintenanceTitle = css({ fontSize: "0.9375rem", fontWeight: "600", color: "var(--brand)" });
const maintenanceWindow = css({ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.5rem" });

const serviceGroup = css({
	background: "var(--bg-surface)",
	border: "1px solid var(--border-medium)",
	borderRadius: "8px",
	marginBottom: "1.75rem",
	overflow: "hidden",
});
const serviceGroupHeader = css({
	padding: "10px 16px",
	background: "var(--bg-root)",
	borderBottom: "1px solid var(--border-subtle)",
	fontSize: "11px",
	fontWeight: "600",
	color: "var(--text-muted)",
	textTransform: "uppercase",
	letterSpacing: "0.05em",
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center",
});
const groupUptime = css({ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontWeight: "600" });
const noServices = css({ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" });
const serviceRow = css({ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", "&:last-child": { borderBottom: "none" } });
const serviceHeader = css({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "1rem" });
const serviceName = css({ fontWeight: "600", color: "var(--text-primary)", fontSize: "0.875rem" });
const serviceLegend = css({
	display: "flex",
	justifyContent: "space-between",
	fontSize: "11px",
	color: "var(--text-dim)",
	marginTop: "6px",
	fontFamily: "var(--font-mono)",
});
const legendMuted = css({ color: "var(--text-muted)", fontWeight: "600" });
const legendDown = css({ color: "var(--down)", fontWeight: "600" });

const historyTitle = css({
	fontSize: "0.8125rem",
	fontWeight: "600",
	color: "var(--text-muted)",
	textTransform: "uppercase",
	marginBottom: "1rem",
	letterSpacing: "0.04em",
});
const upcomingSection = css({ marginTop: "2rem" });
const historySection = css({ marginTop: "2.5rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "1.5rem" });
const historyList = css({ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.8125rem" });
const historyEmpty = css({ color: "var(--text-dim)", fontSize: "0.8125rem", padding: "0.5rem 0" });
const historyEntry = css({
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center",
	gap: "1rem",
	color: "var(--text-muted)",
	borderBottom: "1px solid var(--border-subtle)",
	paddingBottom: "0.5rem",
});
const historyPost = css({ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "0.5rem" });
const historyPostSummary = css({ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: "1rem" });
const historyName = css({ color: "var(--text-secondary)" });
const resolvedNote = css({ color: "var(--up)", fontWeight: "500", whiteSpace: "nowrap" });

const subscribeTitle = css({ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)" });
const subscribeLead = css({ color: "var(--text-muted)", fontSize: "0.8125rem", margin: "0.25rem 0 0.875rem" });
const subscribeForm = css({ display: "flex", gap: "0.5rem", flexWrap: "wrap" });
const unsubscribeCard = css({
	background: "var(--bg-surface)",
	border: "1px solid var(--border-medium)",
	borderRadius: "6px",
	padding: "1.25rem",
	maxWidth: "480px",
	margin: "3rem auto",
	textAlign: "center",
});
const unsubscribeLead = css({ color: "var(--text-muted)", marginBottom: "1.25rem" });

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
						<a href={routes.statusFeed.href()} mix={footerLink}>
							RSS feed
						</a>
					</>
				}
			>
				<div mix={statusContainer}>
					<div mix={pageTop}>
						<div>
							<h1 mix={statusTitle}>{page.title}</h1>
							{page.description ? <p mix={statusDescription}>{page.description}</p> : null}
						</div>
						<div mix={topActions}>
							{subscriptions ? (
								<a href="#subscribe" mix={button.secondarySmall}>
									Get email updates
								</a>
							) : null}
							<a href={routes.statusFeed.href()} mix={button.secondarySmall} title="Subscribe to incidents and maintenance in a feed reader">
								RSS feed
							</a>
						</div>
					</div>

					{message ? (
						<div mix={message.ok ? alert.success : alert.error} role="status">
							{message.text}
						</div>
					) : null}

					<div mix={hero.container}>
						<div mix={heroSummary}>
							<span mix={hero.dot}></span>
							<div>
								<h2 mix={hero.title}>{data.systemStatusTitle}</h2>
								<div mix={heroDescription}>{data.systemStatusDescription}</div>
							</div>
						</div>
						<div mix={heroUpdated}>
							Updated <LocalTime at={data.generatedAt} />
						</div>
					</div>

					{data.activePosts.map((post) => (
						<ActivePost key={post.id} post={post} />
					))}

					{data.activeIncidents.length > 0 ? (
						<div mix={incidentBoxDown}>
							<div mix={incidentHeader}>
								<div mix={incidentHeading}>
									<span mix={statusDot.down}></span>
									<h3 mix={incidentTitleDown}>Ongoing incident{data.activeIncidents.length > 1 ? "s" : ""}</h3>
								</div>
								<span mix={badge.down}>ONGOING</span>
							</div>
							<div mix={incidentList}>
								{data.activeIncidents.map((inc) => (
									<div key={inc.id} mix={incidentItem}>
										<div mix={incidentItemHeader}>
											<b mix={strong}>{inc.monitorName}</b>
											<span mix={sinceNote}>
												since <LocalTime at={inc.startedAt} />
											</span>
										</div>
										<div mix={incidentItemBody}>
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

					<div mix={serviceGroup}>
						<div mix={serviceGroupHeader}>
							<span>Services</span>
							<span mix={groupUptime}>
								{formatPercentage(data.overallUptime24h)} uptime, last 24h
							</span>
						</div>

						{data.services.length === 0 ? (
							<div mix={noServices}>No services are being monitored yet.</div>
						) : (
							data.services.map((svc) => {
								const state = serviceStates[svc.status];
								return (
									<div mix={serviceRow}>
										<div mix={serviceHeader}>
											<span mix={serviceName}>{svc.name}</span>
											<span mix={state.mix}>● {state.label}</span>
										</div>

										<DailyBars days={svc.dailyUptime} height={28} />

										<div mix={serviceLegend}>
											<span>{data.historyDays} days ago</span>
											<span mix={svc.status === "down" ? legendDown : legendMuted}>
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
						<div mix={upcomingSection}>
							<h4 mix={historyTitle}>Scheduled maintenance</h4>
							{upcomingMaintenance.map((w) => (
								<MaintenanceNotice key={w.id} window={w} isActive={false} />
							))}
						</div>
					) : null}

					<div mix={historySection}>
						<h4 mix={historyTitle}>Past 7 days</h4>
						<History data={data} />
					</div>

					{subscriptions ? (
						<div id="subscribe" mix={incidentBoxSpaced}>
							<h3 mix={subscribeTitle}>Get email updates</h3>
							<p mix={subscribeLead}>
								We'll email you when an incident starts, when it's resolved, and before planned maintenance.
							</p>
							<form method="POST" action={routes.subscribe.href()} mix={subscribeForm}>
								<input
									type="email"
									name="email"
									required
									placeholder="you@example.com"
									mix={formControlGrow}
									aria-label="Email address"
								/>
								{/* Bots fill every field, including this one hidden from people. */}
								<input type="text" name="website" tabIndex={-1} autocomplete="off" aria-hidden="true" mix={honeypot} />
								<button type="submit" mix={button.primary}>
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
				<div mix={unsubscribeCard}>
					<h1 mix={pageTitleCentered}>
						Stop email updates?
					</h1>
					<p mix={unsubscribeLead}>
						You will no longer get emails about incidents and maintenance from {page.title}.
					</p>
					<form method="POST" action={routes.unsubscribe.href({ token })}>
						<button type="submit" mix={button.danger}>
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
		const box = post.impact === "major" ? incidentBoxMajor : post.impact === "minor" ? incidentBoxMinor : incidentBoxInfo;
		const title = post.impact === "major" ? postTitle.major : post.impact === "minor" ? postTitle.minor : postTitle.info;
		return (
			<div mix={box}>
				<div mix={postHeader}>
					<h3 mix={title}>{post.title}</h3>
					<span mix={badge.pending}>{statusPostStatusLabels[post.status]}</span>
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
				<div mix={postUpdate}>
					<div>
						<b mix={strong}>{statusPostStatusLabels[update.status]}</b>{" "}
						<span mix={dimMono}>
							<LocalTime at={update.createdAt} />
						</span>
					</div>
					<div mix={postUpdateMessage}>{update.message}</div>
				</div>
			))}
		</>
	);
}

function MaintenanceNotice(handle: Handle<{ window: PublicStatusData["maintenance"][number]; isActive: boolean }>) {
	return () => {
		const { window, isActive } = handle.props;
		return (
			<div mix={isActive ? incidentBoxMaintenanceActive : incidentBoxMaintenance}>
				<div mix={postHeader}>
					<h3 mix={maintenanceTitle}>
						{isActive ? "Maintenance in progress: " : null}
						{window.title}
					</h3>
					<span mix={badge.maintenance}>{isActive ? "IN PROGRESS" : "SCHEDULED"}</span>
				</div>
				<div mix={maintenanceWindow}>
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
						<div mix={historyEntry}>
							<span>
								<LocalTime at={inc.startedAt} format="date" /> — <b mix={historyName}>{inc.monitorName}</b> was unavailable
							</span>
							<span mix={resolvedNote}>
								Resolved after {minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`}
							</span>
						</div>
					),
				};
			}),
			...data.pastPosts.map((post) => ({
				at: post.createdAt,
				node: (
					<details mix={historyPost}>
						<summary mix={historyPostSummary}>
							<span>
								<LocalTime at={post.createdAt} format="date" /> — <b mix={historyName}>{post.title}</b>
							</span>
							<span mix={resolvedNote}>Resolved</span>
						</summary>
						<PostUpdates post={post} />
					</details>
				),
			})),
		].sort((a, b) => b.at - a.at);

		if (entries.length === 0) {
			return <div mix={historyEmpty}>No incidents in the last 7 days.</div>;
		}
		return <div mix={historyList}>{entries.map((e) => e.node)}</div>;
	};
}
