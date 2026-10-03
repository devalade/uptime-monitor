/**
 * Model Context Protocol (MCP) tools for the Uptime Monitor following The Remix Way.
 * Allows AI agents to query status, inspect metrics, trigger checks, manage monitors,
 * post status page incidents and schedule maintenance.
 */

import * as s from "@sdxc/json-schema";
import * as checks from "@sdxc/json-schema/checks";
import { tool, tools } from "@sdxc/mcp";

const id = (description: string) => s.string().pipe(checks.minLength(1)).meta({ description });

/** Settings shared by create_monitor and update_monitor; every one is optional on update. */
const monitorSettingFields = {
	type: s.optional(s.enum_(["http", "tcp", "dns", "heartbeat"])).meta({
		description: "http requests a URL, tcp opens a connection to host:port, dns resolves a record, heartbeat waits for your job to ping a URL.",
	}),
	url: s.optional(s.string().pipe(checks.maxLength(500))).meta({
		description: "For http: the full URL (e.g. 'https://api.example.com/health'). For tcp: 'host:port'. For dns: the domain name. Not used by heartbeats.",
	}),
	method: s.optional(s.enum_(["HEAD", "GET", "POST", "PUT", "PATCH", "DELETE"])).meta({
		description: "HTTP method (default: GET).",
	}),
	expectedStatuses: s.optional(s.string()).meta({
		description: "Accepted HTTP status codes: a code, range or class list such as '200', '2xx' or '200-299, 301' (default: '200').",
	}),
	requestHeaders: s.optional(s.string()).meta({ description: "Request headers, one 'Name: value' per line." }),
	requestBody: s.optional(s.string()).meta({ description: "Request body for POST, PUT and PATCH." }),
	keyword: s.optional(s.string()).meta({ description: "Text the response body must contain (or not, see keywordMode)." }),
	keywordMode: s.optional(s.enum_(["contains", "not_contains"])).meta({ description: "Whether the keyword must be present (default) or absent." }),
	jsonPath: s.optional(s.string()).meta({ description: "Path into a JSON response, e.g. '$.status'." }),
	jsonExpected: s.optional(s.string()).meta({ description: "Value jsonPath must equal; empty means it only has to exist." }),
	dnsRecordType: s.optional(s.enum_(["A", "AAAA", "CNAME", "MX", "TXT", "NS"])).meta({ description: "DNS monitors: record type to resolve (default: A)." }),
	dnsExpected: s.optional(s.string()).meta({ description: "DNS monitors: comma-separated values the answer must contain; empty accepts any answer." }),
	intervalSeconds: s.optional(s.number()).meta({
		description: "Check frequency in seconds, 30 to 86400; for heartbeats, the expected ping period, 60 seconds to 30 days (default: 60).",
	}),
	timeoutSeconds: s.optional(s.number()).meta({ description: "Timeout in seconds before a check fails, 1 to 30 (default: 10)." }),
	degradedAfterMs: s.optional(s.number()).meta({ description: "Responses slower than this many ms are marked degraded (default: 3000)." }),
	graceSeconds: s.optional(s.number()).meta({ description: "Heartbeats: how late a ping may be, 60 to 86400 seconds (default: 300)." }),
	failureThreshold: s.optional(s.number()).meta({ description: "Failed checks in a row before the monitor goes down, 1 to 10 (default: 1)." }),
	reminderMinutes: s.optional(s.number()).meta({ description: "Repeat the DOWN alert every N minutes while down; 0 turns reminders off (default: 0)." }),
	expiryWarningDays: s.optional(s.number()).meta({ description: "HTTPS monitors: warn this many days before the certificate or domain expires, 0 to 90; 0 is off (default: 14)." }),
	alertOnDegraded: s.optional(s.boolean()).meta({ description: "Also alert when the monitor turns slow and when it is back to normal (default: false)." }),
	isPublic: s.optional(s.boolean()).meta({ description: "Whether the monitor appears on the public status page (default: true)." }),
};

