/**
 * Create Monitor controller for POST /monitors
 * Handles form submissions to add a new monitor. Invalid input re-renders the
 * dashboard with the dialog open, the user's values kept and the errors shown.
 */

import { createAction } from "remix/router";
import { loadChannelOptions } from "~/app/http/pages";
import { createMonitor, getDashboardData } from "~/app/services/monitor-service";
import { parseMonitorInput, readMonitorForm } from "~/app/services/monitor-input";
import { renderDashboardView, TIMELINE_LENGTH } from "~/app/http/views/dashboard-view";
import routes from "~/routes/web";

export default createAction(routes.createMonitor, async (ctx) => {
	const db = ctx.db;
	const values = readMonitorForm(await ctx.request.formData());
	const input = parseMonitorInput(values);

	if (!input.ok) {
		const channels = await loadChannelOptions(db, ctx.alerts);
		const html = renderDashboardView({
			monitors: await getDashboardData(db, TIMELINE_LENGTH),
			filter: "all",
			alertsEnabled: channels.length > 0,
			form: { values, errors: input.errors },
			channels,
		});
		return ctx.render(html, { status: 400 });
	}

	const monitor = await createMonitor(db, input.value);

	const origin = new URL(ctx.request.url).origin;
	return Response.redirect(`${origin}${routes.monitor.href({ id: monitor.id })}`, 303);
});
