/**
 * Monitor settings dialog, for creating a monitor (rendered on every admin page so the header
 * button always works) and for editing one (on its detail page). When the server rejects a
 * submission it re-renders this with the user's values and errors.
 */

import type { Handle, RemixNode } from "remix/component";
import { FieldError, FormErrorSummary, invalidProps } from "~/app/http/views/ui";
import {
	intervalOptions,
	monitorTypeLabels,
	type MonitorFormErrors,
	type MonitorFormField,
	type MonitorFormValues,
} from "~/app/services/monitor-input";
import { dnsRecordTypes, monitorTypes } from "~/database/schema";
import routes from "~/routes/web";

export interface MonitorFormState {
	values: MonitorFormValues;
	errors: MonitorFormErrors;
}

export interface ChannelOption {
	id: string;
	name: string;
}

export interface MonitorDialogProps {
	mode: "create" | "edit";
	/** Required when editing. */
	monitorId?: string;
	/** Values to start from when editing; a rejected submission's values win. */
	initialValues?: MonitorFormValues;
	form?: MonitorFormState;
	/** Without channels the alerting section only offers "every channel". */
	channels?: ChannelOption[];
}

export const CREATE_DIALOG_ID = "add-monitor-modal";
export const EDIT_DIALOG_ID = "edit-monitor-modal";

const advancedFields = [
	"method",
	"expected_statuses",
	"timeout_seconds",
	"degraded_after_ms",
	"request_headers",
	"request_body",
	"keyword",
	"keyword_mode",
	"json_path",
	"json_expected",
] as const;
const alertingFields = ["failure_threshold", "reminder_minutes", "expiry_warning_days"] as const;

const httpMethods = [
	{ value: "GET", label: "GET" },
	{ value: "HEAD", label: "HEAD (no body checks)" },
	{ value: "POST", label: "POST" },
	{ value: "PUT", label: "PUT" },
	{ value: "PATCH", label: "PATCH" },
	{ value: "DELETE", label: "DELETE" },
];

const keywordModes = [
	{ value: "contains", label: "Contain the keyword" },
	{ value: "not_contains", label: "Not contain it" },
];

type InputAttributes = ({ type: "text" } | { type: "url" } | { type: "number" }) & {
	placeholder?: string;
	autocomplete?: string;
	spellcheck?: "false";
	maxlength?: number;
	min?: number;
	max?: number;
	autofocus?: boolean;
};

