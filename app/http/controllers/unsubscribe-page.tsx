/**
 * Unsubscribe page controller for GET /status/unsubscribe/:token
 * Shows a button; mail clients that open links to scan them must not unsubscribe anyone.
 */

import { createAction } from "remix/router";
import { getStatusPageSettings } from "~/app/services/settings";
import { UnsubscribePage } from "~/app/http/views/status-page-view";
import routes from "~/routes/web";

export default createAction(routes.unsubscribePage, async (ctx) => {
	return ctx.render(<UnsubscribePage page={await getStatusPageSettings(ctx.db)} token={ctx.params.token} />);
});
