/**
 * Create Monitor controller for POST /monitors
 * Handles form submissions to add a new monitored URL.
 */

import { createAction } from "remix/router";
import { requireDatabase } from "~/app/http/context";
import type { HttpMethod } from "~/database/schema";
import { createMonitor } from "~/app/services/monitor-service";
import routes from "~/routes/web";

export default createAction(routes.createMonitor, async (ctx) => {
	const db = requireDatabase(ctx);
	const formData = await ctx.request.formData();

	const name = formData.get("name")?.toString() || "Unnamed Monitor";
	const url = formData.get("url")?.toString() || "";
	const method = (formData.get("method")?.toString() || "HEAD") as HttpMethod;
	const expectedStatus = parseInt(formData.get("expected_status")?.toString() || "200", 10);
	const intervalSeconds = parseInt(formData.get("interval_seconds")?.toString() || "60", 10);
	const timeoutSeconds = parseInt(formData.get("timeout_seconds")?.toString() || "10", 10);
	const degradedAfterMs = parseInt(formData.get("degraded_after_ms")?.toString() || "3000", 10);

	if (!url) {
		return new Response("Target URL is required", { status: 400 });
	}

	await createMonitor(db, {
		name,
		url,
		method,
		expectedStatus,
		intervalSeconds,
		timeoutSeconds,
		degradedAfterMs,
	});

	const origin = new URL(ctx.request.url).origin;
	return Response.redirect(`${origin}/`, 303);
});
