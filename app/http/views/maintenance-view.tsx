/**
 * Maintenance page: schedule windows during which checks run without opening incidents or
 * alerting, and see what is running, coming up and past.
 */

import { css, type Handle } from "remix/component";
import { Layout } from "~/app/http/views/layout";
import {
	pageHeader,
	pageTitle,
	pageSubtitle,
	cardGrid,
	card,
	cardTitle,
	listRow,
	grow,
	dim,
	dimSpaced,
	strong,
	button,
	badge,
	formActions,
	formGroup,
	formRow,
	formLabel,
	fieldsetLegend,
	formControl,
	formHelpTight,
	checkboxTight,
	checkboxTighter,
	checkboxIndentScroll,
} from "~/app/http/views/styles";
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

const titleRow = css({ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" });

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
				<div mix={pageHeader}>
					<div>
						<h1 mix={pageTitle}>Maintenance</h1>
						<p mix={pageSubtitle}>
							During a window, checks keep running but no incident is opened, nobody is alerted and the checks do not count against uptime.
							Windows show on the public status page.
						</p>
					</div>
				</div>

				<div mix={cardGrid}>
					<section mix={card}>
						<h2 mix={cardTitle}>Schedule a window</h2>
						{props.form ? <FormErrorSummary /> : null}
						<form method="POST" action={routes.createMaintenance.href()} novalidate>
							{/* datetime-local carries no time zone; the client script fills in the browser's offset. */}
							<input type="hidden" name="tz_offset" value={values.tz_offset ?? "0"} />
							<div mix={formGroup}>
								<label for="mw-title" mix={formLabel}>Title</label>
								<input
									id="mw-title"
									name="title"
									mix={formControl}
									placeholder="Database upgrade"
									value={values.title ?? ""}
									maxlength={120}
									{...invalidProps(errorId("title"), errors.title)}
								/>
								<FieldError id={errorId("title")} message={errors.title} />
							</div>
							<div mix={formRow}>
								<div mix={formGroup}>
									<label for="mw-starts" mix={formLabel}>Starts</label>
									<input
										id="mw-starts"
										name="starts_at"
										type="datetime-local"
										mix={formControl}
										value={values.starts_at ?? ""}
										{...invalidProps(errorId("starts_at"), errors.starts_at)}
									/>
									<FieldError id={errorId("starts_at")} message={errors.starts_at} />
								</div>
								<div mix={formGroup}>
									<label for="mw-ends" mix={formLabel}>Ends</label>
									<input
										id="mw-ends"
										name="ends_at"
										type="datetime-local"
										mix={formControl}
										value={values.ends_at ?? ""}
										{...invalidProps(errorId("ends_at"), errors.ends_at)}
									/>
									<FieldError id={errorId("ends_at")} message={errors.ends_at} />
								</div>
							</div>
							<p mix={formHelpTight}>
								Times are in your browser's time zone.
							</p>

							<fieldset mix={formGroup}>
								<legend mix={fieldsetLegend}>Covers</legend>
								<label mix={checkboxTight}>
									<input type="radio" name="scope" value="all" checked={!scoped} /> Every monitor
								</label>
								<label mix={checkboxTight}>
									<input type="radio" name="scope" value="selected" checked={scoped} /> Only these monitors:
								</label>
								<div mix={checkboxIndentScroll}>
									{props.monitors.length === 0 ? (
										<p mix={dim}>No monitors yet.</p>
									) : (
										props.monitors.map((m) => (
											<label key={m.id} mix={checkboxTighter}>
												<input type="checkbox" name="monitor_ids" value={m.id} checked={selected.has(m.id)} /> {m.name}
											</label>
										))
									)}
								</div>
								<FieldError id={errorId("monitor_ids")} message={errors.monitor_ids} />
							</fieldset>

							<div mix={formActions}>
								<button type="submit" mix={button.primary}>
									Schedule
								</button>
							</div>
						</form>
					</section>

					<div>
						<section mix={card}>
							<h2 mix={cardTitle}>Current and upcoming</h2>
							{active.length + upcoming.length === 0 ? (
								<p mix={dim}>Nothing scheduled.</p>
							) : (
								[...active.map((w) => row(w, "active")), ...upcoming.map((w) => row(w, "upcoming"))]
							)}
						</section>
						<section mix={card}>
							<h2 mix={cardTitle}>Past</h2>
							{props.past.length === 0 ? <p mix={dim}>No past windows.</p> : props.past.map((w) => row(w, "past"))}
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
			<div mix={listRow}>
				<div mix={grow}>
					<div mix={titleRow}>
						<b mix={strong}>{window.title}</b>
						{kind === "active" ? <span mix={badge.maintenance}>In progress</span> : null}
						{kind === "upcoming" ? <span mix={badge.pending}>Scheduled</span> : null}
					</div>
					<div mix={dimSpaced}>
						<LocalTime at={window.starts_at} /> → <LocalTime at={window.ends_at} /> · {scope}
					</div>
				</div>
				{kind === "past" ? null : (
					<form
						method="POST"
						action={routes.endMaintenance.href({ id: window.id })}
						data-confirm={kind === "active" ? "End this maintenance window now?" : "Cancel this maintenance window?"}
					>
						<button type="submit" mix={button.secondarySmall}>
							{kind === "active" ? "End now" : "Cancel"}
						</button>
					</form>
				)}
			</div>
		);
	};
}
