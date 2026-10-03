/**
 * Model Context Protocol (MCP) tools for the Uptime Monitor following The Remix Way.
 * Allows AI agents to query status, inspect metrics, trigger checks, and register monitors.
 */

import * as s from "@sdxc/json-schema";
import * as checks from "@sdxc/json-schema/checks";
import { tool, tools } from "@sdxc/mcp";

export default tools({
	listMonitors: tool("list_monitors", {
		title: "List Monitors",
		description: "List all uptime monitors with their current status, URL, last checked time, and latency.",
		input: s.object({}),
	}),

	getMonitor: tool("get_monitor", {
		title: "Get Monitor Details",
		description: "Get detailed information about a monitor, including its 24h uptime %, latency, recent checks, and active incidents.",
		input: s.object({
			id: s.string().pipe(checks.minLength(1)).meta({
				description: "The unique identifier (UUID) of the monitor to inspect.",
			}),
		}),
	}),

	checkMonitorNow: tool("check_monitor_now", {
		title: "Check Monitor Now",
		description: "Immediately execute a real-time probe against a monitor and return the latency and status outcome.",
		input: s.object({
			id: s.string().pipe(checks.minLength(1)).meta({
				description: "The monitor ID to probe immediately.",
			}),
		}),
	}),

	createMonitor: tool("create_monitor", {
		title: "Create Monitor",
		description: "Register a new HTTP/HTTPS endpoint to be monitored.",
		input: s.object({
			name: s.string().pipe(checks.minLength(1), checks.maxLength(100)).meta({
				description: "Human-readable label for the monitor (e.g. 'Production API').",
			}),
			url: s.string().pipe(checks.minLength(1), checks.maxLength(500)).meta({
				description: "Full URL of the service to monitor (e.g. 'https://api.example.com/health').",
			}),
			method: s.defaulted(
				s.enum_(["HEAD", "GET", "POST", "PUT", "PATCH", "DELETE"]),
				"GET",
			).meta({
				description: "HTTP method to use for the check (default: GET).",
			}),
			expectedStatus: s.defaulted(s.number(), 200).meta({
				description: "Expected HTTP status code for success (default: 200).",
			}),
			intervalSeconds: s.defaulted(s.number(), 60).meta({
				description: "Check frequency in seconds, 60 to 86400 (default: 60).",
			}),
			isPublic: s.defaulted(s.boolean(), true).meta({
				description: "Whether the monitor appears on the public status page (default: true).",
			}),
			timeoutSeconds: s.defaulted(s.number(), 10).meta({
				description: "Timeout limit in seconds before marking down, 1 to 30 (default: 10).",
			}),
		}),
	}),
});
