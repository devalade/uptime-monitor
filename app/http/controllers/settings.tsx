/**
 * Settings controller for GET /settings
 * Status page branding, custom domain, email subscribers and REST API keys.
 */

import { createAction } from "remix/router";
import { loadSettingsPage } from "~/app/http/pages";
import routes from "~/routes/web";

export default createAction(routes.settings, async (ctx) => {
	return ctx.render(await loadSettingsPage(ctx.db, ctx.url, ctx.alerts));
});
