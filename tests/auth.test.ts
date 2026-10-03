import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { adminAuth } from "~/app/http/auth";

const ISSUER = "https://myteam.cloudflareaccess.com";
const AUD = "aud-123";

let privateKey: CryptoKey;
let otherKey: CryptoKey;

before(async () => {
	const pair = await generateKeyPair("RS256");
	privateKey = pair.privateKey;
	otherKey = (await generateKeyPair("RS256")).privateKey;
	const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };

	const original = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input instanceof Request ? input.url : input);
		if (url === `${ISSUER}/cdn-cgi/access/certs`) return Response.json({ keys: [jwk] });
		return original(input, init);
	}) as typeof fetch;
});

function sign(claims: { iss?: string; aud?: string; exp?: string; key?: CryptoKey } = {}) {
	return new SignJWT({ email: "admin@example.com" })
		.setProtectedHeader({ alg: "RS256", kid: "k1" })
		.setIssuer(claims.iss ?? ISSUER)
		.setAudience(claims.aud ?? AUD)
		.setIssuedAt()
		.setExpirationTime(claims.exp ?? "5m")
		.sign(claims.key ?? privateKey);
}

const guarded = adminAuth({ access: { teamDomain: "myteam", audience: AUD } });
const unconfigured = adminAuth({});

async function status(middleware: ReturnType<typeof adminAuth>, url: string, headers: Record<string, string> = {}) {
	const response = await middleware({ request: new Request(url, { headers }) }, async () => new Response("ok"));
	return response.status;
}

const asToken = async (token: Promise<string> | string) => ({ "Cf-Access-Jwt-Assertion": await token });

describe("Cloudflare Access guard", () => {
	test("public pages need no token", async () => {
		assert.equal(await status(guarded, "https://up.test/status"), 200);
		assert.equal(await status(guarded, "https://up.test/api/health"), 200);
	});

	test("admin pages need a token", async () => {
		assert.equal(await status(guarded, "https://up.test/"), 403);
	});

	test("a valid token in the header or the CF_Authorization cookie is accepted", async () => {
		assert.equal(await status(guarded, "https://up.test/", await asToken(sign())), 200);
		assert.equal(await status(guarded, "https://up.test/", { Cookie: `a=b; CF_Authorization=${await sign()}` }), 200);
	});

	for (const [name, token] of [
		["wrong audience", () => sign({ aud: "another-app" })],
		["wrong issuer", () => sign({ iss: "https://evil.cloudflareaccess.com" })],
		["expired", () => sign({ exp: "-1m" })],
		["signed by another key", () => sign({ key: otherKey })],
		["malformed", async () => "abc.def.ghi"],
	] as const) {
		test(`rejects a token that is ${name}`, async () => {
			assert.equal(await status(guarded, "https://up.test/", await asToken(token())), 403);
		});
	}

	test("without Access settings only localhost is open", async () => {
		assert.equal(await status(unconfigured, "http://localhost:5173/"), 200);
		assert.equal(await status(unconfigured, "https://up.test/"), 503);
	});
});
