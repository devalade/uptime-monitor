import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
	executeHttpCheck,
	executeTcpCheck,
	matchesStatus,
	parseHeaderLines,
	parseJsonPath,
	parseStatusSpec,
	readJsonPath,
	type HttpCheckOptions,
} from "~/app/services/checker";
import { stubFetch } from "./helpers";

const base: HttpCheckOptions = {
	url: "https://api.test/health",
	method: "GET",
	expectedStatuses: "200",
	timeoutSeconds: 5,
	degradedAfterMs: 10_000,
};

describe("accepted status codes", () => {
	test("single codes, ranges and classes", () => {
		assert.deepEqual(parseStatusSpec("200"), [[200, 200]]);
		assert.deepEqual(parseStatusSpec("2xx, 301"), [
			[200, 299],
			[301, 301],
		]);
		assert.deepEqual(parseStatusSpec("200-204"), [[200, 204]]);
	});

	test("rejects anything else", () => {
		for (const spec of ["", "abc", "99", "600", "300-200", "6xx", "200,,foo"]) {
			assert.equal(parseStatusSpec(spec), null, spec);
		}
	});

	test("matching", () => {
		assert.ok(matchesStatus(204, "2xx"));
		assert.ok(matchesStatus(301, "200, 301-302"));
		assert.ok(!matchesStatus(404, "2xx,3xx"));
	});
});

describe("request headers", () => {
	test("parses one header per line, ignoring blank lines", () => {
		assert.deepEqual(parseHeaderLines("Authorization: Bearer abc\n\nX-Thing:  1 \n"), {
			ok: true,
			headers: { Authorization: "Bearer abc", "X-Thing": "1" },
		});
	});

	test("reports the first bad line", () => {
		assert.deepEqual(parseHeaderLines("Good: yes\nno colon here"), { ok: false, line: "no colon here" });
	});
});

describe("JSON path", () => {
	test("dot, index and quoted keys", () => {
		assert.deepEqual(parseJsonPath("$.data.items[0].state"), ["data", "items", "0", "state"]);
		assert.deepEqual(parseJsonPath('status["db ok"]'), ["status", "db ok"]);
		assert.equal(parseJsonPath("$..bad"), null);
	});

	test("reads nested values", () => {
		const json = { data: { items: [{ state: "ok" }] }, healthy: true };
		assert.equal(readJsonPath(json, "$.data.items[0].state"), "ok");
		assert.equal(readJsonPath(json, "healthy"), true);
		assert.equal(readJsonPath(json, "$.missing.deep"), undefined);
	});
});

describe("HTTP checks", () => {
	test("sends custom headers and a JSON body", async () => {
		const { probes } = stubFetch({ site: [() => new Response("ok")] });

		await executeHttpCheck({ ...base, method: "POST", headers: { Authorization: "Bearer t" }, body: '{"ping":true}' });

		assert.equal(probes[0].method, "POST");
		assert.equal(probes[0].headers.get("Authorization"), "Bearer t");
		assert.equal(probes[0].headers.get("Content-Type"), "application/json");
		assert.equal(probes[0].body, '{"ping":true}');
	});

	test("a status outside the accepted list fails", async () => {
		stubFetch({ site: [() => new Response("", { status: 302 })] });
		const outcome = await executeHttpCheck({ ...base, expectedStatuses: "2xx" });
		assert.equal(outcome.status, "down");
		assert.match(outcome.errorMessage ?? "", /Expected HTTP 2xx but received 302/);
	});

	test("keyword must be present", async () => {
		stubFetch({ site: [() => new Response("<h1>Maintenance</h1>")] });
		const outcome = await executeHttpCheck({ ...base, keyword: "All good" });
		assert.equal(outcome.status, "down");
		assert.match(outcome.errorMessage ?? "", /does not contain "All good"/);
	});

	test("keyword must be absent", async () => {
		stubFetch({ site: [() => new Response("Fatal error on line 3")] });
		const outcome = await executeHttpCheck({ ...base, keyword: "Fatal error", keywordMode: "not_contains" });
		assert.equal(outcome.status, "down");
		assert.match(outcome.errorMessage ?? "", /contains "Fatal error"/);
	});

	test("JSON value must match", async () => {
		stubFetch({ site: [() => Response.json({ status: "degraded" }), () => Response.json({ status: "ok", db: true })] });

		const failing = await executeHttpCheck({ ...base, jsonPath: "$.status", jsonExpected: "ok" });
		assert.equal(failing.status, "down");
		assert.match(failing.errorMessage ?? "", /\$\.status is degraded, expected ok/);

		const passing = await executeHttpCheck({ ...base, jsonPath: "$.db", jsonExpected: "true" });
		assert.equal(passing.status, "up");
	});

	test("JSON path that only has to exist, and a non-JSON body", async () => {
		stubFetch({ site: [() => Response.json({ version: "1.2" }), () => new Response("<html>")] });

		assert.equal((await executeHttpCheck({ ...base, jsonPath: "$.version" })).status, "up");
		const notJson = await executeHttpCheck({ ...base, jsonPath: "$.version" });
		assert.equal(notJson.status, "down");
		assert.match(notJson.errorMessage ?? "", /not valid JSON/);
	});
});

describe("TCP checks", () => {
	test("an open connection is up", async () => {
		let closed = false;
		const outcome = await executeTcpCheck({ host: "db.test", port: 5432, timeoutSeconds: 1, degradedAfterMs: 1000 }, async (address) => {
			assert.deepEqual(address, { hostname: "db.test", port: 5432 });
			return { opened: Promise.resolve(), close: async () => void (closed = true) };
		});
		assert.equal(outcome.status, "up");
		assert.equal(outcome.statusCode, null);
		assert.ok(closed, "the socket is closed after the check");
	});

	test("a refused connection is down", async () => {
		const outcome = await executeTcpCheck({ host: "db.test", port: 5432, timeoutSeconds: 1, degradedAfterMs: 1000 }, async () => ({
			opened: Promise.reject(new Error("connection refused")),
			close: async () => {},
		}));
		assert.equal(outcome.status, "down");
		assert.match(outcome.errorMessage ?? "", /Could not connect to db\.test:5432: connection refused/);
	});

	test("a connection that never opens times out", async () => {
		const outcome = await executeTcpCheck({ host: "db.test", port: 5432, timeoutSeconds: 1, degradedAfterMs: 1000 }, async () => ({
			opened: new Promise(() => {}),
			close: async () => {},
		}));
		assert.equal(outcome.status, "down");
		assert.match(outcome.errorMessage ?? "", /timed out after 1s/);
	});
});
