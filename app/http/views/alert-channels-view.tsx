/**
 * Alerts page: the channels that receive DOWN, reminder and RECOVERED alerts.
 * Environment channels (ALERT_EMAIL, ALERT_WEBHOOK_URL) are listed read-only.
 */

import { css, type Handle, type RemixNode } from "remix/component";
import { Layout } from "~/app/http/views/layout";
import {
	alert,
	badge,
	button,
	card,
	cardGrid,
	cardTitle,
	dim,
	formActions,
	formControl,
	formError,
	formGroup,
	formHelp,
	formLabel,
	grow,
	listRow,
	listRowDisabled,
	pageHeader,
	pageSubtitle,
	pageTitle,
	rowActions,
	strong,
} from "~/app/http/views/styles";
import { FieldError, FormErrorSummary, invalidProps, SuccessNotice } from "~/app/http/views/ui";
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

export interface AlertChannelsPageProps {
	envChannels: AlertChannel[];
	rows: SelectAlertChannel[];
	form?: { values: AlertChannelFormValues; errors: AlertChannelFormErrors };
	notice?: AlertsNotice;
	/** Whether email can be sent (EMAIL binding and MAIL_FROM). */
	canEmail: boolean;
}

export function parseAlertsNotice(params: URLSearchParams): AlertsNotice | undefined {
	const kind = params.get("notice");
	if (kind === "sent") return { kind, channel: params.get("channel") ?? "the channel" };
	if (kind === "failed") return { kind, detail: params.get("detail") ?? "Unknown error" };
	if (kind === "none") return { kind };
	return undefined;
}

const targetLine = css({ color: "var(--text-dim)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", marginTop: "0.25rem" });

type FieldAttributes = ({ type: "text" } | { type: "url" } | { type: "email" } | { type: "password" }) & {
	placeholder?: string;
	maxlength?: number;
	autocomplete?: string;
};

