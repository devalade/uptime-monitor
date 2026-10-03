/**
 * Application Fetch-Router Assembly for Uptime Monitor.
 * Configures the global middleware pipeline and maps every route to its controller via lazy().
 */

import { asyncContext } from "remix/middleware/async-context";
import { renderWith } from "remix/middleware/render";
import { createRouter, type RouterContext } from "remix/router";
import { lazy } from "@sdxc/lazy-route";

import type { AppDatabase } from "~/app/contracts/database";
import type { Cache } from "~/app/contracts/cache";
import type { AlertSettings } from "~/app/services/alerting";
import type { RegionalProbes } from "~/app/services/regional-probes";
import { adminAuth, type AccessSettings } from "~/app/http/auth";
import { appServices } from "~/app/http/context";
import { createHtmlRenderer } from "~/app/http/render";
import webRoutes from "~/routes/web";
import apiRoutes from "~/routes/api";

export interface ApplicationOptions {
	db: AppDatabase;
	cache?: Cache;
	alerts?: AlertSettings;
	probes?: RegionalProbes;
	access?: AccessSettings;
}

/**
 * Builds the application router with global middleware and lazy-loaded routes.
 */
export default function application(options: ApplicationOptions) {
	const router = createRouter({
		middleware: [
			asyncContext(),
			adminAuth({ access: options.access }),
			appServices({ db: options.db, cache: options.cache, alerts: options.alerts, probes: options.probes }),
			renderWith(createHtmlRenderer),
		],
	});

	// Web UI routes (lazy-loaded to avoid cold start overhead)
	router.map(webRoutes.home, lazy(() => import("~/app/http/controllers/dashboard")));
	router.map(webRoutes.status, lazy(() => import("~/app/http/controllers/status-page")));
	router.map(webRoutes.statusFeed, lazy(() => import("~/app/http/controllers/status-feed")));
	router.map(webRoutes.statusBadge, lazy(() => import("~/app/http/controllers/status-badge")));
	router.map(webRoutes.monitor, lazy(() => import("~/app/http/controllers/monitor-detail")));
	router.map(webRoutes.createMonitor, lazy(() => import("~/app/http/controllers/create-monitor")));
	router.map(webRoutes.updateMonitor, lazy(() => import("~/app/http/controllers/update-monitor")));
	router.map(webRoutes.checkMonitor, lazy(() => import("~/app/http/controllers/trigger-check")));
	router.map(webRoutes.toggleMonitor, lazy(() => import("~/app/http/controllers/toggle-monitor")));
	router.map(webRoutes.deleteMonitor, lazy(() => import("~/app/http/controllers/delete-monitor")));
	router.map(webRoutes.toggleVisibility, lazy(() => import("~/app/http/controllers/toggle-visibility")));
	router.map(webRoutes.maintenance, lazy(() => import("~/app/http/controllers/maintenance")));
	router.map(webRoutes.createMaintenance, lazy(() => import("~/app/http/controllers/create-maintenance")));
	router.map(webRoutes.endMaintenance, lazy(() => import("~/app/http/controllers/end-maintenance")));
	router.map(webRoutes.statusPosts, lazy(() => import("~/app/http/controllers/status-posts")));
	router.map(webRoutes.createStatusPost, lazy(() => import("~/app/http/controllers/create-status-post")));
	router.map(webRoutes.addStatusPostUpdate, lazy(() => import("~/app/http/controllers/add-status-post-update")));
	router.map(webRoutes.deleteStatusPost, lazy(() => import("~/app/http/controllers/delete-status-post")));
	router.map(webRoutes.alertChannels, lazy(() => import("~/app/http/controllers/alert-channels")));
	router.map(webRoutes.createAlertChannel, lazy(() => import("~/app/http/controllers/create-alert-channel")));
	router.map(webRoutes.testAlert, lazy(() => import("~/app/http/controllers/test-alert")));
	router.map(webRoutes.toggleAlertChannel, lazy(() => import("~/app/http/controllers/toggle-alert-channel")));
	router.map(webRoutes.deleteAlertChannel, lazy(() => import("~/app/http/controllers/delete-alert-channel")));
	router.map(webRoutes.testAlertChannel, lazy(() => import("~/app/http/controllers/test-alert-channel")));

	// API and MCP routes
	router.map(apiRoutes.mcp, lazy(() => import("~/app/http/controllers/mcp")));
	router.map(apiRoutes.healthcheck, lazy(() => import("~/app/http/controllers/healthcheck")));
	router.map(apiRoutes.sweep, lazy(() => import("~/app/http/controllers/cron-sweep")));
	router.map(apiRoutes.heartbeatPing, lazy(() => import("~/app/http/controllers/heartbeat-ping")));
	router.map(apiRoutes.heartbeatFail, lazy(() => import("~/app/http/controllers/heartbeat-fail")));

	return router;
}

/** The request context every controller receives, derived from the middleware above. */
export type AppContext = RouterContext<ReturnType<typeof application>>;

declare module "remix/router" {
	interface RouterTypes {
		context: AppContext;
	}
}
