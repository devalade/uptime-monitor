/**
 * Unsubscribe controller for POST /status/unsubscribe/:token
 */

import { createRedirectResponse } from "remix/response/redirect";
import { createAction } from "remix/router";
import { unsubscribe } from "~/app/services/subscribers";
import routes from "~/routes/web";

export default createAction(routes.unsubscribe, async (ctx) => {
	const removed = await unsubscribe(ctx.db, ctx.params.token);
	return createRedirectResponse(`${routes.status.href()}?subscribe=${removed ? "unsubscribed" : "unknown"}`, 303);
});