export function MonitorDialog(handle: Handle<MonitorDialogProps>) {
	return () => {
		const props = handle.props;
		const isEdit = props.mode === "edit";
		const values: MonitorFormValues = props.form?.values ?? props.initialValues ?? {};
		const errors = props.form?.errors ?? {};
		const action = isEdit && props.monitorId ? routes.updateMonitor.href({ id: props.monitorId }) : routes.createMonitor.href();
		const fieldId = (field: MonitorFormField) => `${props.mode}-${field}`;
		const errorId = (field: MonitorFormField) => `${fieldId(field)}-error`;

		const type = values.type || "http";
		const interval = values.interval_seconds || "60";
		const isPublic = values.is_public === undefined || values.is_public === "on" || values.is_public === "true";
		const alertMode = values.alert_mode === "selected" ? "selected" : "all";
		const selectedChannels = new Set((values.alert_channels ?? "").split(",").filter(Boolean));

		const label = (field: MonitorFormField, text: string, hint?: string) => (
			<label for={fieldId(field)}>
				{text}
				{hint ? <> <span class="label-hint">{hint}</span></> : null}
			</label>
		);
		const input = (field: MonitorFormField, attributes: InputAttributes, fallback = "") => (
			<>
				<input
					id={fieldId(field)}
					name={field}
					class="form-control"
					value={values[field] || fallback}
					{...attributes}
					{...invalidProps(errorId(field), errors[field])}
				/>
				<FieldError id={errorId(field)} message={errors[field]} />
			</>
		);
		const textarea = (field: MonitorFormField, placeholder: string) => (
			<>
				<textarea
					id={fieldId(field)}
					name={field}
					class="form-control"
					rows={2}
					placeholder={placeholder}
					spellcheck="false"
					value={values[field] || ""}
					{...invalidProps(errorId(field), errors[field])}
				/>
				<FieldError id={errorId(field)} message={errors[field]} />
			</>
		);
		const select = (field: MonitorFormField, options: { value: string; label: string }[], selected: string) => (
			<>
				<select id={fieldId(field)} name={field} class="form-control" {...invalidProps(errorId(field), errors[field])}>
					{options.map((o) => (
						<option value={o.value} selected={o.value === selected}>
							{o.label}
						</option>
					))}
				</select>
				<FieldError id={errorId(field)} message={errors[field]} />
			</>
		);
		/** Fields that only apply to some monitor types; the client script toggles them on change. */
		const section = (types: string, children: RemixNode) => (
			<div data-type-section={types} hidden={!types.split(" ").includes(type)}>
				{children}
			</div>
		);

		const intervalSelectOptions: { value: string; label: string }[] = intervalOptions.map((o) => ({ value: String(o.seconds), label: o.label }));
		if (!intervalSelectOptions.some((o) => o.value === interval)) {
			intervalSelectOptions.push({ value: interval, label: `Every ${interval} seconds` });
		}

		return (
			<dialog id={isEdit ? EDIT_DIALOG_ID : CREATE_DIALOG_ID} class="monitor-dialog" data-open-on-load={props.form ? "" : undefined}>
				<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
					<div>
						<h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">{isEdit ? "Edit monitor" : "New monitor"}</h3>
						<p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.125rem;">
							{isEdit ? "Changes apply from the next check." : "We'll check it on a schedule and alert you when it goes down."}
						</p>
					</div>
					<button
						type="button"
						class="btn btn-secondary btn-sm"
						data-dialog-close
						aria-label="Close"
						style="border-radius: 50%; width: 26px; height: 26px; padding: 0;"
					>
						✕
					</button>
				</div>

				{props.form ? <FormErrorSummary /> : null}

				<form method="POST" action={action} novalidate data-monitor-form>
					<div class="form-group">
						{label("type", "Type")}
						{select("type", monitorTypes.map((t) => ({ value: t, label: monitorTypeLabels[t] })), type)}
					</div>

					{section(
						"http",
						<div class="form-group">
							{label("url", "URL to check")}
							{input("url", { type: "url", placeholder: "https://api.example.com/health", autofocus: !isEdit })}
						</div>,
					)}

					{section(
						"tcp",
						<div class="form-group">
							{label("tcp_target", "Host and port")}
							{input("tcp_target", { type: "text", placeholder: "db.example.com:5432", autocomplete: "off" })}
							<p class="form-help">Passes when a TCP connection opens. Cloudflare blocks port 25.</p>
						</div>,
					)}

					{section(
						"dns",
						<>
							<div class="form-row">
								<div class="form-group">
									{label("dns_host", "Domain name")}
									{input("dns_host", { type: "text", placeholder: "example.com", autocomplete: "off", spellcheck: "false" })}
								</div>
								<div class="form-group">
									{label("dns_record_type", "Record type")}
									{select("dns_record_type", dnsRecordTypes.map((t) => ({ value: t, label: t })), values.dns_record_type || "A")}
								</div>
							</div>
							<div class="form-group">
								{label("dns_expected", "Must contain", "optional, comma-separated")}
								{input("dns_expected", { type: "text", placeholder: "93.184.215.14 or mx.example.com", spellcheck: "false" })}
								<p class="form-help">Resolved through Cloudflare DNS over HTTPS. Empty passes on any answer.</p>
							</div>
						</>,
					)}

					{section(
						"heartbeat",
						<p class="form-help" style="margin-bottom: 1rem;">
							Your cron job, backup or worker calls a private URL each time it runs. If no call arrives within the period plus the grace
							time, the monitor goes down. {isEdit ? "The URL is shown on this page." : "You get the URL after creating the monitor."}
						</p>,
					)}

					<div class="form-group">
						{label("name", "Name", "optional")}
						{input("name", { type: "text", placeholder: "Defaults to the host", maxlength: 100 })}
					</div>

					<div class="form-row">
						<div class="form-group">
							{label("interval_seconds", "Interval", "heartbeats: expected period")}
							{select("interval_seconds", intervalSelectOptions, interval)}
						</div>

						{section(
							"http",
							<div class="form-group">
								{label("expected_statuses", "Accepted status")}
								{input("expected_statuses", { type: "text", placeholder: "200, 2xx or 200-299" }, "200")}
							</div>,
						)}

						{section(
							"heartbeat",
							<div class="form-group">
								{label("grace_seconds", "Grace (seconds)")}
								{input("grace_seconds", { type: "number", min: 60, max: 86400 }, "300")}
							</div>,
						)}
					</div>

					<label class="checkbox">
						<input type="checkbox" name="is_public" checked={isPublic} />
						Show on the public status page
					</label>

					{section(
						"http tcp dns",
						<details class="advanced" open={advancedFields.some((field) => errors[field])}>
							<summary>Timing, request and assertions</summary>
							<div style="margin-top: 0.75rem;">
								<div class="form-row">
									{section(
										"http",
										<div class="form-group">
											{label("method", "HTTP method")}
											{select("method", httpMethods, values.method || "GET")}
										</div>,
									)}
									<div class="form-group">
										{label("timeout_seconds", "Timeout (s)")}
										{input("timeout_seconds", { type: "number", min: 1, max: 30 }, "10")}
									</div>
								</div>

								<div class="form-group">
									{label("degraded_after_ms", "Mark as slow after (ms)")}
									{input("degraded_after_ms", { type: "number", min: 100, max: 30000 }, "3000")}
								</div>

								{section(
									"http",
									<>
										<div class="form-group">
											{label("request_headers", "Request headers", "one per line")}
											{textarea("request_headers", "Authorization: Bearer …")}
										</div>

										<div class="form-group">
											{label("request_body", "Request body", "POST, PUT, PATCH")}
											{textarea("request_body", '{"ping": true}')}
										</div>

										<div class="form-row">
											<div class="form-group">
												{label("keyword", "Keyword", "optional")}
												{input("keyword", { type: "text", placeholder: "All systems go" })}
											</div>
											<div class="form-group">
												{label("keyword_mode", "The response must")}
												{select("keyword_mode", keywordModes, values.keyword_mode || "contains")}
											</div>
										</div>

										<div class="form-row">
											<div class="form-group">
												{label("json_path", "JSON path", "optional")}
												{input("json_path", { type: "text", placeholder: "$.status", spellcheck: "false" })}
											</div>
											<div class="form-group">
												{label("json_expected", "Equals", "empty: must exist")}
												{input("json_expected", { type: "text", placeholder: "ok" })}
											</div>
										</div>
									</>,
								)}
							</div>
						</details>,
					)}

					<details class="advanced" open={alertingFields.some((field) => errors[field])}>
						<summary>Alerting</summary>
						<div style="margin-top: 0.75rem;">
							<div class="form-row">
								<div class="form-group">
									{label("failure_threshold", "Go down after", "failed checks in a row")}
									{input("failure_threshold", { type: "number", min: 1, max: 10 }, "1")}
								</div>
								<div class="form-group">
									{label("reminder_minutes", "Remind every (min)", "0 = off")}
									{input("reminder_minutes", { type: "number", min: 0, max: 10080 }, "0")}
								</div>
							</div>

							{section(
								"http",
								<div class="form-group">
									{label("expiry_warning_days", "Warn before certificate / domain expiry", "days, 0 = off")}
									{input("expiry_warning_days", { type: "number", min: 0, max: 90 }, "14")}
									<p class="form-help">HTTPS only. Reads the certificate the server sends, twice a day, and the domain registration daily.</p>
								</div>,
							)}

							{section(
								"http tcp dns",
								<label class="checkbox">
									<input type="checkbox" name="alert_on_degraded" checked={values.alert_on_degraded === "on" || values.alert_on_degraded === "true"} />
									Also alert when it turns slow, and when it is back to normal
								</label>,
							)}

							<fieldset class="form-group" style="border: none;">
								<legend class="fieldset-legend">Send alerts to</legend>
								<label class="checkbox" style="margin-bottom: 0.375rem;">
									<input type="radio" name="alert_mode" value="all" checked={alertMode === "all"} />
									Every alert channel
								</label>
								{props.channels && props.channels.length > 0 ? (
									<>
										<label class="checkbox" style="margin-bottom: 0.375rem;">
											<input type="radio" name="alert_mode" value="selected" checked={alertMode === "selected"} />
											Only these channels:
										</label>
										<div style="padding-left: 1.5rem;">
											{props.channels.map((channel) => (
												<label key={channel.id} class="checkbox" style="margin-bottom: 0.25rem;">
													<input type="checkbox" name="alert_channels" value={channel.id} checked={selectedChannels.has(channel.id)} />
													{channel.name}
												</label>
											))}
										</div>
									</>
								) : (
									<p class="form-help">
										Add channels on the{" "}
										<a href={routes.alertChannels.href()} style="color: var(--brand);">
											Alerts
										</a>{" "}
										page to route this monitor to some of them.
									</p>
								)}
							</fieldset>
						</div>
					</details>

					<div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem;">
						<button type="button" class="btn btn-secondary" data-dialog-close>
							Cancel
						</button>
						<button type="submit" class="btn btn-primary">
							{isEdit ? "Save changes" : "Create monitor"}
						</button>
					</div>
				</form>
			</dialog>
		);
	};
}
