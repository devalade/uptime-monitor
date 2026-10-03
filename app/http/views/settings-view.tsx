/**
 * Settings page: status page branding, custom domain, email subscribers and REST API keys.
 */

import { css, type Handle } from "remix/component";
import { Layout } from "~/app/http/views/layout";
import {
	pageHeader,
	pageTitle,
	pageSubtitle,
	cardGridWide,
	card,
	cardTitle,
	listRow,
	mutedSmall,
	mutedSmallSpaced,
	dim,
	dimMono,
	mono,
	strong,
	button,
	formActionsSplit,
	inlineForm,
	formGroup,
	formRow,
	formControl,
	formControlInline,
	formHelp,
	copyFieldAbove,
} from "~/app/http/views/styles";
import { FieldError, FormErrorSummary, invalidProps, LocalTime, SuccessNotice } from "~/app/http/views/ui";
import type { StatusPageFormErrors, StatusPageSettings } from "~/app/services/settings";
import type { SelectApiKey } from "~/database/schema";
import routes from "~/routes/web";

export interface SettingsPageProps {
	origin: string;
	page: StatusPageSettings;
	brandingForm?: { values: StatusPageSettings; errors: StatusPageFormErrors };
	saved?: boolean;
	subscribers: { enabled: boolean; confirmed: number; pending: number };
	apiKeys: SelectApiKey[];
	/** A key just created, shown once. */
	newApiKey?: string;
}

const openLink = css({ color: "var(--text-muted)", fontSize: "0.8125rem" });
const steps = css({ color: "var(--text-muted)", fontSize: "0.8125rem", paddingLeft: "1.125rem", lineHeight: "1.7" });

type FieldAttributes = ({ type: "text" } | { type: "url" }) & { placeholder?: string; maxlength?: number };