export default tools({
	listMonitors: tool("list_monitors", {
		title: "List Monitors",
		description: "List all uptime monitors with their type, current status, target, last checked time, and latency.",
		input: s.object({}),
	}),

	getMonitor: tool("get_monitor", {
		title: "Get Monitor Details",
		description:
			"Get detailed information about a monitor: settings, 24h / 7d / 30d / 90d uptime, latency, recent checks, active incidents, and its ping URL for heartbeats.",
		input: s.object({
			id: id("The unique identifier (UUID) of the monitor to inspect."),
		}),
	}),

	checkMonitorNow: tool("check_monitor_now", {
		title: "Check Monitor Now",
		description: "Immediately execute a real-time probe against a monitor and return the latency and status outcome.",
		input: s.object({
			id: id("The monitor ID to probe immediately."),
		}),
	}),

	createMonitor: tool("create_monitor", {
		title: "Create Monitor",
		description: "Register a new monitor: an HTTP(S) endpoint, a TCP port, or a heartbeat that your job pings.",
		input: s.object({
			name: s.string().pipe(checks.minLength(1), checks.maxLength(100)).meta({
				description: "Human-readable label for the monitor (e.g. 'Production API').",
			}),
			...monitorSettingFields,
		}),
	}),

	updateMonitor: tool("update_monitor", {
		title: "Update Monitor",
		description: "Change a monitor's settings. Only the fields given are changed.",
		input: s.object({
			id: id("The monitor ID to update."),
			name: s.optional(s.string().pipe(checks.minLength(1), checks.maxLength(100))).meta({ description: "New name." }),
			...monitorSettingFields,
		}),
	}),

	setMonitorPaused: tool("set_monitor_paused", {
		title: "Pause or Resume Monitor",
		description: "Pause a monitor (no checks, no alerts) or resume it.",
		input: s.object({
			id: id("The monitor ID."),
			paused: s.boolean().meta({ description: "true pauses the monitor, false resumes it." }),
		}),
	}),

	listIncidents: tool("list_incidents", {
		title: "List Incidents",
		description: "List detected outages, newest first, optionally for one monitor or only the ones still open.",
		input: s.object({
			monitorId: s.optional(s.string()).meta({ description: "Only incidents of this monitor." }),
			activeOnly: s.defaulted(s.boolean(), false).meta({ description: "Only incidents that are still open (default: false)." }),
			limit: s.defaulted(s.number(), 20).meta({ description: "How many to return, up to 100 (default: 20)." }),
		}),
	}),

	postStatusUpdate: tool("post_status_update", {
		title: "Post Status Page Incident",
		description:
			"Open an incident on the public status page, or add an update to an open one by passing its postId. Use status 'resolved' to close it.",
		input: s.object({
			postId: s.optional(s.string()).meta({ description: "Existing status page incident to update; omit to open a new one." }),
			title: s.optional(s.string().pipe(checks.maxLength(150))).meta({ description: "Title of a new incident (required when opening one)." }),
			impact: s.optional(s.enum_(["none", "minor", "major"])).meta({ description: "Impact of a new incident (default: minor)." }),
			status: s.defaulted(s.enum_(["investigating", "identified", "monitoring", "resolved"]), "investigating").meta({
				description: "Incident status after this update.",
			}),
			message: s.string().pipe(checks.minLength(1), checks.maxLength(2000)).meta({ description: "What is happening, for your users." }),
		}),
	}),

	scheduleMaintenance: tool("schedule_maintenance", {
		title: "Schedule Maintenance",
		description:
			"Schedule a maintenance window. During it checks run but no incident is opened and nobody is alerted; it shows on the status page.",
		input: s.object({
			title: s.string().pipe(checks.minLength(1), checks.maxLength(120)).meta({ description: "What the maintenance is, e.g. 'Database upgrade'." }),
			startsAt: s.string().meta({ description: "Start time, ISO 8601 with a time zone (e.g. '2026-10-05T22:00:00Z')." }),
			endsAt: s.string().meta({ description: "End time, ISO 8601 with a time zone. At most 7 days after the start." }),
			monitorIds: s.optional(s.array(s.string())).meta({ description: "Monitors covered; omit to cover every monitor." }),
		}),
	}),
});
