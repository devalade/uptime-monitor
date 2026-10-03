/**
 * Create Maintenance controller for POST /maintenance
 * Schedules a maintenance window. Invalid input re-renders the page with the errors shown.
 */

import { createAction } from "remix/router";
import {
	createMaintenanceWindow,
	listCurrentAndUpcomingMaintenance,
	listPastMaintenance,
	parseMaintenanceInput,
	readMaintenanceForm,
} from "~/app/services/maintenance";
import { listMonitors } from "~/app/services/monitor-service";
import { renderMaintenanceView } from "~/app/http/views/maintenance-view";
import routes from "~/routes/web";

export default createAction(routes.createMaintenance, async (ctx) => {
	const values = readMaintenanceForm(await ctx.request.formData());
	const input = parseMaintenanceInput(values);

	if (!input.ok) {
		const [current, past, monitors] = await Promise.all([
			listCurrentAndUpcomingMaintenance(ctx.db),
			listPastMaintenance(ctx.db),
			listMonitors(ctx.db),
		]);
		return ctx.render(renderMaintenanceView({ current, past, monitors, form: { values, errors: input.errors } }), { status: 400 });
	}

	await createMaintenanceWindow(ctx.db, input.value);
	return Response.redirect(`${new URL(ctx.request.url).origin}${routes.maintenance.href()}`, 303);
});
