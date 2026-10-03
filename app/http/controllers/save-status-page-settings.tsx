/**
 * Save Status Page Settings controller for POST /settings/status-page
 */

import { createRedirectResponse } from "remix/response/redirect";
import { createAction } from "remix/router";
import { loadSettingsPage } from "~/app/http/pages";
import { parseStatusPageSettings, readStatusPageForm, saveStatusPageSettings } from "~/app/services/settings";
import routes from "~/routes/web";

export default createAction(routes.saveStatusPageSettings, async (ctx) => {
	const values = readStatusPageForm(await ctx.request.formData());
	const input = parseStatusPageSettings(values);

	if (!input.ok) {
		const page = await loadSettingsPage(ctx.db, ctx.url, ctx.alerts, { brandingForm: { values, errors: input.errors } });
		return ctx.render(page, { status: 400 });
	}

	await saveStatusPageSettings(ctx.db, input.value);
	return createRedirectResponse(`${routes.settings.href()}?saved=1`, 303);
});
