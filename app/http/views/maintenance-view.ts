/**
 * Maintenance page: schedule windows during which checks run without opening incidents or
 * alerting, and see what is running, coming up and past.
 */

import { escapeHtml, renderTime } from "~/app/http/views/html";
import { renderLayout } from "~/app/http/views/layout";
import { parseIdList } from "~/app/services/alerting";
import type { MaintenanceFormErrors, MaintenanceFormValues } from "~/app/services/maintenance";
import type { SelectMaintenanceWindow, SelectMonitor } from "~/database/schema";
import routes from "~/routes/web";

export interface MaintenanceViewProps {
	current: SelectMaintenanceWindow[];
	past: SelectMaintenanceWindow[];
	monitors: SelectMonitor[];
	form?: { values: MaintenanceFormValues; errors: MaintenanceFormErrors };
	now?: number;
}

export function renderMaintenanceView(props: MaintenanceViewProps): string {
	const now = props.now ?? Date.now();
	const names = new Map(props.monitors.map((m) => [m.id, m.name]));
	const values = props.form?.values ?? {};
	const errors = props.form?.errors ?? {};
	const error = (field: keyof MaintenanceFormErrors) =>
		errors[field] ? `<p class="form-error" id="mw-${field}-error">${escapeHtml(errors[field] ?? "")}</p>` : "";
	const invalid = (field: keyof MaintenanceFormErrors) => (errors[field] ? `aria-invalid="true" aria-describedby="mw-${field}-error"` : "");
	const selected = new Set((values.monitor_ids ?? "").split(",").filter(Boolean));
	const scoped = values.scope === "selected";

	const scopeText = (window: SelectMaintenanceWindow) => {
		const ids = parseIdList(window.monitor_ids);
		return ids === null ? "All monitors" : ids.map((id) => escapeHtml(names.get(id) ?? "Deleted monitor")).join(", ");
	};

	const row = (window: SelectMaintenanceWindow, kind: "active" | "upcoming" | "past") => `
		<div class="list-row">
			<div style="min-width: 0;">
				<div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
					<b style="color: var(--text-primary);">${escapeHtml(window.title)}</b>
					${kind === "active" ? `<span class="badge badge-maintenance">In progress</span>` : kind === "upcoming" ? `<span class="badge badge-pending">Scheduled</span>` : ""}
				</div>
				<div class="dim" style="margin-top: 0.25rem;">${renderTime(window.starts_at)} → ${renderTime(window.ends_at)} · ${scopeText(window)}</div>
			</div>
			${
				kind === "past"
					? ""
					: `<form method="POST" action="${routes.endMaintenance.href({ id: window.id })}" data-confirm="${kind === "active" ? "End this maintenance window now?" : "Cancel this maintenance window?"}">
				<button type="submit" class="btn btn-secondary btn-sm">${kind === "active" ? "End now" : "Cancel"}</button>
			</form>`
			}
		</div>`;

	const active = props.current.filter((w) => w.starts_at <= now);
	const upcoming = props.current.filter((w) => w.starts_at > now);

	const content = `
		<div class="page-header">
			<div>
				<h1 class="page-title">Maintenance</h1>
				<p class="page-subtitle">During a window, checks keep running but no incident is opened, nobody is alerted and the checks do not count against uptime. Windows show on the public status page.</p>
			</div>
		</div>

		<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem; align-items: start;">
			<section class="card">
				<h2>Schedule a window</h2>
				${props.form ? `<div class="alert alert-error" role="alert">Please fix the highlighted fields.</div>` : ""}
				<form method="POST" action="${routes.createMaintenance.href()}" novalidate>
					<input type="hidden" name="tz_offset" value="${escapeHtml(values.tz_offset ?? "0")}" />
					<div class="form-group">
						<label for="mw-title">Title</label>
						<input id="mw-title" name="title" class="form-control" placeholder="Database upgrade" value="${escapeHtml(values.title ?? "")}" maxlength="120" ${invalid("title")} />
						${error("title")}
					</div>
					<div class="form-row">
						<div class="form-group">
							<label for="mw-starts">Starts</label>
							<input id="mw-starts" name="starts_at" type="datetime-local" class="form-control" value="${escapeHtml(values.starts_at ?? "")}" ${invalid("starts_at")} />
							${error("starts_at")}
						</div>
						<div class="form-group">
							<label for="mw-ends">Ends</label>
							<input id="mw-ends" name="ends_at" type="datetime-local" class="form-control" value="${escapeHtml(values.ends_at ?? "")}" ${invalid("ends_at")} />
							${error("ends_at")}
						</div>
					</div>
					<p class="form-help" style="margin-top: -0.5rem; margin-bottom: 1rem;">Times are in your browser's time zone.</p>

					<fieldset class="form-group" style="border: none;">
						<legend class="fieldset-legend">Covers</legend>
						<label class="checkbox" style="margin-bottom: 0.375rem;">
							<input type="radio" name="scope" value="all" ${scoped ? "" : "checked"} /> Every monitor
						</label>
						<label class="checkbox" style="margin-bottom: 0.375rem;">
							<input type="radio" name="scope" value="selected" ${scoped ? "checked" : ""} /> Only these monitors:
						</label>
						<div style="padding-left: 1.5rem; max-height: 180px; overflow-y: auto;">
							${
								props.monitors.length === 0
									? `<p class="dim">No monitors yet.</p>`
									: props.monitors
											.map(
												(m) => `<label class="checkbox" style="margin-bottom: 0.25rem;">
								<input type="checkbox" name="monitor_ids" value="${escapeHtml(m.id)}" ${selected.has(m.id) ? "checked" : ""} /> ${escapeHtml(m.name)}
							</label>`,
											)
											.join("")
							}
						</div>
						${error("monitor_ids")}
					</fieldset>

					<div style="display: flex; justify-content: flex-end;">
						<button type="submit" class="btn btn-primary">Schedule</button>
					</div>
				</form>
			</section>

			<div>
				<section class="card">
					<h2>Current and upcoming</h2>
					${
						active.length + upcoming.length === 0
							? `<p class="dim">Nothing scheduled.</p>`
							: [...active.map((w) => row(w, "active")), ...upcoming.map((w) => row(w, "upcoming"))].join("")
					}
				</section>
				<section class="card">
					<h2>Past</h2>
					${props.past.length === 0 ? `<p class="dim">No past windows.</p>` : props.past.map((w) => row(w, "past")).join("")}
				</section>
			</div>
		</div>
	`;

	return renderLayout({ title: "Maintenance", children: content, currentPath: routes.maintenance.href() });
}
