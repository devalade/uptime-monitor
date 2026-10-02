/**
 * Healthcheck controller for GET /api/health
 */

import { createAction } from "remix/router";
import apiRoutes from "~/routes/api";

export default createAction(apiRoutes.healthcheck, async () => {
	return Response.json({
		status: "ok",
		service: "uptime-monitor",
		runtime: "cloudflare-workers",
		timestamp: new Date().toISOString(),
	});
});
