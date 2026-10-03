/**
 * Cloudflare Configuration using the typed cloudflare.config.ts format for the new `cf` CLI.
 */

import { defineConfig, bindings, triggers } from "@cloudflare/config";

export default defineConfig({
	worker: {
		name: "uptime-monitor",
		entrypoint: "./bootstrap/worker.ts",
		compatibilityDate: "2026-10-01",
		compatibilityFlags: ["nodejs_compat"],

		env: {
			DB: bindings.d1({
				name: "uptime-db",
				id: process.env.D1_DATABASE_ID || "7c1aab67-5810-4af6-bf5d-d8bd164dc76f",
			}),
			KV: bindings.kv({
				id: process.env.KV_NAMESPACE_ID || "823f05e1cfef44e08dc6a1b1233dc1ec",
			}),
			APP_ENV: bindings.text(process.env.APP_ENV || "development"),
			APP_URL: bindings.text(process.env.APP_URL || "http://localhost:8787"),
			MAIL_FROM: bindings.text(process.env.MAIL_FROM || "alerts@uptime.local"),
			SESSION_SECRET: bindings.text(
				process.env.SESSION_SECRET || "uptime-monitor-session-secret-at-least-32-chars-long",
			),
			// Cloudflare Access application protecting the dashboard, MCP and sweep endpoints.
			// Without both, the deployed admin pages are locked (503).
			...(process.env.ACCESS_TEAM_DOMAIN && process.env.ACCESS_AUD
				? {
						ACCESS_TEAM_DOMAIN: bindings.text(process.env.ACCESS_TEAM_DOMAIN),
						ACCESS_AUD: bindings.text(process.env.ACCESS_AUD),
					}
				: {}),
			// Alerts are sent only when a recipient is configured. The address must be a verified
			// destination in Cloudflare Email Routing.
			...(process.env.ALERT_EMAIL
				? { ALERT_EMAIL: bindings.text(process.env.ALERT_EMAIL), EMAIL: bindings.sendEmail() }
				: {}),
		},

		triggers: [
			triggers.scheduled({
				schedule: "* * * * *",
			}),
		],

		observability: {
			enabled: true,
		},
	},
});
