/**
 * REST: GET /api/v1/metrics
 * Prometheus text format, for Grafana and other scrapers.
 */

import { createAction } from "remix/router";
import { calculate24hUptime, listMonitors } from "~/app/services/monitor-service";
import apiRoutes from "~/routes/api";

function label(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export default createAction(apiRoutes.v1Metrics, async (ctx) => {
	const monitors = await listMonitors(ctx.db);
	const lines: string[] = [];
	const metric = (name: string, help: string, type: "gauge", values: [string, number | null][]) => {
		lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
		for (const [labels, value] of values) if (value !== null) lines.push(`${name}{${labels}} ${value}`);
	};

	const rows = await Promise.all(
		monitors.map(async (m) => ({
			labels: `id="${m.id}",name="${label(m.name)}",type="${m.type}"`,
			monitor: m,
			uptime: await calculate24hUptime(ctx.db, m.id),
		})),
	);

	metric("uptime_monitor_up", "1 when the monitor is up or degraded, 0 when down; absent until checked or while paused", "gauge",
		rows.map((r) => [r.labels, r.monitor.is_enabled && r.monitor.last_status ? (r.monitor.last_status === "down" ? 0 : 1) : null]));
	metric("uptime_monitor_degraded", "1 when the last check was slow", "gauge",
		rows.map((r) => [r.labels, r.monitor.last_status ? (r.monitor.last_status === "degraded" ? 1 : 0) : null]));
	metric("uptime_monitor_paused", "1 when the monitor is paused", "gauge", rows.map((r) => [r.labels, r.monitor.is_enabled ? 0 : 1]));
	metric("uptime_monitor_response_time_ms", "Response time of the last check in milliseconds", "gauge",
		rows.map((r) => [r.labels, r.monitor.last_response_time_ms]));
	metric("uptime_monitor_uptime_ratio_24h", "Share of passing checks over the last 24 hours, 0 to 1", "gauge",
		rows.map((r) => [r.labels, r.uptime === null ? null : r.uptime / 100]));
	metric("uptime_monitor_certificate_expiry_timestamp_seconds", "When the TLS certificate expires, Unix time", "gauge",
		rows.map((r) => [r.labels, r.monitor.cert_expires_at === null ? null : Math.floor(r.monitor.cert_expires_at / 1000)]));
	metric("uptime_monitor_domain_expiry_timestamp_seconds", "When the domain registration expires, Unix time", "gauge",
		rows.map((r) => [r.labels, r.monitor.domain_expires_at === null ? null : Math.floor(r.monitor.domain_expires_at / 1000)]));

	return new Response(`${lines.join("\n")}\n`, { headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" } });
});
