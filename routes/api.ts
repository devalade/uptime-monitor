/**
 * Machine & API route declarations for Uptime Monitor.
 */

import { del, get, patch, post, route } from "remix/routes";

export default route({
	mcp: post("/api/mcp"),
	healthcheck: get("/api/health"),
	sweep: post("/api/cron/sweep"),
	// Heartbeat pings accept any method, so `curl`, `wget` and HEAD-only clients all work.
	heartbeatPing: "/api/health/ping/:token",
	heartbeatFail: "/api/health/ping/:token/fail",
	// REST API: an Access service token or an API key (Authorization: Bearer um_…).
	v1Monitors: get("/api/v1/monitors"),
	v1CreateMonitor: post("/api/v1/monitors"),
	v1Monitor: get("/api/v1/monitors/:id"),
	v1UpdateMonitor: patch("/api/v1/monitors/:id"),
	v1DeleteMonitor: del("/api/v1/monitors/:id"),
	v1Incidents: get("/api/v1/incidents"),
	v1Metrics: get("/api/v1/metrics"),
});
