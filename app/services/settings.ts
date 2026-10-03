/**
 * App settings stored in the database, one row per key. Today: how the public status page looks.
 */

import { eq, inList } from "remix/data-table";
import type { AppDatabase } from "~/app/contracts/database";
import { settings } from "~/database/schema";

export interface StatusPageSettings {
	title: string;
	description: string;
	/** https URL of a logo image, or empty. */
	logoUrl: string;
	/** Hex colour for links and highlights, e.g. "#58a6ff". */
	accentColor: string;
	/** Where the logo links to, e.g. your website, or empty. */
	homepageUrl: string;
	/** Short text shown at the bottom of the page. */
	footer: string;
}

export const defaultStatusPageSettings: StatusPageSettings = {
	title: "System Status",
	description: "Live operational health & historical availability",
	logoUrl: "",
	accentColor: "#58a6ff",
	homepageUrl: "",
	footer: "",
};

const keys: Record<keyof StatusPageSettings, string> = {
	title: "status_page.title",
	description: "status_page.description",
	logoUrl: "status_page.logo_url",
	accentColor: "status_page.accent_color",
	homepageUrl: "status_page.homepage_url",
	footer: "status_page.footer",
};

export async function getStatusPageSettings(db: AppDatabase): Promise<StatusPageSettings> {
	const rows = await db.findMany(settings, { where: inList(settings.key, Object.values(keys)) });
	const values = new Map(rows.map((row) => [row.key, row.value]));
	const result = { ...defaultStatusPageSettings };
	for (const [field, key] of Object.entries(keys) as [keyof StatusPageSettings, string][]) {
		const value = values.get(key);
		if (value !== undefined) result[field] = value;
	}
	return result;
}

export async function saveStatusPageSettings(db: AppDatabase, values: StatusPageSettings): Promise<void> {
	const now = Date.now();
	for (const [field, key] of Object.entries(keys) as [keyof StatusPageSettings, string][]) {
		const existing = await db.findOne(settings, { where: eq(settings.key, key) });
		if (existing) await db.updateMany(settings, { value: values[field], updated_at: now }, { where: eq(settings.key, key) });
		else await db.create(settings, { key, value: values[field], updated_at: now });
	}
}

export type StatusPageFormErrors = Partial<Record<keyof StatusPageSettings, string>>;

export function readStatusPageForm(formData: FormData): StatusPageSettings {
	const read = (name: string) => formData.get(name)?.toString().trim() ?? "";
	return {
		title: read("title"),
		description: read("description"),
		logoUrl: read("logo_url"),
		accentColor: read("accent_color"),
		homepageUrl: read("homepage_url"),
		footer: read("footer"),
	};
}

export function parseStatusPageSettings(values: StatusPageSettings): { ok: true; value: StatusPageSettings } | { ok: false; errors: StatusPageFormErrors } {
	const errors: StatusPageFormErrors = {};
	const httpsUrl = (url: string) => {
		try {
			return new URL(url).protocol === "https:";
		} catch {
			return false;
		}
	};

	const title = values.title || defaultStatusPageSettings.title;
	if (title.length > 80) errors.title = "Title must be 80 characters or fewer.";
	if (values.description.length > 200) errors.description = "Description must be 200 characters or fewer.";
	if (values.logoUrl && !httpsUrl(values.logoUrl)) errors.logoUrl = "Use an https:// image URL.";
	const accentColor = values.accentColor || defaultStatusPageSettings.accentColor;
	if (!/^#[0-9a-fA-F]{6}$/.test(accentColor)) errors.accentColor = "Use a hex colour such as #58a6ff.";
	if (values.homepageUrl && !httpsUrl(values.homepageUrl)) errors.homepageUrl = "Use an https:// URL.";
	if (values.footer.length > 200) errors.footer = "Footer must be 200 characters or fewer.";

	if (Object.keys(errors).length > 0) return { ok: false, errors };
	return { ok: true, value: { ...values, title, accentColor: accentColor.toLowerCase() } };
}
