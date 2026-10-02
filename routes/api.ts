/**
 * Machine & API route declarations for Uptime Monitor.
 */

import { get, post, route } from "remix/routes";

export default route({
	mcp: post("/api/mcp"),
	healthcheck: get("/api/health"),
	sweep: post("/api/cron/sweep"),
});
