/**
 * HTML SSR Renderer for Remix 3 controllers following The Remix Way.
 * Wraps the HTML string a view returns in a Response with the right headers.
 */

import type { RequestContext } from "remix/router";

export type HtmlRenderer = (html: string, init?: ResponseInit) => Promise<Response>;

export function createHtmlRenderer(_context: RequestContext<any, any>): HtmlRenderer {
	return async (html, init) => {
		const body = html.startsWith("<!DOCTYPE html>") ? html : `<!DOCTYPE html>\n${html}`;

		const headers = new Headers(init?.headers);
		if (!headers.has("Content-Type")) {
			headers.set("Content-Type", "text/html; charset=utf-8");
		}

		return new Response(body, {
			...init,
			headers,
		});
	};
}
