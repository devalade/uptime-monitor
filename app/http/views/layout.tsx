/**
 * The document every page renders into: head, header navigation, footer, the "New monitor"
 * dialog on admin pages, and the shared stylesheet and client script.
 */

import { unsafeHTML, type Handle, type RemixNode } from "remix/component";
import { clientScript } from "~/app/http/views/client-script";
import { CREATE_DIALOG_ID, MonitorDialog, type ChannelOption, type MonitorFormState } from "~/app/http/views/monitor-form-dialog";
import { stylesheet } from "~/app/http/views/styles";
import routes from "~/routes/web";

export interface LayoutProps {
	title: string;
	children?: RemixNode;
	currentPath?: string;
	/** Public pages get no admin navigation or controls. */
	variant?: "admin" | "public";
	addMonitorForm?: MonitorFormState;
	/** Alert channels offered in the "New monitor" dialog. */
	channels?: ChannelOption[];
	/** Extra tags for the document head, e.g. a feed link. */
	head?: RemixNode;
	/** Footer content; defaults to a note about the check schedule. */
	footer?: RemixNode;
	/** Status page branding for public pages. */
	brand?: { name: string; logoUrl?: string; homepageUrl?: string; accentColor?: string };
}

const adminNavigation = [
	{ href: routes.home.href(), label: "Dashboard" },
	{ href: routes.statusPosts.href(), label: "Incidents" },
	{ href: routes.maintenance.href(), label: "Maintenance" },
	{ href: routes.alertChannels.href(), label: "Alerts" },
	{ href: routes.reports.href(), label: "Reports" },
	{ href: routes.settings.href(), label: "Settings" },
];

// Both are constants from this codebase, never request data, so they can go in unescaped.
const stylesheetHtml = unsafeHTML(stylesheet);
const clientScriptHtml = unsafeHTML(clientScript);

export function Layout(handle: Handle<LayoutProps>) {
	return () => {
		const props = handle.props;
		const isAdmin = (props.variant ?? "admin") === "admin";
		const brandName = props.brand?.name ?? "Uptime Monitor";
		const brandHref = isAdmin ? routes.home.href() : props.brand?.homepageUrl || routes.status.href();
		const accent = props.brand?.accentColor && /^#[0-9a-f]{6}$/i.test(props.brand.accentColor) ? props.brand.accentColor : undefined;

		return (
			<html lang="en" style={accent ? `--brand: ${accent};` : undefined}>
				<head>
					<meta charSet="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<title>{`${props.title} | ${brandName}`}</title>
					<link rel="preconnect" href="https://fonts.googleapis.com" />
					<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
					<link
						href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
						rel="stylesheet"
					/>
					{props.head}
					<style innerHTML={stylesheetHtml} />
				</head>
				<body>
					<header>
						<div class="header-container">
							<div style="display: flex; align-items: center; gap: 1.25rem;">
								<a href={brandHref} class="brand">
									{props.brand?.logoUrl ? (
										<img src={props.brand.logoUrl} alt="" style="height: 22px; max-width: 120px; object-fit: contain;" />
									) : (
										<svg
											width="18"
											height="18"
											viewBox="0 0 24 24"
											fill="none"
											stroke="var(--up)"
											stroke-width="2.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
										</svg>
									)}
									<span>{brandName}</span>
								</a>
							</div>

							{isAdmin ? (
								<div style="display: flex; align-items: center; gap: 1rem;">
									<nav class="nav-menu">
										{adminNavigation.map((item) => (
											<a key={item.href} href={item.href} class={`nav-item ${props.currentPath === item.href ? "active" : ""}`}>
												{item.label}
											</a>
										))}
										<a href={routes.status.href()} class="nav-item" target="_blank" rel="noopener">
											Status page ↗
										</a>
									</nav>

									<button type="button" class="btn btn-primary" data-dialog-open={CREATE_DIALOG_ID}>
										+ New monitor
									</button>
								</div>
							) : null}
						</div>
					</header>

					<main>{props.children}</main>

					<footer>{props.footer ?? "Checks run every minute on Cloudflare Workers"}</footer>

					{isAdmin ? <MonitorDialog mode="create" form={props.addMonitorForm} channels={props.channels} /> : null}

					{/* Tooltip for segmented timelines */}
					<div id="proto-tooltip"></div>

					<script innerHTML={clientScriptHtml} />
				</body>
			</html>
		);
	};
}
