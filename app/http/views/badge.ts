/**
 * Shields-style SVG badges for READMEs and websites: current status or uptime of one monitor.
 */

import { html, type SafeHtml } from "remix/html-template";

const colors = {
	green: "#3fb950",
	yellow: "#d29922",
	red: "#f85149",
	blue: "#58a6ff",
	grey: "#6e7681",
} as const;

export type BadgeColor = keyof typeof colors;

/** Rough width of Verdana 11px text, which is what shields-style badges are drawn with. */
function textWidth(text: string): number {
	let width = 0;
	for (const char of text) width += /[ilI.,:;|!' ]/.test(char) ? 3.5 : /[mwMW%@]/.test(char) ? 10 : /[A-Z0-9]/.test(char) ? 7.5 : 6.5;
	return Math.ceil(width);
}

export function renderBadge(label: string, message: string, color: BadgeColor): SafeHtml {
	const labelWidth = textWidth(label) + 12;
	const messageWidth = textWidth(message) + 12;
	const width = labelWidth + messageWidth;
	const safeLabel = label;
	const safeMessage = message;

	return html`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${safeLabel}: ${safeMessage}">
<title>${safeLabel}: ${safeMessage}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)">
<rect width="${labelWidth}" height="20" fill="#555"/>
<rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${colors[color]}"/>
<rect width="${width}" height="20" fill="url(#s)"/>
</g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${safeLabel}</text>
<text x="${labelWidth / 2}" y="14">${safeLabel}</text>
<text x="${labelWidth + messageWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${safeMessage}</text>
<text x="${labelWidth + messageWidth / 2}" y="14">${safeMessage}</text>
</g>
</svg>`;
}

export function uptimeColor(percentage: number | null): BadgeColor {
	if (percentage === null) return "grey";
	if (percentage >= 99.5) return "green";
	if (percentage >= 97) return "yellow";
	return "red";
}