export function AlertChannelsPage(handle: Handle<AlertChannelsPageProps>) {
	return () => {
		const props = handle.props;
		const values = props.form?.values ?? {};
		const errors = props.form?.errors ?? {};
		const type = values.type || "webhook";
		const total = props.envChannels.length + props.rows.length;

		const field = (name: keyof AlertChannelFormValues, labelText: string, attributes: FieldAttributes, help?: string) => (
			<div mix={formGroup}>
				<label for={`ch-${name}`} mix={formLabel}>
					{labelText}
				</label>
				<input
					id={`ch-${name}`}
					name={name}
					mix={formControl}
					value={values[name] ?? ""}
					{...attributes}
					{...invalidProps(`ch-${name}-error`, errors[name])}
				/>
				<FieldError id={`ch-${name}-error`} message={errors[name]} />
				{help ? <p mix={formHelp}>{help}</p> : null}
			</div>
		);
		/** Fields for one channel type; the client script shows the chosen type's section. */
		const section = (channelType: string, children: RemixNode) => (
			<div data-channel-section={channelType} hidden={type !== channelType}>
				{children}
			</div>
		);

		return (
			<Layout title="Alerts" currentPath={routes.alertChannels.href()}>
				<div mix={pageHeader}>
					<div>
						<h1 mix={pageTitle}>Alerts</h1>
						<p mix={pageSubtitle}>
							Every channel gets DOWN, STILL DOWN reminders and RECOVERED alerts, unless a monitor is set to use only some of them (edit the
							monitor, then Alerting).
						</p>
					</div>
					{total > 0 ? (
						<form method="POST" action={routes.testAlert.href()}>
							<button type="submit" mix={button.secondarySmall} data-busy="Sending…">
								Test every channel
							</button>
						</form>
					) : null}
				</div>

				<Notice notice={props.notice} />

				<div mix={cardGrid}>
					<section mix={card}>
						<h2 mix={cardTitle}>Channels</h2>
						{total === 0 ? <p mix={dim}>No channels yet. Checks still run, but nobody is told when something goes down.</p> : null}
						{props.envChannels.map((channel) => (
							<div mix={listRow}>
								<div>
									<b mix={strong}>{channel.name}</b> <span mix={badge.pending}>environment</span>
									<div mix={targetLine}>
										{describeChannelTarget(channel)}
									</div>
								</div>
							</div>
						))}
						{props.rows.map((row) => (
							<ChannelRow key={row.id} row={row} />
						))}
					</section>

					<section mix={card}>
						<h2 mix={cardTitle}>Add a channel</h2>
						{props.form ? <FormErrorSummary /> : null}
						<form method="POST" action={routes.createAlertChannel.href()} novalidate data-channel-form>
							<div mix={formGroup}>
								<label for="ch-type" mix={formLabel}>
									Type
								</label>
								<select id="ch-type" name="type">
									{alertChannelTypes.map((t) => {
										const unavailable = t === "email" && !props.canEmail;
										return (
											<option value={t} selected={t === type} disabled={unavailable}>
												{alertChannelTypeLabels[t]}
												{unavailable ? " (needs Email Sending)" : null}
											</option>
										);
									})}
								</select>
								{errors.type ? <p mix={formError}>{errors.type}</p> : null}
							</div>
							{field("name", "Name", { type: "text", placeholder: "Team Discord", maxlength: 60 })}
							{section(
								"webhook",
								field(
									"url",
									"Webhook URL",
									{ type: "url", placeholder: "https://discord.com/api/webhooks/…" },
									"Discord, Slack, Microsoft Teams (Workflows), Google Chat and ntfy.sh URLs get their own format; any other URL receives JSON.",
								),
							)}
							{section("telegram", [
								field(
									"bot_token",
									"Bot token",
									{ type: "text", autocomplete: "off", placeholder: "123456:ABC-DEF…" },
									"Create a bot with @BotFather and add it to your chat.",
								),
								field("chat_id", "Chat id", { type: "text", placeholder: "-1001234567890 or @mychannel" }),
							])}
							{section(
								"pagerduty",
								field(
									"routing_key",
									"Integration key",
									{ type: "text", autocomplete: "off", placeholder: "32-character Events API v2 key" },
									"From a PagerDuty service's Events API v2 integration. Outages trigger and resolve one PagerDuty incident per monitor.",
								),
							)}
							{section("pushover", [
								field(
									"pushover_token",
									"Application token",
									{ type: "text", autocomplete: "off" },
									"Create an application at pushover.net to get its API token.",
								),
								field("pushover_user", "User or group key", { type: "text", autocomplete: "off" }),
							])}
							{section("opsgenie", [
								field(
									"opsgenie_key",
									"API key",
									{ type: "text", autocomplete: "off", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
									"From an API integration in Opsgenie. Outages open an alert and recoveries close it.",
								),
								<div mix={formGroup}>
									<label for="ch-opsgenie_region" mix={formLabel}>
										Region
									</label>
									<select id="ch-opsgenie_region" name="opsgenie_region">
										<option value="us" selected={values.opsgenie_region !== "eu"}>
											US (api.opsgenie.com)
										</option>
										<option value="eu" selected={values.opsgenie_region === "eu"}>
											EU (api.eu.opsgenie.com)
										</option>
									</select>
								</div>,
							])}
							{section("twilio", [
								field("twilio_sid", "Account SID", { type: "text", autocomplete: "off", placeholder: "AC…" }),
								field("twilio_token", "Auth token", { type: "password", autocomplete: "off" }),
								field("twilio_from", "From (your Twilio number)", { type: "text", placeholder: "+15551234567" }),
								field(
									"twilio_to",
									"To",
									{ type: "text", placeholder: "+22990000000" },
									"SMS cost money on Twilio; consider turning off slowness alerts for monitors that use this channel.",
								),
							])}
							{section("email", field("email_to", "Send to", { type: "email", placeholder: "oncall@example.com" }))}
							<div mix={formActions}>
								<button type="submit" mix={button.primary}>
									Add channel
								</button>
							</div>
						</form>
					</section>
				</div>
			</Layout>
		);
	};
}

function ChannelRow(handle: Handle<{ row: SelectAlertChannel }>) {
	return () => {
		const row = handle.props.row;
		const channel = toAlertChannel(row);
		return (
			<div mix={row.is_enabled ? listRow : listRowDisabled}>
				<div mix={grow}>
					<b mix={strong}>{row.name}</b> <span mix={badge.pending}>{row.type}</span>
					{row.is_enabled ? null : (
						<>
							{" "}
							<span mix={badge.pending}>off</span>
						</>
					)}
					<div mix={targetLine}>
						{channel ? describeChannelTarget(channel) : "Incomplete settings"}
					</div>
				</div>
				<div mix={rowActions}>
					<form method="POST" action={routes.testAlertChannel.href({ id: row.id })}>
						<button type="submit" mix={button.secondarySmall} data-busy="Sending…" disabled={!row.is_enabled}>
							Test
						</button>
					</form>
					<form method="POST" action={routes.toggleAlertChannel.href({ id: row.id })}>
						<button type="submit" mix={button.secondarySmall}>
							{row.is_enabled ? "Turn off" : "Turn on"}
						</button>
					</form>
					<form method="POST" action={routes.deleteAlertChannel.href({ id: row.id })} data-confirm={`Delete the “${row.name}” channel?`}>
						<button type="submit" mix={button.dangerSmall} aria-label={`Delete ${row.name}`}>
							✕
						</button>
					</form>
				</div>
			</div>
		);
	};
}

function Notice(handle: Handle<{ notice?: AlertsNotice }>) {
	return () => {
		const notice = handle.props.notice;
		if (!notice) return null;
		if (notice.kind === "sent") return <SuccessNotice>Test alert sent to {notice.channel}. Check that it arrived.</SuccessNotice>;
		if (notice.kind === "failed") {
			return (
				<div mix={alert.error} role="alert">
					<b>Test alert failed.</b> {notice.detail}
				</div>
			);
		}
		return (
			<div mix={alert.error} role="alert">
				No alert channel is configured, so there is nothing to test.
			</div>
		);
	};
}
