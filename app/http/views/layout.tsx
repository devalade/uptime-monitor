/**
 * The document every page renders into: head, header navigation, footer, the "New monitor"
 * dialog on admin pages, and the shared stylesheet and client script.
 */

import { unsafeHTML, type Handle, type RemixNode } from "remix/component";
import { clientScript } from "~/app/http/views/client-script";
import { CREATE_DIALOG_ID, MonitorDialog, type ChannelOption, type MonitorFormState } from "~/app/http/views/monitor-form-dialog";
import {
	brand,
	brandGroup,
	brandLogo,
	button,
	globalStylesheet,
	headerActions,
	headerContainer,
	navItem,
	navItemActive,
	navMenu,
	pageMain,
	siteFooter,
	siteHeader,
	tooltip,
} from "~/app/http/views/styles";
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
const stylesheetHtml = unsafeHTML(globalStylesheet);
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
					<header mix={siteHeader}>
						<div mix={headerContainer}>
							<div mix={brandGroup}>
								<a href={brandHref} mix={brand}>
									{props.brand?.logoUrl ? (
										<img src={props.brand.logoUrl} alt="" mix={brandLogo} />
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
								<div mix={headerActions}>
									<nav mix={navMenu}>
										{adminNavigation.map((item) => (
											<a key={item.href} href={item.href} mix={props.currentPath === item.href ? navItemActive : navItem}>
												{item.label}
											</a>
										))}
										<a href={routes.status.href()} mix={navItem} target="_blank" rel="noopener">
											Status page ↗
										</a>
									</nav>

									<button type="button" mix={button.primary} data-dialog-open={CREATE_DIALOG_ID}>
										+ New monitor
									</button>
								</div>
							) : null}
						</div>
					</header>

					<main mix={pageMain}>{props.children}</main>

					<footer mix={siteFooter}>{props.footer ?? "Checks run every minute on Cloudflare Workers"}</footer>

					{isAdmin ? <MonitorDialog mode="create" form={props.addMonitorForm} channels={props.channels} /> : null}

					{/* Tooltip for segmented timelines */}
					<div id="proto-tooltip" mix={tooltip}></div>

					<script innerHTML={clientScriptHtml} />
				</body>
			</html>
		);
	};
}
