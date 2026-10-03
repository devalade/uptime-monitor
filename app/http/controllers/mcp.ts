/**
 * MCP Server controller for POST /api/mcp
 * Dispatches Model Context Protocol calls to the uptime MCP tools handler.
 */

import { createAction } from "remix/router";
import { createUptimeMcpHandler } from "~/app/mcp/server";
import apiRoutes from "~/routes/api";

export default createAction(apiRoutes.mcp, async (ctx) => {
	const db = ctx.db;

	const mcp = createUptimeMcpHandler(db, ctx.alerts, ctx.probes, new URL(ctx.request.url).origin);
	return mcp.fetch(ctx.request);
});
