/**
 * Revoke API Key controller for POST /settings/api-keys/:id/revoke
 */

import { createRedirectResponse } from "remix/response/redirect";
import { createAction } from "remix/router";
import { revokeApiKey } from "~/app/services/api-keys";
import routes from "~/routes/web";

export default createAction(routes.revokeApiKey, async (ctx) => {
	await revokeApiKey(ctx.db, ctx.params.id);
	return createRedirectResponse(routes.settings.href(), 303);
});
