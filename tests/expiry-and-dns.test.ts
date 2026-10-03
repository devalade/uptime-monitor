import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildClientHello, CertificateError, fetchServerCertificate, parseCertificate, type RawSocket } from "~/app/services/certificate";
import { fetchDomainExpiry, readExpiration, registrableDomainCandidates } from "~/app/services/domain-expiry";
import { checkCertificate, dueMilestone, runExpiryChecks, type ExpiryLookups } from "~/app/services/expiry";
import { executeDnsCheck } from "~/app/services/checker";
import { getMonitorById } from "~/app/services/monitor-service";
import type { AlertSettings } from "~/app/services/alerting";
import { addMonitor, createTestDatabase, stubFetch } from "./helpers";

const DER = Uint8Array.from(Buffer.from(readFileSync(new URL("./fixtures/test-certificate.der.b64", import.meta.url), "utf8"), "base64"));
const DAY = 24 * 60 * 60 * 1000;
const WEBHOOK = "https://hooks.example.test/alerts";
const alerts: AlertSettings = { webhookUrl: WEBHOOK };

/** A fake socket that answers the ClientHello with the given TLS records, split into small chunks. */
function fakeServer(records: Uint8Array, chunkSize = 100): { socket: RawSocket; sent: Uint8Array[] } {
	const sent: Uint8Array[] = [];
	const socket: RawSocket = {
		readable: new ReadableStream({
			start(controller) {
				for (let i = 0; i < records.length; i += chunkSize) controller.enqueue(records.slice(i, i + chunkSize));
				controller.close();
			},
		}),
		writable: new WritableStream({ write: (chunk) => void sent.push(chunk) }),
		close: async () => {},
	};
	return { socket, sent };
}

function record(type: number, body: number[]): number[] {
	return [type, 3, 3, (body.length >> 8) & 0xff, body.length & 0xff, ...body];
}

function handshake(type: number, body: number[]): number[] {
	return [type, (body.length >> 16) & 0xff, (body.length >> 8) & 0xff, body.length & 0xff, ...body];
}

function serverFlight(der: Uint8Array): Uint8Array {
	const serverHello = handshake(2, [3, 3, ...new Array(32).fill(1), 0, 0xc0, 0x2f, 0]);
	const certEntry = [(der.length >> 16) & 0xff, (der.length >> 8) & 0xff, der.length & 0xff, ...der];
	const certificate = handshake(11, [(certEntry.length >> 16) & 0xff, (certEntry.length >> 8) & 0xff, certEntry.length & 0xff, ...certEntry]);
	const messages = [...serverHello, ...certificate];
	// Split the handshake messages across two records, like real servers do.
	const half = Math.floor(messages.length / 2);
	return new Uint8Array([...record(22, messages.slice(0, half)), ...record(22, messages.slice(half))]);
}

describe("reading the served certificate", () => {
	test("parses dates, subject and issuer from DER", () => {
		const info = parseCertificate(DER);
		assert.equal(new Date(info.notAfter).toISOString(), "2026-11-02T14:34:36.000Z");
		assert.equal(new Date(info.notBefore).toISOString(), "2026-10-03T14:34:36.000Z");
		assert.equal(info.subject, "test.example");
		assert.equal(info.issuer, "test.example");
	});

	test("sends a TLS 1.2 ClientHello with the server name and reads the certificate across records", async () => {
		const { socket, sent } = fakeServer(serverFlight(DER), 37);
		const info = await fetchServerCertificate("test.example", 443, async (address) => {
			assert.deepEqual(address, { hostname: "test.example", port: 443 });
			return socket;
		});
		assert.equal(new Date(info.notAfter).toISOString(), "2026-11-02T14:34:36.000Z");

		const hello = sent[0];
		assert.equal(hello[0], 22, "a handshake record");
		assert.deepEqual([hello[9], hello[10]], [3, 3], "TLS 1.2");
		assert.ok(Buffer.from(hello).includes(Buffer.from("test.example")), "SNI carries the host");
	});

	test("a TLS 1.3-only server is reported clearly", async () => {
		const { socket } = fakeServer(new Uint8Array(record(21, [2, 70])));
		await assert.rejects(fetchServerCertificate("modern.example", 443, async () => socket), (error: unknown) => {
			assert.ok(error instanceof CertificateError);
			assert.match(error.message, /only accepts TLS 1\.3/);
			return true;
		});
	});

	test("ClientHello lengths are consistent", () => {
		const hello = buildClientHello("a.example");
		assert.equal((hello[3] << 8) | hello[4], hello.length - 5);
		assert.equal((hello[6] << 16) | (hello[7] << 8) | hello[8], hello.length - 9);
	});
});

