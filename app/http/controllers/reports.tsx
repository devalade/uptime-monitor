/**
 * Reports controller for GET /reports?month=YYYY-MM
 * Monthly uptime report per monitor; prints to PDF from the browser.
 */

import { createAction } from "remix/router";
import { currentMonth, getMonthlyReport } from "~/app/services/reports";
import { ReportsPage } from "~/app/http/views/reports-view";
import routes from "~/routes/web";

export default createAction(routes.reports, async (ctx) => {
	const requested = ctx.url.searchParams.get("month") ?? currentMonth();
	const report = (await getMonthlyReport(ctx.db, requested)) ?? (await getMonthlyReport(ctx.db, currentMonth()));
	if (!report) return new Response("Report unavailable", { status: 500 });
	return ctx.render(<ReportsPage report={report} />);
});
