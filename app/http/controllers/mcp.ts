/**
 * MCP Server controller for POST /api/mcp
 * Dispatches Model Context Protocol calls to the uptime MCP tools handler.
 */

import { createAction } from "remix/router";
import { AlertsKey, requireDatabase } from "~/app/http/context";
import { createUptimeMcpHandler } from "~/app/mcp/server";
import apiRoutes from "~/routes/api";

export default createAction(apiRoutes.mcp, async (ctx) => {
	const db = requireDatabase(ctx);

	const mcp = createUptimeMcpHandler(db, ctx.get(AlertsKey));
	return mcp.fetch(ctx.request);
});