describe("domain expiry", () => {
	test("registrable domain candidates", () => {
		assert.deepEqual(registrableDomainCandidates("api.shop.example.com"), ["example.com", "shop.example.com"]);
		assert.deepEqual(registrableDomainCandidates("example.co.uk"), ["co.uk", "example.co.uk"]);
		assert.deepEqual(registrableDomainCandidates("10.0.0.1"), []);
		assert.deepEqual(registrableDomainCandidates("localhost"), []);
	});

	test("reads the expiration event", () => {
		assert.equal(readExpiration({ events: [{ eventAction: "registration", eventDate: "2000-01-01T00:00:00Z" }, { eventAction: "expiration", eventDate: "2027-05-01T00:00:00Z" }] }), Date.UTC(2027, 4, 1));
		assert.equal(readExpiration({ events: [] }), null);
	});

	test("falls back to the longer candidate when the registry does not know the short one", async () => {
		const { probes } = stubFetch({
			site: [
				() => new Response("not found", { status: 404 }),
				() => Response.json({ events: [{ eventAction: "expiration", eventDate: "2027-01-15T00:00:00Z" }] }),
			],
		});
		const result = await fetchDomainExpiry("www.example.co.uk");
		assert.deepEqual(result, { domain: "example.co.uk", expiresAt: Date.UTC(2027, 0, 15) });
		assert.deepEqual(probes.map((p) => p.url), ["https://rdap.org/domain/co.uk", "https://rdap.org/domain/example.co.uk"]);
	});
});

describe("expiry milestones", () => {
	test("alert once per milestone, more often as the date gets close", () => {
		assert.equal(dueMilestone(20, 14, null), null);
		assert.equal(dueMilestone(14, 14, null), 14);
		assert.equal(dueMilestone(10, 14, 14), null, "already warned at 14");
		assert.equal(dueMilestone(6, 14, 14), 7);
		assert.equal(dueMilestone(2, 14, 7), 3);
		assert.equal(dueMilestone(0, 14, 1), 0);
		assert.equal(dueMilestone(-3, 14, null), 0, "expired");
		assert.equal(dueMilestone(-3, 14, 0), null);
		assert.equal(dueMilestone(5, 0, null), null, "off");
	});

	function lookups(notAfter: number): ExpiryLookups & { set(next: number): void } {
		let current = notAfter;
		return {
			set: (next) => void (current = next),
			certificate: async () => ({ notBefore: current - 90 * DAY, notAfter: current, subject: "api.test", issuer: "Test CA" }),
			domain: async () => null,
		};
	}

	test("warns when the certificate is inside the warning period, and says when it was renewed", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db, { url: "https://api.test/health", expiryWarningDays: 14 });
		const { webhooks } = stubFetch({ webhookUrl: WEBHOOK });
		const now = Date.now();
		const fake = lookups(now + 10 * DAY + 3600_000);

		let current = await checkCertificate(db, alerts, monitor, now, fake);
		assert.equal(current.cert_warned_days, 14);
		assert.equal(current.cert_issuer, "Test CA");
		assert.equal(JSON.parse(webhooks[0].body).event, "monitor.certificate_expiring");
		assert.match(JSON.parse(webhooks[0].body).reason, /expires in 10 days/);

		current = await checkCertificate(db, alerts, current, now + DAY, fake);
		assert.equal(webhooks.length, 1, "no repeat inside the same milestone");

		fake.set(now + 90 * DAY);
		current = await checkCertificate(db, alerts, current, now + 2 * DAY, fake);
		assert.equal(current.cert_warned_days, null);
		assert.equal(JSON.parse(webhooks[1].body).event, "monitor.certificate_renewed");
	});

	test("an unreadable certificate is recorded, not alerted", async () => {
		const db = await createTestDatabase();
		const monitor = await addMonitor(db, { url: "https://api.test/" });
		const { webhooks } = stubFetch({ webhookUrl: WEBHOOK });
		const updated = await checkCertificate(db, alerts, monitor, Date.now(), {
			certificate: async () => {
				throw new CertificateError("The server only accepts TLS 1.3, so its certificate cannot be read");
			},
			domain: async () => null,
		});
		assert.match(updated.cert_error ?? "", /TLS 1\.3/);
		assert.equal(webhooks.length, 0);
	});

	test("the hourly run only looks at enabled HTTPS monitors with warnings on", async () => {
		const db = await createTestDatabase();
		const https = await addMonitor(db, { name: "https", url: "https://a.test/" });
		await addMonitor(db, { name: "http", url: "http://b.test/" });
		await addMonitor(db, { name: "off", url: "https://c.test/", expiryWarningDays: 0 });
		await addMonitor(db, { name: "tcp", type: "tcp", url: "c.test:443" });
		const hosts: string[] = [];

		await runExpiryChecks(db, undefined, Date.now(), {
			certificate: async (host) => {
				hosts.push(host);
				return { notBefore: 0, notAfter: Date.now() + 200 * DAY, subject: null, issuer: null };
			},
			domain: async () => ({ domain: "a.test", expiresAt: Date.now() + 300 * DAY }),
		});

		assert.deepEqual(hosts, ["a.test"]);
		const checked = await getMonitorById(db, https.id);
		assert.ok(checked?.cert_expires_at);
		assert.ok(checked?.domain_expires_at);
	});
});

