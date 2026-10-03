/**
 * Admin access guard for the Uptime Monitor, backed by Cloudflare Access.
 *
 * Access sits in front of the Worker and signs a JWT for every request it lets through:
 * people who log in through Access, and MCP clients or schedulers that present an Access
 * service token. The Worker verifies that JWT itself as well, so requests that reach it
 * without going through Access (the workers.dev URL, a gap in the Access policy) are refused.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Middleware } from "remix/router";
import webRoutes from "~/routes/web";
import apiRoutes from "~/routes/api";

/**
 * The status page with its feed and badges, the health check and heartbeat pings are public.
 * They all sit under /status and /api/health, the paths the public Access application bypasses.
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

export interface AdminAuthOptions {
	/** Without Access settings, localhost stays open for development and every other host is locked. */
	access?: AccessSettings;
}

/** One key set per team, cached across requests in this isolate. */
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function adminAuth(options: AdminAuthOptions): Middleware {
	return async (ctx, next) => {
		const url = new URL(ctx.request.url);
		if (isPublicPath(url.pathname)) {
			return next();
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
