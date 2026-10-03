/**
 * "New monitor" dialog, rendered on every admin page so the header button always works.
 * When the server rejects a submission it re-renders this with the user's values and errors.
 */

import { escapeHtml } from "~/app/http/views/html";
import { intervalOptions, type MonitorFormErrors, type MonitorFormValues } from "~/app/services/monitor-input";
import routes from "~/routes/web";

export interface AddMonitorFormState {
	values: MonitorFormValues;
	errors: MonitorFormErrors;
}

export function renderAddMonitorDialog(form?: AddMonitorFormState): string {
	const values = form?.values ?? {};
	const errors = form?.errors ?? {};
	const value = (field: keyof MonitorFormValues, fallback = "") => escapeHtml(values[field] || fallback);
	const error = (field: keyof MonitorFormErrors) =>
		errors[field] ? `<p class="form-error" id="${field}-error">${escapeHtml(errors[field]!)}</p>` : "";
	const invalid = (field: keyof MonitorFormErrors) =>
		errors[field] ? `aria-invalid="true" aria-describedby="${field}-error"` : "";

	const method = values.method || "GET";
	const interval = values.interval_seconds || "60";

	return `
		<dialog id="add-monitor-modal" ${form ? "data-open-on-load" : ""}>
			<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
				<div>
					<h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">New monitor</h3>
					<p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.125rem;">We'll check this URL on a schedule and email you when it goes down.</p>
				</div>
				<button type="button" class="btn btn-secondary btn-sm" data-dialog-close aria-label="Close" style="border-radius: 50%; width: 26px; height: 26px; padding: 0;">✕</button>
			</div>

			${form ? `<div class="alert alert-error" role="alert">Please fix the highlighted fields.</div>` : ""}

			<form method="POST" action="${routes.createMonitor.href()}" novalidate>
				<div class="form-group">
					<label for="url">URL to check</label>
					<input type="url" id="url" name="url" class="form-control" placeholder="https://api.example.com/health" value="${value("url")}" required autofocus ${invalid("url")} />
					${error("url")}
				</div>

				<div class="form-group">
					<label for="name">Name <span class="label-hint">optional</span></label>
					<input type="text" id="name" name="name" class="form-control" placeholder="Defaults to the URL's host" value="${value("name")}" maxlength="100" ${invalid("name")} />
					${error("name")}
				</div>

				<div class="form-row">
					<div class="form-group">
						<label for="interval_seconds">Check</label>
						<select id="interval_seconds" name="interval_seconds" class="form-control" ${invalid("interval_seconds")}>
							${intervalOptions
								.map((o) => `<option value="${o.seconds}" ${String(o.seconds) === interval ? "selected" : ""}>${o.label}</option>`)
								.join("")}
						</select>
						${error("interval_seconds")}
					</div>

					<div class="form-group">
						<label for="expected_status">Expected status</label>
						<input type="number" id="expected_status" name="expected_status" class="form-control" value="${value("expected_status", "200")}" min="100" max="599" ${invalid("expected_status")} />
						${error("expected_status")}
					</div>
				</div>

				<label class="checkbox">
					<input type="checkbox" name="is_public" ${values.is_public === undefined || values.is_public === "on" ? "checked" : ""} />
					Show on the public status page
				</label>

				<details class="advanced" ${errors.method || errors.timeout_seconds || errors.degraded_after_ms ? "open" : ""}>
					<summary>Advanced</summary>
					<div class="form-row" style="margin-top: 0.75rem;">
						<div class="form-group">
							<label for="method">HTTP method</label>
							<select id="method" name="method" class="form-control" ${invalid("method")}>
								<option value="GET" ${method === "GET" ? "selected" : ""}>GET</option>
								<option value="HEAD" ${method === "HEAD" ? "selected" : ""}>HEAD (some servers reject it)</option>
								<option value="POST" ${method === "POST" ? "selected" : ""}>POST</option>
							</select>
							${error("method")}
						</div>

						<div class="form-group">
							<label for="timeout_seconds">Timeout (s)</label>
							<input type="number" id="timeout_seconds" name="timeout_seconds" class="form-control" value="${value("timeout_seconds", "10")}" min="1" max="30" ${invalid("timeout_seconds")} />
							${error("timeout_seconds")}
						</div>
					</div>

					<div class="form-group">
						<label for="degraded_after_ms">Mark as slow after (ms)</label>
						<input type="number" id="degraded_after_ms" name="degraded_after_ms" class="form-control" value="${value("degraded_after_ms", "3000")}" min="100" max="30000" ${invalid("degraded_after_ms")} />
						${error("degraded_after_ms")}
					</div>
				</details>

				<div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem;">
					<button type="button" class="btn btn-secondary" data-dialog-close>Cancel</button>
					<button type="submit" class="btn btn-primary">Create monitor</button>
				</div>
			</form>
		</dialog>
	`;
}
