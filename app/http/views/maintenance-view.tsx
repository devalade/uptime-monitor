/**
 * Maintenance page: schedule windows during which checks run without opening incidents or
 * alerting, and see what is running, coming up and past.
 */

import type { Handle } from "remix/component";
import { Layout } from "~/app/http/views/layout";
import { FieldError, FormErrorSummary, invalidProps, LocalTime } from "~/app/http/views/ui";
import { parseIdList } from "~/app/services/alerting";
import type { MaintenanceFormErrors, MaintenanceFormValues } from "~/app/services/maintenance";
import type { SelectMaintenanceWindow, SelectMonitor } from "~/database/schema";
import routes from "~/routes/web";

export interface MaintenancePageProps {
	current: SelectMaintenanceWindow[];
	past: SelectMaintenanceWindow[];
	monitors: SelectMonitor[];
	form?: { values: MaintenanceFormValues; errors: MaintenanceFormErrors };
	now?: number;
}

type WindowKind = "active" | "upcoming" | "past";

export function MaintenancePage(handle: Handle<MaintenancePageProps>) {
	return () => {
		const props = handle.props;
		const now = props.now ?? Date.now();
		const names = new Map(props.monitors.map((m) => [m.id, m.name]));
		const values = props.form?.values ?? {};
		const errors = props.form?.errors ?? {};
		const errorId = (field: keyof MaintenanceFormErrors) => `mw-${field}-error`;
		const selected = new Set((values.monitor_ids ?? "").split(",").filter(Boolean));
		const scoped = values.scope === "selected";

		const active = props.current.filter((w) => w.starts_at <= now);
		const upcoming = props.current.filter((w) => w.starts_at > now);
		const row = (window: SelectMaintenanceWindow, kind: WindowKind) => <WindowRow key={window.id} window={window} kind={kind} names={names} />;

		return (
			<Layout title="Maintenance" currentPath={routes.maintenance.href()}>
				<div class="page-header">
					<div>
						<h1 class="page-title">Maintenance</h1>
						<p class="page-subtitle">
							During a window, checks keep running but no incident is opened, nobody is alerted and the checks do not count against uptime.
							Windows show on the public status page.
						</p>
					</div>
				</div>

				<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem; align-items: start;">
					<section class="card">
						<h2>Schedule a window</h2>
						{props.form ? <FormErrorSummary /> : null}
						<form method="POST" action={routes.createMaintenance.href()} novalidate>
							{/* datetime-local carries no time zone; the client script fills in the browser's offset. */}
							<input type="hidden" name="tz_offset" value={values.tz_offset ?? "0"} />
							<div class="form-group">
								<label for="mw-title">Title</label>
								<input
									id="mw-title"
									name="title"
									class="form-control"
									placeholder="Database upgrade"
									value={values.title ?? ""}
									maxlength={120}
									{...invalidProps(errorId("title"), errors.title)}
								/>
								<FieldError id={errorId("title")} message={errors.title} />
							</div>
							<div class="form-row">
								<div class="form-group">
									<label for="mw-starts">Starts</label>
									<input
										id="mw-starts"
										name="starts_at"
										type="datetime-local"
										class="form-control"
										value={values.starts_at ?? ""}
										{...invalidProps(errorId("starts_at"), errors.starts_at)}
									/>
									<FieldError id={errorId("starts_at")} message={errors.starts_at} />
								</div>
								<div class="form-group">
									<label for="mw-ends">Ends</label>
									<input
										id="mw-ends"
										name="ends_at"
										type="datetime-local"
										class="form-control"
										value={values.ends_at ?? ""}
										{...invalidProps(errorId("ends_at"), errors.ends_at)}
									/>
									<FieldError id={errorId("ends_at")} message={errors.ends_at} />
								</div>
							</div>
							<p class="form-help" style="margin-top: -0.5rem; margin-bottom: 1rem;">
								Times are in your browser's time zone.
							</p>

							<fieldset class="form-group" style="border: none;">
								<legend class="fieldset-legend">Covers</legend>
								<label class="checkbox" style="margin-bottom: 0.375rem;">
									<input type="radio" name="scope" value="all" checked={!scoped} /> Every monitor
								</label>
								<label class="checkbox" style="margin-bottom: 0.375rem;">
									<input type="radio" name="scope" value="selected" checked={scoped} /> Only these monitors:
								</label>
								<div style="padding-left: 1.5rem; max-height: 180px; overflow-y: auto;">
									{props.monitors.length === 0 ? (
										<p class="dim">No monitors yet.</p>
									) : (
										props.monitors.map((m) => (
											<label key={m.id} class="checkbox" style="margin-bottom: 0.25rem;">
												<input type="checkbox" name="monitor_ids" value={m.id} checked={selected.has(m.id)} /> {m.name}
											</label>
										))
									)}
								</div>
								<FieldError id={errorId("monitor_ids")} message={errors.monitor_ids} />
							</fieldset>

							<div style="display: flex; justify-content: flex-end;">
								<button type="submit" class="btn btn-primary">
									Schedule
								</button>
							</div>
						</form>
					</section>

					<div>
						<section class="card">
							<h2>Current and upcoming</h2>
							{active.length + upcoming.length === 0 ? (
								<p class="dim">Nothing scheduled.</p>
							) : (
								[...active.map((w) => row(w, "active")), ...upcoming.map((w) => row(w, "upcoming"))]
							)}
						</section>
						<section class="card">
							<h2>Past</h2>
							{props.past.length === 0 ? <p class="dim">No past windows.</p> : props.past.map((w) => row(w, "past"))}
						</section>
					</div>
				</div>
			</Layout>
		);
	};
}

function WindowRow(handle: Handle<{ window: SelectMaintenanceWindow; kind: WindowKind; names: Map<string, string> }>) {
	return () => {
		const { window, kind, names } = handle.props;
		const ids = parseIdList(window.monitor_ids);
		const scope = ids === null ? "All monitors" : ids.map((id) => names.get(id) ?? "Deleted monitor").join(", ");
		return (
			<div class="list-row">
				<div style="min-width: 0;">
					<div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
						<b style="color: var(--text-primary);">{window.title}</b>
						{kind === "active" ? <span class="badge badge-maintenance">In progress</span> : null}
						{kind === "upcoming" ? <span class="badge badge-pending">Scheduled</span> : null}
					</div>
					<div class="dim" style="margin-top: 0.25rem;">
						<LocalTime at={window.starts_at} /> → <LocalTime at={window.ends_at} /> · {scope}
					</div>
				</div>
				{kind === "past" ? null : (
					<form
						method="POST"
						action={routes.endMaintenance.href({ id: window.id })}
						data-confirm={kind === "active" ? "End this maintenance window now?" : "Cancel this maintenance window?"}
					>
						<button type="submit" class="btn btn-secondary btn-sm">
							{kind === "active" ? "End now" : "Cancel"}
						</button>
					</form>
				)}
			</div>
		);
	};
}
