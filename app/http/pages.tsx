/**
 * Data loading shared by controllers that render the same page, e.g. a page shown normally
 * and re-shown with a rejected form.
 */

import type { RemixElement } from "remix/component";
import type { AppDatabase } from "~/app/contracts/database";
import type { ChannelOption, MonitorFormState } from "~/app/http/views/monitor-form-dialog";
import { MonitorDetailPage } from "~/app/http/views/monitor-detail-view";
import { SettingsPage } from "~/app/http/views/settings-view";
import { loadAlertChannels, type AlertSettings } from "~/app/services/alerting";
import { getMonitorWithHistory } from "~/app/services/monitor-service";
import { getUptimeReport } from "~/app/services/uptime-stats";
import { listApiKeys } from "~/app/services/api-keys";
import { getStatusPageSettings, type StatusPageFormErrors, type StatusPageSettings } from "~/app/services/settings";
import { countSubscribers, subscriberMail } from "~/app/services/subscribers";
import apiRoutes from "~/routes/api";

export async function loadChannelOptions(db: AppDatabase, alerts?: AlertSettings): Promise<ChannelOption[]> {
	return (await loadAlertChannels(db, alerts)).map((channel) => ({ id: channel.id, name: channel.name }));
}

export function heartbeatPingUrl(url: URL, token: string): string {
	return `${url.origin}${apiRoutes.heartbeatPing.href({ token })}`;
}

/** The monitor detail page, or null when the monitor does not exist. */
export async function loadMonitorDetailPage(
	db: AppDatabase,
	url: URL,
	id: string,
	options: { alerts?: AlertSettings; editForm?: MonitorFormState } = {},
): Promise<RemixElement | null> {
	const data = await getMonitorWithHistory(db, id);
	if (!data) return null;

	const [uptime, channels] = await Promise.all([getUptimeReport(db, id), loadChannelOptions(db, options.alerts)]);
	return (
		<MonitorDetailPage
			data={data}
			uptime={uptime}
			channels={channels}
			pingUrl={data.monitor.heartbeat_token ? heartbeatPingUrl(url, data.monitor.heartbeat_token) : undefined}
			editForm={options.editForm}
		/>
	);
}

export async function loadSettingsPage(
	db: AppDatabase,
	url: URL,
	alerts: AlertSettings | undefined,
	options: { brandingForm?: { values: StatusPageSettings; errors: StatusPageFormErrors }; newApiKey?: string } = {},
): Promise<RemixElement> {
	const [page, subscribers, apiKeys] = await Promise.all([getStatusPageSettings(db), countSubscribers(db), listApiKeys(db)]);
	return (
		<SettingsPage
			origin={url.origin}
			page={page}
			brandingForm={options.brandingForm}
			saved={url.searchParams.get("saved") === "1"}
			subscribers={{ enabled: subscriberMail(alerts, url.origin) !== null, ...subscribers }}
			apiKeys={apiKeys}
			newApiKey={options.newApiKey}
		/>
	);
}
