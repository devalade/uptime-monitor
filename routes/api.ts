/**
 * Machine & API route declarations for Uptime Monitor.
 */

import { get, post, route } from "remix/routes";

export default route({
	mcp: post("/api/mcp"),
	healthcheck: get("/api/health"),
	sweep: post("/api/cron/sweep"),
	// Heartbeat pings accept any method, so `curl`, `wget` and HEAD-only clients all work.
	heartbeatPing: "/api/health/ping/:token",
	heartbeatFail: "/api/health/ping/:token/fail",
});
