/**
 * Post/redirect/get helper: send the user back to the page they submitted from,
 * but only when that page is on this site.
 */

export function redirectBack(request: Request, fallbackPath: string): Response {
	const origin = new URL(request.url).origin;
	const referer = request.headers.get("Referer");
	const target = referer && new URL(referer, origin).origin === origin ? referer : `${origin}${fallbackPath}`;
	return Response.redirect(target, 303);
}
