/**
 * Alerts page: the channels that receive DOWN, reminder and RECOVERED alerts.
 * Environment channels (ALERT_EMAIL, ALERT_WEBHOOK_URL) are listed read-only.
 */

import { escapeHtml } from "~/app/http/views/html";
import { renderLayout } from "~/app/http/views/layout";
import {
	alertChannelTypeLabels,
	describeChannelTarget,
	type AlertChannelFormErrors,
	type AlertChannelFormValues,
} from "~/app/services/alert-channels";
import { toAlertChannel, type AlertChannel } from "~/app/services/alerting";
import { alertChannelTypes, type SelectAlertChannel } from "~/database/schema";
import routes from "~/routes/web";

export type AlertsNotice = { kind: "sent"; channel: string } | { kind: "failed"; detail: string } | { kind: "none" };

export interface AlertChannelsViewProps {
	envChannels: AlertChannel[];
	rows: SelectAlertChannel[];
	form?: { values: AlertChannelFormValues; errors: AlertChannelFormErrors };
	notice?: AlertsNotice;
}

export function parseAlertsNotice(params: URLSearchParams): AlertsNotice | undefined {
	const kind = params.get("notice");
	if (kind === "sent") return { kind, channel: params.get("channel") ?? "the channel" };
	if (kind === "failed") return { kind, detail: params.get("detail") ?? "Unknown error" };
	if (kind === "none") return { kind };
	return undefined;
}

export function renderAlertChannelsView(props: AlertChannelsViewProps): string {
	const values = props.form?.values ?? {};
	const errors = props.form?.errors ?? {};
	const type = values.type || "webhook";
	const field = (name: keyof AlertChannelFormValues, labelText: string, attrs: string, help = "") => `
		<div class="form-group">
			<label for="ch-${name}">${labelText}</label>
			<input id="ch-${name}" name="${name}" class="form-control" value="${escapeHtml(values[name] ?? "")}" ${attrs} ${errors[name] ? `aria-invalid="true" aria-describedby="ch-${name}-error"` : ""} />
			${errors[name] ? `<p class="form-error" id="ch-${name}-error">${escapeHtml(errors[name] ?? "")}</p>` : ""}
			${help ? `<p class="form-help">${help}</p>` : ""}
		</div>`;
	const total = props.envChannels.length + props.rows.length;

	const content = `
		<div class="page-header">
			<div>
				<h1 class="page-title">Alerts</h1>
				<p class="page-subtitle">Every channel gets DOWN, STILL DOWN reminders and RECOVERED alerts, unless a monitor is set to use only some of them (edit the monitor, then Alerting).</p>
			</div>
			${
				total > 0
					? `<form method="POST" action="${routes.testAlert.href()}"><button type="submit" class="btn btn-secondary btn-sm" data-busy="Sending…">Test every channel</button></form>`
					: ""
			}
		</div>

		${renderNotice(props.notice)}

		<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem; align-items: start;">
			<section class="card">
				<h2>Channels</h2>
				${total === 0 ? `<p class="dim">No channels yet. Checks still run, but nobody is told when something goes down.</p>` : ""}
				${props.envChannels
					.map(
						(channel) => `<div class="list-row">
					<div>
						<b style="color: var(--text-primary);">${escapeHtml(channel.name)}</b> <span class="badge badge-pending">environment</span>
						<div class="dim mono" style="margin-top: 0.25rem;">${escapeHtml(describeChannelTarget(channel))}</div>
					</div>
				</div>`,
					)
					.join("")}
				${props.rows.map(renderRow).join("")}
			</section>

			<section class="card">
				<h2>Add a channel</h2>
				${props.form ? `<div class="alert alert-error" role="alert">Please fix the highlighted fields.</div>` : ""}
				<form method="POST" action="${routes.createAlertChannel.href()}" novalidate data-channel-form>
					<div class="form-group">
						<label for="ch-type">Type</label>
						<select id="ch-type" name="type" class="form-control">
							${alertChannelTypes.map((t) => `<option value="${t}" ${t === type ? "selected" : ""}>${alertChannelTypeLabels[t]}</option>`).join("")}
						</select>
					</div>
					${field("name", "Name", `placeholder="Team Discord" maxlength="60"`)}
					<div data-channel-section="webhook" ${type === "webhook" ? "" : "hidden"}>
						${field("url", "Webhook URL", `type="url" placeholder="https://discord.com/api/webhooks/…"`, "Discord, Slack and ntfy.sh URLs get their own format; any other URL receives JSON.")}
					</div>
					<div data-channel-section="telegram" ${type === "telegram" ? "" : "hidden"}>
						${field("bot_token", "Bot token", `autocomplete="off" placeholder="123456:ABC-DEF…"`, "Create a bot with @BotFather and add it to your chat.")}
						${field("chat_id", "Chat id", `placeholder="-1001234567890 or @mychannel"`)}
					</div>
					<div data-channel-section="pagerduty" ${type === "pagerduty" ? "" : "hidden"}>
						${field("routing_key", "Integration key", `autocomplete="off" placeholder="32-character Events API v2 key"`, "From a PagerDuty service's Events API v2 integration. Outages trigger and resolve one PagerDuty incident per monitor.")}
					</div>
					<div style="display: flex; justify-content: flex-end;"><button type="submit" class="btn btn-primary">Add channel</button></div>
				</form>
			</section>
		</div>

		<script>
			document.querySelectorAll("form[data-channel-form]").forEach((form) => {
				const select = form.querySelector("select[name=type]");
				const sync = () => form.querySelectorAll("[data-channel-section]").forEach((s) => (s.hidden = s.getAttribute("data-channel-section") !== select.value));
				select.addEventListener("change", sync);
				sync();
			});
		</script>
	`;

	return renderLayout({ title: "Alerts", children: content, currentPath: routes.alertChannels.href() });
}