export function SettingsPage(handle: Handle<SettingsPageProps>) {
	return () => {
		const props = handle.props;
		const values = props.brandingForm?.values ?? props.page;
		const errors = props.brandingForm?.errors ?? {};
		const apiExample = `curl -H "Authorization: Bearer ${props.newApiKey ?? "um_…"}" ${props.origin}/api/v1/monitors`;

		const field = (name: keyof StatusPageSettings, formName: string, labelText: string, attributes: FieldAttributes, help?: string) => (
			<div mix={formGroup}>
				<label for={`st-${formName}`}>{labelText}</label>
				<input
					id={`st-${formName}`}
					name={formName}
					mix={formControl}
					value={values[name]}
					{...attributes}
					{...invalidProps(`st-${formName}-error`, errors[name])}
				/>
				<FieldError id={`st-${formName}-error`} message={errors[name]} />
				{help ? <p mix={formHelp}>{help}</p> : null}
			</div>
		);

		return (
			<Layout title="Settings" currentPath={routes.settings.href()}>
				<div mix={pageHeader}>
					<div>
						<h1 mix={pageTitle}>Settings</h1>
						<p mix={pageSubtitle}>Status page look, custom domain, email subscribers and API access.</p>
					</div>
				</div>

				{props.saved ? <SuccessNotice>Settings saved.</SuccessNotice> : null}

				<div mix={cardGridWide}>
					<section mix={card}>
						<h2 mix={cardTitle}>Status page</h2>
						{props.brandingForm ? <FormErrorSummary /> : null}
						<form method="POST" action={routes.saveStatusPageSettings.href()} novalidate>
							{field(
								"title",
								"title",
								"Title",
								{ type: "text", maxlength: 80, placeholder: "System Status" },
								"Also used as the name in the header and in subscriber emails.",
							)}
							{field("description", "description", "Description", { type: "text", maxlength: 200 })}
							{field(
								"logoUrl",
								"logo_url",
								"Logo URL",
								{ type: "url", placeholder: "https://example.com/logo.svg" },
								"Shown in the header, about 22px tall.",
							)}
							<div mix={formRow}>
								{field("accentColor", "accent_color", "Accent colour", { type: "text", placeholder: "#58a6ff", maxlength: 7 })}
								{field("homepageUrl", "homepage_url", "Logo links to", { type: "url", placeholder: "https://example.com" })}
							</div>
							{field("footer", "footer", "Footer text", { type: "text", maxlength: 200, placeholder: "© Example Inc." })}
							<div mix={formActionsSplit}>
								<a href={routes.status.href()} target="_blank" rel="noopener" mix={openLink}>
									Open the status page ↗
								</a>
								<button type="submit" mix={button.primary}>
									Save
								</button>
							</div>
						</form>
					</section>

					<div>
						<section mix={card}>
							<h2 mix={cardTitle}>Custom domain</h2>
							<ol mix={steps}>
								<li>
									In the Cloudflare dashboard, open <b>Workers &amp; Pages → uptime-monitor → Settings → Domains &amp; Routes</b> and add a custom
									domain such as <code mix={mono}>status.example.com</code> (the domain must be on your Cloudflare account).
								</li>
								<li>
									Deploy with <code mix={mono}>STATUS_HOSTNAME=status.example.com npm run deploy</code>.
								</li>
							</ol>
							<p mix={dim}>
								On that domain, <code mix={mono}>/</code> opens the status page and admin pages return 404.
							</p>
						</section>

						<section mix={card}>
							<h2 mix={cardTitle}>Email subscribers</h2>
							{props.subscribers.enabled ? (
								<p mix={mutedSmall}>
									{props.subscribers.confirmed} confirmed, {props.subscribers.pending} waiting for confirmation. People subscribe from the status
									page; they get emails for outages, incidents and maintenance.
								</p>
							) : (
								<p mix={mutedSmall}>
									Off. To let visitors subscribe from the status page, onboard a domain to Cloudflare Email Sending, then deploy with{" "}
									<code mix={mono}>MAIL_FROM=status@yourdomain.com npm run deploy</code>.{" "}
									{props.subscribers.confirmed > 0 ? `(${props.subscribers.confirmed} subscribers are waiting.)` : null}
								</p>
							)}
						</section>

						<section mix={card}>
							<h2 mix={cardTitle}>API keys</h2>
							<p mix={mutedSmallSpaced}>
								For the REST API under <code mix={mono}>/api/v1</code> (monitors, incidents, Prometheus metrics).
							</p>
							{props.newApiKey ? (
								<SuccessNotice>
									Copy this key now; it will not be shown again.
									<div mix={copyFieldAbove}>
										<code>{props.newApiKey}</code>
										<button type="button" mix={button.secondarySmall} data-copy={props.newApiKey}>
											Copy
										</button>
									</div>
								</SuccessNotice>
							) : null}
							{props.apiKeys.map((key) => (
								<div key={key.id} mix={listRow}>
									<div>
										<b mix={strong}>{key.name}</b> <span mix={dimMono}>{key.prefix}…</span>
										<div mix={dim}>
											Created <LocalTime at={key.created_at} format="date" /> ·{" "}
											{key.last_used_at ? (
												<>
													last used <LocalTime at={key.last_used_at} />
												</>
											) : (
												"never used"
											)}
										</div>
									</div>
									<form method="POST" action={routes.revokeApiKey.href({ id: key.id })} data-confirm={`Revoke “${key.name}”? Clients using it stop working.`}>
										<button type="submit" mix={button.dangerSmall}>
											Revoke
										</button>
									</form>
								</div>
							))}
							<form method="POST" action={routes.createApiKey.href()} mix={inlineForm}>
								<input name="name" mix={formControlInline} placeholder="Key name, e.g. Grafana" maxlength={60} aria-label="Key name" />
								<button type="submit" mix={button.primaryNoWrap}>
									Create key
								</button>
							</form>
							<p mix={formHelp}>
								Example: <code mix={mono}>{apiExample}</code>. Cloudflare Access must let <code mix={mono}>/api/v1</code> through for key-only
								clients (add the path to the public Access application); otherwise send an Access service token as well.
							</p>
						</section>
					</div>
				</div>
			</Layout>
		);
	};
}