describe("DNS checks", () => {
	const dns = (body: unknown) => () => Response.json(body);
	const options = { host: "example.com", recordType: "A" as const, expected: null, timeoutSeconds: 5, degradedAfterMs: 10_000 };

	test("passes when the record resolves and contains the expected values", async () => {
		const { probes } = stubFetch({ site: [dns({ Status: 0, Answer: [{ type: 1, data: "93.184.215.14" }, { type: 1, data: "93.184.215.15" }] })] });
		const outcome = await executeDnsCheck({ ...options, expected: "93.184.215.14" });
		assert.equal(outcome.status, "up");
		assert.equal(probes[0].url, "https://cloudflare-dns.com/dns-query?name=example.com&type=A");
		assert.equal(probes[0].headers.get("Accept"), "application/dns-json");
	});

	test("fails when an expected value is missing", async () => {
		stubFetch({ site: [dns({ Status: 0, Answer: [{ type: 1, data: "10.0.0.1" }] })] });
		const outcome = await executeDnsCheck({ ...options, expected: "93.184.215.14" });
		assert.equal(outcome.status, "down");
		assert.match(outcome.errorMessage ?? "", /A for example\.com is 10\.0\.0\.1; missing 93\.184\.215\.14/);
	});

	test("NXDOMAIN and empty answers fail", async () => {
		stubFetch({ site: [dns({ Status: 3 }), dns({ Status: 0, Answer: [{ type: 5, data: "other.example." }] })] });
		assert.match((await executeDnsCheck(options)).errorMessage ?? "", /does not exist \(NXDOMAIN\)/);
		assert.match((await executeDnsCheck(options)).errorMessage ?? "", /has no A record/);
	});

	test("MX priorities, trailing dots, case and TXT quotes are ignored", async () => {
		stubFetch({
			site: [
				dns({ Status: 0, Answer: [{ type: 15, data: "10 MX1.Example.com." }] }),
				dns({ Status: 0, Answer: [{ type: 16, data: '"v=spf1 include:_spf.example.com ~all"' }] }),
			],
		});
		assert.equal((await executeDnsCheck({ ...options, recordType: "MX", expected: "mx1.example.com" })).status, "up");
		assert.equal((await executeDnsCheck({ ...options, recordType: "TXT", expected: "v=spf1 include:_spf.example.com ~all" })).status, "up");
	});
});
