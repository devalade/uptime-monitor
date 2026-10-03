/**
 * Create Monitor controller for POST /monitors
 * Handles form submissions to add a new monitor. Invalid input re-renders the
 * dashboard with the dialog open, the user's values kept and the errors shown.
 */

import { createRedirectResponse } from "remix/response/redirect";
import { createAction } from "remix/router";
import { loadChannelOptions } from "~/app/http/pages";
import { createMonitor, getDashboardData } from "~/app/services/monitor-service";
import { parseMonitorInput, readMonitorForm } from "~/app/services/monitor-input";
import { DashboardPage, TIMELINE_LENGTH } from "~/app/http/views/dashboard-view";
import routes from "~/routes/web";

export default createAction(routes.createMonitor, async (ctx) => {
	const db = ctx.db;
	const values = readMonitorForm(await ctx.request.formData());
	const input = parseMonitorInput(values);

	if (!input.ok) {
		const channels = await loadChannelOptions(db, ctx.alerts);
		return ctx.render(
			<DashboardPage
				monitors={await getDashboardData(db, TIMELINE_LENGTH)}
				filter="all"
				alertsEnabled={channels.length > 0}
				form={{ values, errors: input.errors }}
				channels={channels}
			/>,
			{ status: 400 },
		);
	}

	const monitor = await createMonitor(db, input.value);

	return createRedirectResponse(routes.monitor.href({ id: monitor.id }), 303);
});
