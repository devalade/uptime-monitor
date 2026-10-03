/**
 * Web route declarations for Uptime Monitor.
 * Declares all typed routes used by views, forms, and controller mappings.
 */

import { get, post, route } from "remix/routes";

export default route({
	home: get("/"),
	status: get("/status"),
	monitor: get("/monitors/:id"),
	createMonitor: post("/monitors"),
	checkMonitor: post("/monitors/:id/check"),
	toggleMonitor: post("/monitors/:id/toggle"),
	deleteMonitor: post("/monitors/:id/delete"),
	toggleVisibility: post("/monitors/:id/visibility"),
	testAlert: post("/alerts/test"),
});
