/**
 * HTML SSR Renderer for Remix 3 controllers following The Remix Way.
 * Converts JSX components or HTML templates into standard Response objects with proper headers.
 */

import { renderToString } from "remix/component/server";

export function createHtmlRenderer(_context?: any) {
	return async (view: any, init?: ResponseInit): Promise<Response> => {
		let htmlContent: string;
		if (typeof view === "string") {
			htmlContent = view;
		} else {
			htmlContent = await renderToString(view);
		}

		if (!htmlContent.startsWith("<!DOCTYPE html>")) {
			htmlContent = `<!DOCTYPE html>\n${htmlContent}`;
		}

		const headers = new Headers(init?.headers);
		if (!headers.has("Content-Type")) {
			headers.set("Content-Type", "text/html; charset=utf-8");
		}

		return new Response(htmlContent, {
			...init,
			headers,
		});
	};
}
