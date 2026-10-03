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
import { adminAuth, type AccessSettings } from "~/app/http/auth";
import { appServices } from "~/app/http/context";
import { createHtmlRenderer } from "~/app/http/render";
import webRoutes from "~/routes/web";
import apiRoutes from "~/routes/api";

export interface ApplicationOptions {
	db: AppDatabase;
	cache?: Cache;
	alerts?: AlertSettings;
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
			appServices({ db: options.db, cache: options.cache, alerts: options.alerts }),
			renderWith(createHtmlRenderer),
		],
	});

	// Web UI routes (lazy-loaded to avoid cold start overhead)
	router.map(webRoutes.home, lazy(() => import("~/app/http/controllers/dashboard")));
	router.map(webRoutes.status, lazy(() => import("~/app/http/controllers/status-page")));
	router.map(webRoutes.monitor, lazy(() => import("~/app/http/controllers/monitor-detail")));
	router.map(webRoutes.createMonitor, lazy(() => import("~/app/http/controllers/create-monitor")));
	router.map(webRoutes.checkMonitor, lazy(() => import("~/app/http/controllers/trigger-check")));
	router.map(webRoutes.toggleMonitor, lazy(() => import("~/app/http/controllers/toggle-monitor")));
	router.map(webRoutes.deleteMonitor, lazy(() => import("~/app/http/controllers/delete-monitor")));
	router.map(webRoutes.toggleVisibility, lazy(() => import("~/app/http/controllers/toggle-visibility")));
	router.map(webRoutes.testAlert, lazy(() => import("~/app/http/controllers/test-alert")));

	// API and MCP routes
	router.map(apiRoutes.mcp, lazy(() => import("~/app/http/controllers/mcp")));
	router.map(apiRoutes.healthcheck, lazy(() => import("~/app/http/controllers/healthcheck")));
	router.map(apiRoutes.sweep, lazy(() => import("~/app/http/controllers/cron-sweep")));

	return router;
}

/** The request context every controller receives, derived from the middleware above. */
export type AppContext = RouterContext<ReturnType<typeof application>>;

declare module "remix/router" {
	interface RouterTypes {
		context: AppContext;
	}
}