function renderRow(row: SelectAlertChannel): string {
	const channel = toAlertChannel(row);
	return `
		<div class="list-row" style="${row.is_enabled ? "" : "opacity: 0.55;"}">
			<div style="min-width: 0;">
				<b style="color: var(--text-primary);">${escapeHtml(row.name)}</b>
				<span class="badge badge-pending">${row.type}</span>
				${row.is_enabled ? "" : `<span class="badge badge-pending">off</span>`}
				<div class="dim mono" style="margin-top: 0.25rem;">${channel ? escapeHtml(describeChannelTarget(channel)) : "Incomplete settings"}</div>
			</div>
			<div style="display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end;">
				<form method="POST" action="${routes.testAlertChannel.href({ id: row.id })}"><button type="submit" class="btn btn-secondary btn-sm" data-busy="Sending…" ${row.is_enabled ? "" : "disabled"}>Test</button></form>
				<form method="POST" action="${routes.toggleAlertChannel.href({ id: row.id })}"><button type="submit" class="btn btn-secondary btn-sm">${row.is_enabled ? "Turn off" : "Turn on"}</button></form>
				<form method="POST" action="${routes.deleteAlertChannel.href({ id: row.id })}" data-confirm="${escapeHtml(`Delete the “${row.name}” channel?`)}"><button type="submit" class="btn btn-danger btn-sm" aria-label="Delete ${escapeHtml(row.name)}">✕</button></form>
			</div>
		</div>`;
}

function renderNotice(notice?: AlertsNotice): string {
	if (!notice) return "";
	if (notice.kind === "sent") {
		return `<div class="alert" role="status" style="border-color: var(--up-border); background: var(--up-bg); color: var(--up);">Test alert sent to ${escapeHtml(notice.channel)}. Check that it arrived.</div>`;
	}
	if (notice.kind === "failed") {
		return `<div class="alert alert-error" role="alert"><b>Test alert failed.</b> ${escapeHtml(notice.detail)}</div>`;
	}
	return `<div class="alert alert-error" role="alert">No alert channel is configured, so there is nothing to test.</div>`;
}
