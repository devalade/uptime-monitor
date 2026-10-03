/**
 * REST: POST /api/v1/monitors
 * Body: the monitor settings, same fields as the create_monitor MCP tool.
 */

import { createAction } from "remix/router";
import { apiError, readJsonObject } from "~/app/http/api-response";
import { parseNewMonitor, summarizeMonitor, type MonitorApiInput } from "~/app/services/monitor-api";
import { createMonitor, monitorSettings } from "~/app/services/monitor-service";
import apiRoutes from "~/routes/api";

export default createAction(apiRoutes.v1CreateMonitor, async (ctx) => {
	const body = await readJsonObject(ctx.request);
	if (!body) return apiError(400, "Send a JSON object");

	const input = parseNewMonitor(body as MonitorApiInput);
	if (!input.ok) return apiError(422, "Invalid monitor settings", input.errors);

	const monitor = await createMonitor(ctx.db, input.value);
	const origin = ctx.url.origin;
	return Response.json(
		{
			monitor: { ...summarizeMonitor(monitor), settings: monitorSettings(monitor) },
			pingUrl: monitor.heartbeat_token ? `${origin}${apiRoutes.heartbeatPing.href({ token: monitor.heartbeat_token })}` : undefined,
		},
		{ status: 201 },
	);
});
