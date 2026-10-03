/**
 * Create API Key controller for POST /settings/api-keys
 * Renders the settings page with the new key, which is shown only this once.
 */

import { createAction } from "remix/router";
import { loadSettingsPage } from "~/app/http/pages";
import { createApiKey } from "~/app/services/api-keys";
import routes from "~/routes/web";

export default createAction(routes.createApiKey, async (ctx) => {
	const name = (await ctx.request.formData()).get("name")?.toString().slice(0, 60) ?? "";
	const { key } = await createApiKey(ctx.db, name);
	const page = await loadSettingsPage(ctx.db, ctx.url, ctx.alerts, { newApiKey: key });
	return ctx.render(page, { headers: { "Cache-Control": "no-store" } });
});
