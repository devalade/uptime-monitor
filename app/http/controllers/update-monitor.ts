/**
 * Update Monitor controller for POST /monitors/:id
 * Saves edited settings. Invalid input re-renders the detail page with the edit dialog open.
 */

import { createAction } from "remix/router";
import { renderMonitorDetailPage } from "~/app/http/pages";
import { parseMonitorInput, readMonitorForm } from "~/app/services/monitor-input";
import { updateMonitor } from "~/app/services/monitor-service";
import routes from "~/routes/web";

export default createAction(routes.updateMonitor, async (ctx) => {
	const id = ctx.params.id;
	const values = readMonitorForm(await ctx.request.formData());
	const input = parseMonitorInput(values);

	if (!input.ok) {
		const html = await renderMonitorDetailPage(ctx.db, ctx.request, id, {
			alerts: ctx.alerts,
			editForm: { values, errors: input.errors },
		});
		return html ? ctx.render(html, { status: 400 }) : new Response("Monitor not found", { status: 404 });
	}

	const updated = await updateMonitor(ctx.db, id, input.value);
	if (!updated) {
		return new Response("Monitor not found", { status: 404 });
	}

	const origin = new URL(ctx.request.url).origin;
	return Response.redirect(`${origin}${routes.monitor.href({ id })}`, 303);
});
