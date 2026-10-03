/**
 * Data loading shared by controllers that render the same page, e.g. a page shown normally
 * and re-shown with a rejected form.
 */

import type { AppDatabase } from "~/app/contracts/database";
import type { ChannelOption } from "~/app/http/views/monitor-form-dialog";
import type { MonitorFormState } from "~/app/http/views/monitor-form-dialog";
import { renderMonitorDetailView } from "~/app/http/views/monitor-detail-view";
import { loadAlertChannels, type AlertSettings } from "~/app/services/alerting";
import { getMonitorWithHistory } from "~/app/services/monitor-service";
import { getUptimeReport } from "~/app/services/uptime-stats";
import apiRoutes from "~/routes/api";

export async function loadChannelOptions(db: AppDatabase, alerts?: AlertSettings): Promise<ChannelOption[]> {
	return (await loadAlertChannels(db, alerts)).map((channel) => ({ id: channel.id, name: channel.name }));
}

export function heartbeatPingUrl(request: Request, token: string): string {
	return `${new URL(request.url).origin}${apiRoutes.heartbeatPing.href({ token })}`;
}

/** The monitor detail page as HTML, or null when the monitor does not exist. */
export async function renderMonitorDetailPage(
	db: AppDatabase,
	request: Request,
	id: string,
	options: { alerts?: AlertSettings; editForm?: MonitorFormState } = {},
): Promise<string | null> {
	const data = await getMonitorWithHistory(db, id);
	if (!data) return null;

	const [uptime, channels] = await Promise.all([getUptimeReport(db, id), loadChannelOptions(db, options.alerts)]);
	return renderMonitorDetailView({
		data,
		uptime,
		channels,
		pingUrl: data.monitor.heartbeat_token ? heartbeatPingUrl(request, data.monitor.heartbeat_token) : undefined,
		editForm: options.editForm,
	});
}
