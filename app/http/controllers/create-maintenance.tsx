/**
 * Create Maintenance controller for POST /maintenance
 * Schedules a maintenance window. Invalid input re-renders the page with the errors shown.
 */

import { createRedirectResponse } from "remix/response/redirect";
import { createAction } from "remix/router";
import {
	createMaintenanceWindow,
	listCurrentAndUpcomingMaintenance,
	listPastMaintenance,
	parseMaintenanceInput,
	readMaintenanceForm,
} from "~/app/services/maintenance";
import { listMonitors } from "~/app/services/monitor-service";
import { announceMaintenance } from "~/app/services/announcements";
import { MaintenancePage } from "~/app/http/views/maintenance-view";
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
		return ctx.render(<MaintenancePage current={current} past={past} monitors={monitors} form={{ values, errors: input.errors }} />, { status: 400 });
	}

	const window = await createMaintenanceWindow(ctx.db, input.value);
	await announceMaintenance(ctx.db, ctx.alerts, window);
	return createRedirectResponse(routes.maintenance.href(), 303);
});
