/**
 * Confirm Subscription controller for GET /status/subscribe/confirm/:token
 */

import { createRedirectResponse } from "remix/response/redirect";
import { createAction } from "remix/router";
import { confirmSubscription } from "~/app/services/subscribers";
import routes from "~/routes/web";

export default createAction(routes.confirmSubscription, async (ctx) => {
	const confirmed = await confirmSubscription(ctx.db, ctx.params.token);
	return createRedirectResponse(`${routes.status.href()}?subscribe=${confirmed ? "confirmed" : "unknown"}`, 303);
});
