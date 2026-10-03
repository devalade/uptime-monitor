/**
 * Admin access guard for the Uptime Monitor, backed by Cloudflare Access.
 *
 * Access sits in front of the Worker and signs a JWT for every request it lets through:
 * people who log in through Access, and MCP clients or schedulers that present an Access
 * service token. The Worker verifies that JWT itself as well, so requests that reach it
 * without going through Access (the workers.dev URL, a gap in the Access policy) are refused.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";
import { createRedirectResponse } from "remix/response/redirect";
import type { Middleware } from "remix/router";
import webRoutes from "~/routes/web";
import apiRoutes from "~/routes/api";

/**
 * The status page with its feed, badges and subscription links, the health check and heartbeat
 * pings are public. They all sit under /status and /api/health, the paths the public Access
 * application bypasses.
 */
const publicExactPaths = new Set([webRoutes.status.href(), apiRoutes.healthcheck.href()]);
const publicPathPrefixes = [`${webRoutes.status.href()}/`, `${apiRoutes.healthcheck.href()}/ping/`];

export function isPublicPath(pathname: string): boolean {
	return publicExactPaths.has(pathname) || publicPathPrefixes.some((prefix) => pathname.startsWith(prefix));
}

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export interface AccessSettings {
	/** Team domain, e.g. "myteam", "myteam.cloudflareaccess.com" or its https:// URL. */
	teamDomain: string;
	/** Application Audience (AUD) tag of the Access application protecting this Worker. */
	audience: string;
}

/** The REST API also accepts API keys (Authorization: Bearer um_…) instead of an Access token. */
const apiKeyPathPrefix = "/api/v1/";

export interface AdminAuthOptions {
	/** Without Access settings, localhost stays open for development and every other host is locked. */
	access?: AccessSettings;
	/** A custom domain that only serves the public pages; "/" there opens the status page. */
	statusHostname?: string;
	/** Checks a REST API key. */
	verifyApiKey?: (key: string) => Promise<boolean>;
}

/** One key set per team, cached across requests in this isolate. */
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function adminAuth(options: AdminAuthOptions): Middleware {
	return async (ctx, next) => {
		const url = ctx.url;

		if (options.statusHostname && url.hostname === options.statusHostname.toLowerCase()) {
			if (url.pathname === "/") return createRedirectResponse(`${url.origin}${webRoutes.status.href()}`, 302);
			return isPublicPath(url.pathname) ? next() : new Response("Not found", { status: 404 });
		}

		if (isPublicPath(url.pathname)) {
			return next();
		}

		const bearer = ctx.request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
		if (url.pathname.startsWith(apiKeyPathPrefix) && bearer && options.verifyApiKey) {
			return (await options.verifyApiKey(bearer))
				? next()
				: Response.json({ error: "Invalid or revoked API key" }, { status: 401 });
		}

		if (!options.access) {
			if (localHosts.has(url.hostname)) return next();
			return new Response(
				"Admin access is locked: set ACCESS_TEAM_DOMAIN and ACCESS_AUD to protect this Worker with Cloudflare Access.",
				{ status: 503 },
			);
		}

		const token = readAccessToken(ctx.request);
		if (token && (await isValidAccessToken(token, options.access))) {
			return next();
		}

		return new Response("Forbidden: sign in through Cloudflare Access.", { status: 403 });
	};
}

/** Access forwards the token as a header; browsers also carry it in the CF_Authorization cookie. */
function readAccessToken(request: Request): string | null {
	const header = request.headers.get("Cf-Access-Jwt-Assertion");
	if (header) return header;

	const cookie = request.headers.get("Cookie") ?? "";
	const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
	return match ? match[1] : null;
}

async function isValidAccessToken(token: string, access: AccessSettings): Promise<boolean> {
	const issuer = normalizeTeamDomain(access.teamDomain);
	let keySet = keySets.get(issuer);
	if (!keySet) {
		keySet = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
		keySets.set(issuer, keySet);
	}

	try {
		await jwtVerify(token, keySet, { issuer, audience: access.audience });
		return true;
	} catch {
		return false;
	}
}

function normalizeTeamDomain(teamDomain: string): string {
	const host = teamDomain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
	return `https://${host.includes(".") ? host : `${host}.cloudflareaccess.com`}`;
}
