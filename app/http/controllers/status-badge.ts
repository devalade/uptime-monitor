/**
 * Status badge controller for GET /status/badge/:id.svg
 * An SVG badge with a public monitor's status, or its uptime with ?type=uptime&days=30.
 * Private and paused monitors get 404, so their existence is not revealed.
 */

import { createAction } from "remix/router";
import { renderBadge, uptimeColor, type BadgeColor } from "~/app/http/views/badge";
import { getMonitorById } from "~/app/services/monitor-service";
import { getUptimeReport, UPTIME_PERIODS, type UptimePeriod } from "~/app/services/uptime-stats";
import routes from "~/routes/web";

const statusBadges: Record<string, { message: string; color: BadgeColor }> = {
	up: { message: "up", color: "green" },
	degraded: { message: "degraded", color: "yellow" },
	down: { message: "down", color: "red" },
};

export default createAction(routes.statusBadge, async (ctx) => {
	const monitor = await getMonitorById(ctx.db, ctx.params.id);
	if (!monitor || !monitor.is_public || !monitor.is_enabled) {
		return new Response("Not found", { status: 404 });
	}

	const params = new URL(ctx.request.url).searchParams;
	const label = (params.get("label") || monitor.name).slice(0, 40);
	let svg: string;

	if (params.get("type") === "uptime") {
		const days = UPTIME_PERIODS.find((p) => String(p) === params.get("days")) ?? (30 satisfies UptimePeriod);
		const uptime = (await getUptimeReport(ctx.db, monitor.id))[days];
		svg = renderBadge(params.get("label") ? label : `uptime ${days}d`, uptime === null ? "no data" : `${uptime}%`, uptimeColor(uptime));
	} else {
		const badge = statusBadges[monitor.last_status ?? ""] ?? { message: "pending", color: "grey" as const };
		svg = renderBadge(label, badge.message, badge.color);
	}

	return new Response(svg, {
		headers: {
			"Content-Type": "image/svg+xml; charset=utf-8",
			"Cache-Control": "public, max-age=60, s-maxage=60",
		},
	});
});
