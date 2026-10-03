/**
 * Reports page: monthly uptime per monitor, downloadable as CSV and printable to PDF.
 */

import type { Handle } from "remix/component";
import { Layout } from "~/app/http/views/layout";
import { formatPercentage } from "~/app/http/views/ui";
import { currentMonth, shiftMonth, type MonthlyReport } from "~/app/services/reports";
import routes from "~/routes/web";

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
				<div class="page-header">
					<div>
						<h1 class="page-title">Uptime report: {report.label}</h1>
						<p class="page-subtitle">
							UTC month{isCurrent ? ", so far" : ""}. Checks during maintenance windows are left out. Downtime comes from incidents.
						</p>
					</div>
					<div class="no-print" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
						<a class="btn btn-secondary btn-sm" href={`${routes.reports.href()}?month=${previous}`}>
							← {previous}
						</a>
						{isCurrent ? null : (
							<a class="btn btn-secondary btn-sm" href={`${routes.reports.href()}?month=${next}`}>
								{next} →
							</a>
						)}
						<a class="btn btn-secondary btn-sm" href={`${routes.reportsCsv.href()}?month=${report.month}`}>
							Download CSV
						</a>
						<button type="button" class="btn btn-primary btn-sm" data-print>
							Print / save as PDF
						</button>
					</div>
				</div>

				<section class="stats-grid">
					<div class="stat-card">
						<div class="stat-label">Overall uptime</div>
						<div class="stat-value" style={`color: ${uptimeColor(report.overallUptime)};`}>
							{formatPercentage(report.overallUptime)}
						</div>
					</div>
					<div class="stat-card">
						<div class="stat-label">Incidents</div>
						<div class="stat-value">{report.rows.reduce((sum, r) => sum + r.incidents, 0)}</div>
					</div>
					<div class="stat-card">
						<div class="stat-label">Total downtime</div>
						<div class="stat-value">{minutes(report.rows.reduce((sum, r) => sum + r.downtimeMinutes, 0))}</div>
					</div>
				</section>

				<section class="card" style="padding: 0; overflow-x: auto;">
					<table class="data-table">
						<thead>
							<tr>
								<th>Monitor</th>
								<th>Uptime</th>
								<th>Checks</th>
								<th>Avg response</th>
								<th>Incidents</th>
								<th>Downtime</th>
								<th>Longest</th>
							</tr>
						</thead>
						<tbody>
							{report.rows.length === 0 ? (
								<tr>
									<td colSpan={7} style="text-align: center; padding: 2rem;" class="muted">
										No monitors yet.
									</td>
								</tr>
							) : (
								report.rows.map((r) => (
									<tr key={r.id}>
										<td>
											<a href={routes.monitor.href({ id: r.id })} style="color: var(--text-primary); font-weight: 600;">
												{r.name}
											</a>{" "}
											<span class="dim">{r.type}</span>
										</td>
										<td class="mono" style={`color: ${uptimeColor(r.uptimePercentage)}; font-weight: 600;`}>
											{formatPercentage(r.uptimePercentage)}
										</td>
										<td class="mono">{r.totalChecks.toLocaleString("en-US")}</td>
										<td class="mono">{r.avgResponseMs === null ? "—" : `${r.avgResponseMs}ms`}</td>
										<td class="mono">{r.incidents}</td>
										<td class="mono">{minutes(r.downtimeMinutes)}</td>
										<td class="mono">{r.incidents === 0 ? "—" : minutes(r.longestIncidentMinutes)}</td>
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
