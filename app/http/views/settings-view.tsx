/**
 * Settings page: status page branding, custom domain, email subscribers and REST API keys.
 */

import type { Handle } from "remix/component";
import { Layout } from "~/app/http/views/layout";
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

type FieldAttributes = ({ type: "text" } | { type: "url" }) & { placeholder?: string; maxlength?: number };

export function SettingsPage(handle: Handle<SettingsPageProps>) {
	return () => {
		const props = handle.props;
		const values = props.brandingForm?.values ?? props.page;
		const errors = props.brandingForm?.errors ?? {};
		const apiExample = `curl -H "Authorization: Bearer ${props.newApiKey ?? "um_…"}" ${props.origin}/api/v1/monitors`;

		const field = (name: keyof StatusPageSettings, formName: string, labelText: string, attributes: FieldAttributes, help?: string) => (
			<div class="form-group">
				<label for={`st-${formName}`}>{labelText}</label>
				<input
					id={`st-${formName}`}
					name={formName}
					class="form-control"
					value={values[name]}
					{...attributes}
					{...invalidProps(`st-${formName}-error`, errors[name])}
				/>
				<FieldError id={`st-${formName}-error`} message={errors[name]} />
				{help ? <p class="form-help">{help}</p> : null}
			</div>
		);

		return (
			<Layout title="Settings" currentPath={routes.settings.href()}>
				<div class="page-header">
					<div>
						<h1 class="page-title">Settings</h1>
						<p class="page-subtitle">Status page look, custom domain, email subscribers and API access.</p>
					</div>
				</div>

				{props.saved ? <SuccessNotice>Settings saved.</SuccessNotice> : null}

				<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.25rem; align-items: start;">
					<section class="card">
						<h2>Status page</h2>
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
							<div class="form-row">
								{field("accentColor", "accent_color", "Accent colour", { type: "text", placeholder: "#58a6ff", maxlength: 7 })}
								{field("homepageUrl", "homepage_url", "Logo links to", { type: "url", placeholder: "https://example.com" })}
							</div>
							{field("footer", "footer", "Footer text", { type: "text", maxlength: 200, placeholder: "© Example Inc." })}
							<div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
								<a href={routes.status.href()} target="_blank" rel="noopener" class="muted" style="font-size: 0.8125rem;">
									Open the status page ↗
								</a>
								<button type="submit" class="btn btn-primary">
									Save
								</button>
							</div>
						</form>
					</section>

					<div>
						<section class="card">
							<h2>Custom domain</h2>
							<ol class="muted" style="font-size: 0.8125rem; padding-left: 1.125rem; line-height: 1.7;">
								<li>
									In the Cloudflare dashboard, open <b>Workers &amp; Pages → uptime-monitor → Settings → Domains &amp; Routes</b> and add a custom
									domain such as <code class="mono">status.example.com</code> (the domain must be on your Cloudflare account).
								</li>
								<li>
									Deploy with <code class="mono">STATUS_HOSTNAME=status.example.com npm run deploy</code>.
								</li>
							</ol>
							<p class="dim">
								On that domain, <code class="mono">/</code> opens the status page and admin pages return 404.
							</p>
						</section>

						<section class="card">
							<h2>Email subscribers</h2>
							{props.subscribers.enabled ? (
								<p class="muted" style="font-size: 0.8125rem;">
									{props.subscribers.confirmed} confirmed, {props.subscribers.pending} waiting for confirmation. People subscribe from the status
									page; they get emails for outages, incidents and maintenance.
								</p>
							) : (
								<p class="muted" style="font-size: 0.8125rem;">
									Off. To let visitors subscribe from the status page, onboard a domain to Cloudflare Email Sending, then deploy with{" "}
									<code class="mono">MAIL_FROM=status@yourdomain.com npm run deploy</code>.{" "}
									{props.subscribers.confirmed > 0 ? `(${props.subscribers.confirmed} subscribers are waiting.)` : null}
								</p>
							)}
						</section>

						<section class="card">
							<h2>API keys</h2>
							<p class="muted" style="font-size: 0.8125rem; margin-bottom: 0.75rem;">
								For the REST API under <code class="mono">/api/v1</code> (monitors, incidents, Prometheus metrics).
							</p>
							{props.newApiKey ? (
								<SuccessNotice>
									Copy this key now; it will not be shown again.
									<div class="copy-field" style="margin-top: 0.5rem;">
										<code>{props.newApiKey}</code>
										<button type="button" class="btn btn-secondary btn-sm" data-copy={props.newApiKey}>
											Copy
										</button>
									</div>
								</SuccessNotice>
							) : null}
							{props.apiKeys.map((key) => (
								<div key={key.id} class="list-row">
									<div>
										<b style="color: var(--text-primary);">{key.name}</b> <span class="dim mono">{key.prefix}…</span>
										<div class="dim">
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
										<button type="submit" class="btn btn-danger btn-sm">
											Revoke
										</button>
									</form>
								</div>
							))}
							<form method="POST" action={routes.createApiKey.href()} style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
								<input name="name" class="form-control" placeholder="Key name, e.g. Grafana" maxlength={60} aria-label="Key name" />
								<button type="submit" class="btn btn-primary" style="white-space: nowrap;">
									Create key
								</button>
							</form>
							<p class="form-help">
								Example: <code class="mono">{apiExample}</code>. Cloudflare Access must let <code class="mono">/api/v1</code> through for key-only
								clients (add the path to the public Access application); otherwise send an Access service token as well.
							</p>
						</section>
					</div>
				</div>
			</Layout>
		);
	};
}
