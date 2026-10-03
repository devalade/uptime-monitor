/**
 * RSS 2.0 feed of the public status page: incidents written by people, outages detected by
 * checks, and maintenance windows. Lets users follow the status page from a feed reader.
 */

import { html, type SafeHtml } from "remix/html-template";
import type { PublicStatusData } from "~/app/services/monitor-service";
import { statusPostStatusLabels } from "~/app/services/status-posts";

interface FeedItem {
	guid: string;
	title: string;
	description: string;
	publishedAt: number;
}

export function renderStatusFeed(data: PublicStatusData, statusPageUrl: string, title = "System status"): SafeHtml {
	const items: FeedItem[] = [
		...[...data.activePosts, ...data.pastPosts].map((post) => ({
			guid: `post-${post.id}-${post.updates.length}`,
			title: `${post.resolvedAt ? "[Resolved] " : ""}${post.title}`,
			description: post.updates.map((u) => `${statusPostStatusLabels[u.status]} (${new Date(u.createdAt).toUTCString()}): ${u.message}`).join("\n\n"),
			publishedAt: post.updates[0]?.createdAt ?? post.createdAt,
		})),
		...[...data.activeIncidents, ...data.pastIncidents].map((incident) => ({
			guid: `incident-${incident.id}-${incident.resolvedAt ? "resolved" : "open"}`,
			title: incident.resolvedAt ? `[Resolved] ${incident.monitorName} is back up` : `${incident.monitorName} is down`,
			description: incident.resolvedAt
				? `${incident.monitorName} was unavailable from ${new Date(incident.startedAt).toUTCString()} to ${new Date(incident.resolvedAt).toUTCString()}.`
				: `${incident.monitorName} has not been responding as expected since ${new Date(incident.startedAt).toUTCString()}.`,
			publishedAt: incident.resolvedAt ?? incident.startedAt,
		})),
		...data.maintenance.map((window) => ({
			guid: `maintenance-${window.id}`,
			title: `Maintenance: ${window.title}`,
			description: `From ${new Date(window.startsAt).toUTCString()} to ${new Date(window.endsAt).toUTCString()}. Affects ${window.serviceNames.length === 0 ? "all services" : window.serviceNames.join(", ")}.`,
			publishedAt: window.startsAt,
		})),
	].sort((a, b) => b.publishedAt - a.publishedAt);

	return html`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${title}</title>
<link>${statusPageUrl}</link>
<atom:link href="${`${statusPageUrl}/feed.xml`}" rel="self" type="application/rss+xml" />
<description>${data.systemStatusTitle}</description>
<lastBuildDate>${new Date(data.generatedAt).toUTCString()}</lastBuildDate>
<ttl>5</ttl>
${items
	.map(
		(item) => html`<item>
<title>${item.title}</title>
<link>${statusPageUrl}</link>
<guid isPermaLink="false">${item.guid}</guid>
<pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>
<description>${item.description}</description>
</item>`,
	)}
</channel>
</rss>`;
}
