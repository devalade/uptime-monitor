/**
 * Reports page: monthly uptime per monitor, downloadable as CSV and printable to PDF.
 */

import { css, type Handle } from "remix/component";
import { Layout } from "~/app/http/views/layout";
import {
	pageHeader,
	pageTitle,
	pageSubtitle,
	cardFlush,
	dim,
	button,
	statsGrid,
	statCard,
	statLabel,
	statValue,
	dataTable,
	tableRow,
	tableHead,
	tableCell,
	tableCellPlainMono,
	tableCellMonoBold,
	tableCellEmpty,
} from "~/app/http/views/styles";
import { formatPercentage } from "~/app/http/views/ui";
import { currentMonth, shiftMonth, type MonthlyReport } from "~/app/services/reports";
import routes from "~/routes/web";

const reportActions = css({ display: "flex", gap: "0.5rem", flexWrap: "wrap", "@media print": { display: "none" } });
const monitorLink = css({ color: "var(--text-primary)", fontWeight: "600" });

const minutes = (value: number) => (value < 60 ? `${value}m` : `${Math.floor(value / 60)}h ${value % 60}m`);
const uptimeColor = (value: number | null) =>
	value === null ? "var(--text-muted)" : value >= 99.9 ? "var(--up)" : value >= 99 ? "var(--degraded)" : "var(--down)";

export function ReportsPage(handle: Handle<{ report: MonthlyReport }>) {
	return () => {
		const report = handle.props.report;
		const previous = shiftMonth(report.month, -1);
		const next = shiftMonth(report.month, 1);
		const isCurrent = report.month === currentMonth();

		return (
			<Layout title={`Report ${report.month}`} currentPath={routes.reports.href()}>
				<div mix={pageHeader}>
					<div>
						<h1 mix={pageTitle}>Uptime report: {report.label}</h1>
						<p mix={pageSubtitle}>
							UTC month{isCurrent ? ", so far" : ""}. Checks during maintenance windows are left out. Downtime comes from incidents.
						</p>
					</div>
					<div mix={reportActions}>
						<a mix={button.secondarySmall} href={`${routes.reports.href()}?month=${previous}`}>
							← {previous}
						</a>
						{isCurrent ? null : (
							<a mix={button.secondarySmall} href={`${routes.reports.href()}?month=${next}`}>
								{next} →
							</a>
						)}
						<a mix={button.secondarySmall} href={`${routes.reportsCsv.href()}?month=${report.month}`}>
							Download CSV
						</a>
						<button type="button" mix={button.primarySmall} data-print>
							Print / save as PDF
						</button>
					</div>
				</div>

				<section mix={statsGrid}>
					<div mix={statCard}>
						<div mix={statLabel}>Overall uptime</div>
						<div mix={statValue} style={{ color: uptimeColor(report.overallUptime) }}>
							{formatPercentage(report.overallUptime)}
						</div>
					</div>
					<div mix={statCard}>
						<div mix={statLabel}>Incidents</div>
						<div mix={statValue}>{report.rows.reduce((sum, r) => sum + r.incidents, 0)}</div>
					</div>
					<div mix={statCard}>
						<div mix={statLabel}>Total downtime</div>
						<div mix={statValue}>{minutes(report.rows.reduce((sum, r) => sum + r.downtimeMinutes, 0))}</div>
					</div>
				</section>

				<section mix={cardFlush}>
					<table mix={dataTable}>
						<thead>
							<tr>
								<th mix={tableHead}>Monitor</th>
								<th mix={tableHead}>Uptime</th>
								<th mix={tableHead}>Checks</th>
								<th mix={tableHead}>Avg response</th>
								<th mix={tableHead}>Incidents</th>
								<th mix={tableHead}>Downtime</th>
								<th mix={tableHead}>Longest</th>
							</tr>
						</thead>
						<tbody>
							{report.rows.length === 0 ? (
								<tr>
									<td colSpan={7} mix={tableCellEmpty}>
										No monitors yet.
									</td>
								</tr>
							) : (
								report.rows.map((r) => (
									<tr key={r.id} mix={tableRow}>
										<td mix={tableCell}>
											<a href={routes.monitor.href({ id: r.id })} mix={monitorLink}>
												{r.name}
											</a>{" "}
											<span mix={dim}>{r.type}</span>
										</td>
										<td mix={tableCellMonoBold} style={{ color: uptimeColor(r.uptimePercentage) }}>
											{formatPercentage(r.uptimePercentage)}
										</td>
										<td mix={tableCellPlainMono}>{r.totalChecks.toLocaleString("en-US")}</td>
										<td mix={tableCellPlainMono}>{r.avgResponseMs === null ? "—" : `${r.avgResponseMs}ms`}</td>
										<td mix={tableCellPlainMono}>{r.incidents}</td>
										<td mix={tableCellPlainMono}>{minutes(r.downtimeMinutes)}</td>
										<td mix={tableCellPlainMono}>{r.incidents === 0 ? "—" : minutes(r.longestIncidentMinutes)}</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</section>
			</Layout>
		);
	};
}
