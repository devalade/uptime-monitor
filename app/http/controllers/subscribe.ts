/**
 * Subscribe controller for POST /status/subscribe
 * Starts an email subscription to the status page and sends the confirmation link.
 */

import { createRedirectResponse } from "remix/response/redirect";
import { createAction } from "remix/router";
import { isValidEmail, subscribe, subscriberMail } from "~/app/services/subscribers";
import routes from "~/routes/web";

export default createAction(routes.subscribe, async (ctx) => {
	const origin = ctx.url.origin;
	const back = (notice: string) => createRedirectResponse(`${routes.status.href()}?subscribe=${notice}#subscribe`, 303);

	const mail = subscriberMail(ctx.alerts, origin);
	if (!mail) return new Response("Email subscriptions are not available", { status: 404 });

	const form = await ctx.request.formData();
	// Bots fill every field, including this one hidden from people.
	if (form.get("website")) return back("sent");

	const email = form.get("email")?.toString().trim() ?? "";
	if (!isValidEmail(email)) return back("invalid");

	try {
		const result = await subscribe(ctx.db, mail, email);
		return back(result === "confirmation-sent" ? "sent" : result === "already-subscribed" ? "already" : "later");
	} catch {
		return back("later");
	}
});
