/**
 * Application Fetch-Router Assembly for Uptime Monitor.
 * Configures the global middleware pipeline and maps every route to its controller via lazy().
 */

import { asyncContext } from "remix/middleware/async-context";
import { renderWith } from "remix/middleware/render";
import { createRouter } from "remix/router";
import { lazy } from "@sdxc/lazy-route";

import type { AppDatabase } from "~/app/contracts/database";
import type { Cache } from "~/app/contracts/cache";
import type { AlertSettings } from "~/app/services/alerting";
import { adminAuth, type AccessSettings } from "~/app/http/auth";
import { DatabaseKey, CacheKey, AlertsKey } from "~/app/http/context";
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
			async (ctx, next) => {
				ctx.set(DatabaseKey, options.db);
				ctx.set(CacheKey, options.cache);
				ctx.set(AlertsKey, options.alerts);
				return next();
			},
			renderWith(createHtmlRenderer),
		],
	});

	// Web UI routes (lazy-loaded to avoid cold start overhead)
	router.map(webRoutes.home, lazy(() => import("~/app/http/controllers/dashboard")) as any);
	router.map(webRoutes.status, lazy(() => import("~/app/http/controllers/status-page")) as any);
	router.map(webRoutes.monitor, lazy(() => import("~/app/http/controllers/monitor-detail")) as any);
	router.map(webRoutes.createMonitor, lazy(() => import("~/app/http/controllers/create-monitor")) as any);
	router.map(webRoutes.checkMonitor, lazy(() => import("~/app/http/controllers/trigger-check")) as any);
	router.map(webRoutes.toggleMonitor, lazy(() => import("~/app/http/controllers/toggle-monitor")) as any);
	router.map(webRoutes.deleteMonitor, lazy(() => import("~/app/http/controllers/delete-monitor")) as any);
	router.map(webRoutes.toggleVisibility, lazy(() => import("~/app/http/controllers/toggle-visibility")) as any);
	router.map(webRoutes.testAlert, lazy(() => import("~/app/http/controllers/test-alert")) as any);

	// API and MCP routes
	router.map(apiRoutes.mcp, lazy(() => import("~/app/http/controllers/mcp")) as any);
	router.map(apiRoutes.healthcheck, lazy(() => import("~/app/http/controllers/healthcheck")) as any);
	router.map(apiRoutes.sweep, lazy(() => import("~/app/http/controllers/cron-sweep")) as any);

	return router;
}
