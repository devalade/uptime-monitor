/**
 * Web route declarations for Uptime Monitor.
 * Declares all typed routes used by views, forms, and controller mappings.
 */

import { get, post, route } from "remix/routes";

export default route({
	home: get("/"),
	status: get("/status"),
	statusFeed: get("/status/feed.xml"),
	statusBadge: get("/status/badge/:id.svg"),
	monitor: get("/monitors/:id"),
	createMonitor: post("/monitors"),
	updateMonitor: post("/monitors/:id"),
	checkMonitor: post("/monitors/:id/check"),
	toggleMonitor: post("/monitors/:id/toggle"),
	deleteMonitor: post("/monitors/:id/delete"),
	toggleVisibility: post("/monitors/:id/visibility"),
	maintenance: get("/maintenance"),
	createMaintenance: post("/maintenance"),
	endMaintenance: post("/maintenance/:id/end"),
	statusPosts: get("/incidents"),
	createStatusPost: post("/incidents"),
	addStatusPostUpdate: post("/incidents/:id/updates"),
	deleteStatusPost: post("/incidents/:id/delete"),
	alertChannels: get("/alerts"),
	createAlertChannel: post("/alerts"),
	testAlert: post("/alerts/test"),
	toggleAlertChannel: post("/alerts/:id/toggle"),
	deleteAlertChannel: post("/alerts/:id/delete"),
	testAlertChannel: post("/alerts/:id/test"),
});
