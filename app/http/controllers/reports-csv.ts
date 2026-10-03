/**
 * Reports CSV controller for GET /reports.csv?month=YYYY-MM
 */

import { createAction } from "remix/router";
import { currentMonth, getMonthlyReport, reportToCsv } from "~/app/services/reports";
import routes from "~/routes/web";

export default createAction(routes.reportsCsv, async (ctx) => {
	const month = ctx.url.searchParams.get("month") ?? currentMonth();
	const report = await getMonthlyReport(ctx.db, month);
	if (!report) return new Response("Use ?month=YYYY-MM", { status: 400 });

	return new Response(reportToCsv(report), {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="uptime-report-${report.month}.csv"`,
		},
	});
});
