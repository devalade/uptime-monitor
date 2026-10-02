/**
 * Monitor Detail controller for GET /monitors/:id
 * Shows monitor latency graphs, recent checks, and incident history.
 */

import { createAction } from "remix/router";
import { requireDatabase } from "~/app/http/context";
import { getMonitorWithHistory } from "~/app/services/monitor-service";
import { renderMonitorDetailView } from "~/app/http/views/monitor-detail-view";
import routes from "~/routes/web";

export default createAction(routes.monitor, async (ctx) => {
	const db = requireDatabase(ctx);
	const id = (ctx as any).params?.id;

	if (!id) {
		return new Response("Monitor ID required", { status: 400 });
	}

	const data = await getMonitorWithHistory(db, id);
	if (!data) {
		return new Response("Monitor not found", { status: 404 });
	}

	const html = renderMonitorDetailView(data);
	return (ctx as any).render(html);
});
