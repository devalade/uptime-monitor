/**
 * REST: PATCH /api/v1/monitors/:id
 * Body: the settings to change, plus `paused` (boolean) to pause or resume.
 */

import { createAction } from "remix/router";
import { apiError, readJsonObject } from "~/app/http/api-response";
import { parseMonitorChanges, summarizeMonitor, type MonitorApiInput } from "~/app/services/monitor-api";
import { getMonitorById, monitorSettings, setMonitorEnabled, updateMonitor } from "~/app/services/monitor-service";
import apiRoutes from "~/routes/api";

export default createAction(apiRoutes.v1UpdateMonitor, async (ctx) => {
	const body = await readJsonObject(ctx.request);
	if (!body) return apiError(400, "Send a JSON object");

	let monitor = await getMonitorById(ctx.db, ctx.params.id);
	if (!monitor) return apiError(404, "Monitor not found");

	const { paused, ...changes } = body;
	if (paused !== undefined && typeof paused !== "boolean") return apiError(422, "paused must be true or false");

	if (Object.keys(changes).length > 0) {
		const input = parseMonitorChanges(monitor, changes as MonitorApiInput);
		if (!input.ok) return apiError(422, "Invalid monitor settings", input.errors);
		monitor = (await updateMonitor(ctx.db, monitor.id, input.value)) ?? monitor;
	}
	if (typeof paused === "boolean" && paused === Boolean(monitor.is_enabled)) {
		monitor = await setMonitorEnabled(ctx.db, monitor, !paused);
	}

	return Response.json({ monitor: { ...summarizeMonitor(monitor), settings: monitorSettings(monitor) } });
});
