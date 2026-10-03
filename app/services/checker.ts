/**
 * Probe engine for uptime checks: HTTP(S) requests with response assertions, TCP connects and
 * DNS lookups. Pure Web APIs (fetch, AbortSignal.timeout, cloudflare:sockets), so the same code
 * runs in the Worker and in the regional probe Durable Objects.
 */

import type { DnsRecordType, HttpMethod, KeywordMode, MonitorStatus } from "~/database/schema";

/** Response bodies are only read when an assertion needs them, and never past this size. */
const MAX_BODY_BYTES = 1024 * 1024;

const USER_AGENT = "RemixUptimeMonitor/1.0 (+https://sergiodxa.com/articles/the-remix-way)";

export interface HttpCheckOptions {
	url: string;
	method: HttpMethod;
	/** Accepted status codes, e.g. "200", "2xx" or "200-299, 301". */
	expectedStatuses: string;
	timeoutSeconds: number;
	degradedAfterMs: number;
	headers?: Record<string, string>;
	body?: string | null;
	keyword?: string | null;
	keywordMode?: KeywordMode;
	jsonPath?: string | null;
	jsonExpected?: string | null;
}

export interface TcpCheckOptions {
	host: string;
	port: number;
	timeoutSeconds: number;
	degradedAfterMs: number;
}

export interface DnsCheckOptions {
	host: string;
	recordType: DnsRecordType;
	/** Comma-separated values the answer must contain; null accepts any answer. */
	expected: string | null;
	timeoutSeconds: number;
	degradedAfterMs: number;
}

/** A probe that can be sent to another location and run there. */
export type ProbeRequest =
	| ({ type: "http" } & HttpCheckOptions)
	| ({ type: "tcp" } & TcpCheckOptions)
	| ({ type: "dns" } & DnsCheckOptions);

export interface CheckOutcome {
	status: MonitorStatus;
	statusCode: number | null;
	responseTimeMs: number;
	errorMessage?: string;
}

export function runProbe(request: ProbeRequest): Promise<CheckOutcome> {
	if (request.type === "tcp") return executeTcpCheck(request);
	if (request.type === "dns") return executeDnsCheck(request);
	return executeHttpCheck(request);
}

/**
 * Runs a single HTTP probe: status first, then body assertions, then the slow threshold.
 */
export async function executeHttpCheck(options: HttpCheckOptions): Promise<CheckOutcome> {
	const startTime = performance.now();
	const timeoutMs = Math.max(1, options.timeoutSeconds) * 1000;
	const signal = AbortSignal.timeout(timeoutMs);

	try {
		const headers = new Headers({ "User-Agent": USER_AGENT, Accept: "*/*" });
		for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
		const body = options.body && options.method !== "GET" && options.method !== "HEAD" ? options.body : undefined;
		if (body && !headers.has("Content-Type")) {
			headers.set("Content-Type", looksLikeJson(body) ? "application/json" : "text/plain; charset=utf-8");
		}

		const response = await fetch(options.url, { method: options.method, signal, headers, body, redirect: "follow" });

		const responseTimeMs = Math.round(performance.now() - startTime);
		const statusCode = response.status;
		const down = (errorMessage: string): CheckOutcome => ({ status: "down", statusCode, responseTimeMs, errorMessage });

		if (!matchesStatus(statusCode, options.expectedStatuses)) {
			await response.body?.cancel();
			return down(`Expected HTTP ${options.expectedStatuses} but received ${statusCode}`);
		}

		const failedAssertion = await checkAssertions(response, options);
		if (failedAssertion) return down(failedAssertion);

		if (responseTimeMs >= options.degradedAfterMs) {
			return {
				status: "degraded",
				statusCode,
				responseTimeMs,
				errorMessage: `Response time ${responseTimeMs}ms exceeded threshold of ${options.degradedAfterMs}ms`,
			};
		}

		return { status: "up", statusCode, responseTimeMs };
	} catch (error) {
		return failedOutcome(error, startTime, options.timeoutSeconds);
	}
}

/** Returns why the body failed an assertion, or null when it passed (or none is set). */
async function checkAssertions(response: Response, options: HttpCheckOptions): Promise<string | null> {
	if (!options.keyword && !options.jsonPath) {
		await response.body?.cancel();
		return null;
	}

	const text = await readBodyText(response);

	if (options.keyword) {
		const found = text.includes(options.keyword);
		if (options.keywordMode === "not_contains" && found) return `Response contains "${options.keyword}"`;
		if (options.keywordMode !== "not_contains" && !found) return `Response does not contain "${options.keyword}"`;
	}

	if (options.jsonPath) {
		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch {
			return `Response is not valid JSON, so ${options.jsonPath} could not be read`;
		}
		const actual = readJsonPath(json, options.jsonPath);
		if (actual === undefined) return `${options.jsonPath} is missing from the response`;
		const expected = options.jsonExpected ?? "";
		if (expected !== "" && formatJsonValue(actual) !== expected) {
			return `${options.jsonPath} is ${truncate(formatJsonValue(actual), 80)}, expected ${expected}`;
		}
	}

	return null;
}

/**
 * Opens a TCP connection to host:port and closes it again. Connecting is the whole check.
 * `connectSocket` is injectable because `cloudflare:sockets` only exists inside workerd.
 */
export async function executeTcpCheck(
	options: TcpCheckOptions,
	connectSocket: (address: { hostname: string; port: number }) => Promise<TcpSocket> = connectWithCloudflareSockets,
): Promise<CheckOutcome> {
	const startTime = performance.now();
	const timeoutMs = Math.max(1, options.timeoutSeconds) * 1000;
	let socket: TcpSocket | undefined;

	try {
		socket = await withTimeout(connectSocket({ hostname: options.host, port: options.port }), timeoutMs);
		await withTimeout(socket.opened, timeoutMs);
		const responseTimeMs = Math.round(performance.now() - startTime);

		if (responseTimeMs >= options.degradedAfterMs) {
			return {
				status: "degraded",
				statusCode: null,
				responseTimeMs,
				errorMessage: `Connection took ${responseTimeMs}ms, over the threshold of ${options.degradedAfterMs}ms`,
			};
		}
		return { status: "up", statusCode: null, responseTimeMs };
	} catch (error) {
		return failedOutcome(error, startTime, options.timeoutSeconds, `Could not connect to ${options.host}:${options.port}`);
	} finally {
		socket?.close().catch(() => {});
	}
}

export interface TcpSocket {
	opened: Promise<unknown>;
	close(): Promise<void>;
}

async function connectWithCloudflareSockets(address: { hostname: string; port: number }): Promise<TcpSocket> {
	const { connect } = await import("cloudflare:sockets");
	return connect(address);
}

function failedOutcome(error: unknown, startTime: number, timeoutSeconds: number, prefix?: string): CheckOutcome {
	const responseTimeMs = Math.round(performance.now() - startTime);
	const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
	const detail = isTimeout
		? `Request timed out after ${timeoutSeconds}s`
		: error instanceof Error
			? error.message
			: "Unknown network error";

	return {
		status: "down",
		statusCode: null,
		responseTimeMs,
		errorMessage: prefix && !isTimeout ? `${prefix}: ${detail}` : detail,
	};
}

function withTimeout<value>(promise: Promise<value>, timeoutMs: number): Promise<value> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new DOMException("Timed out", "TimeoutError")), timeoutMs);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function readBodyText(response: Response): Promise<string> {
	if (!response.body) return "";
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (size < MAX_BODY_BYTES) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		size += value.byteLength;
	}
	await reader.cancel().catch(() => {});
	const bytes = new Uint8Array(Math.min(size, MAX_BODY_BYTES));
	let offset = 0;
	for (const chunk of chunks) {
		const part = chunk.subarray(0, bytes.length - offset);
		bytes.set(part, offset);
		offset += part.length;
	}
	return new TextDecoder().decode(bytes);
}

/* ---------- DNS ---------- */

const DNS_RESOLVER = "https://cloudflare-dns.com/dns-query";

const dnsTypeNumbers: Record<DnsRecordType, number> = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 };

const dnsStatusNames: Record<number, string> = {
	1: "the query was malformed (FORMERR)",
	2: "the DNS server failed (SERVFAIL)",
	3: "the name does not exist (NXDOMAIN)",
	5: "the query was refused (REFUSED)",
};

/**
 * Resolves a record through DNS over HTTPS. Passes when the name resolves to at least one record
 * of the type and the answer contains every expected value.
 */
export async function executeDnsCheck(options: DnsCheckOptions): Promise<CheckOutcome> {
	const startTime = performance.now();
	try {
		const url = `${DNS_RESOLVER}?name=${encodeURIComponent(options.host)}&type=${options.recordType}`;
		const response = await fetch(url, {
			headers: { Accept: "application/dns-json" },
			signal: AbortSignal.timeout(Math.max(1, options.timeoutSeconds) * 1000),
		});
		const responseTimeMs = Math.round(performance.now() - startTime);
		const down = (errorMessage: string): CheckOutcome => ({ status: "down", statusCode: null, responseTimeMs, errorMessage });

		if (!response.ok) {
			await response.body?.cancel();
			return down(`The DNS resolver answered HTTP ${response.status}`);
		}
		const result = (await response.json()) as { Status?: number; Answer?: { type: number; data: string }[] };
		if (result.Status !== 0) {
			return down(`Resolving ${options.host}: ${dnsStatusNames[result.Status ?? -1] ?? `DNS status ${result.Status}`}`);
		}

		const answers = (result.Answer ?? []).filter((a) => a.type === dnsTypeNumbers[options.recordType]).map((a) => normalizeDnsValue(a.data));
		if (answers.length === 0) return down(`${options.host} has no ${options.recordType} record`);

		const missing = parseDnsExpected(options.expected).filter((value) => !answers.some((answer) => dnsValueMatches(answer, value)));
		if (missing.length > 0) {
			return down(`${options.recordType} for ${options.host} is ${truncate(answers.join(", "), 120)}; missing ${missing.join(", ")}`);
		}

		if (responseTimeMs >= options.degradedAfterMs) {
			return {
				status: "degraded",
				statusCode: null,
				responseTimeMs,
				errorMessage: `DNS lookup took ${responseTimeMs}ms, over the threshold of ${options.degradedAfterMs}ms`,
			};
		}
		return { status: "up", statusCode: null, responseTimeMs };
	} catch (error) {
		return failedOutcome(error, startTime, options.timeoutSeconds, `Could not resolve ${options.host}`);
	}
}

export function parseDnsExpected(expected: string | null): string[] {
	return (expected ?? "").split(",").map(normalizeDnsValue).filter(Boolean);
}

/** Lower case, no trailing dot, TXT quotes removed. */
function normalizeDnsValue(value: string): string {
	return value
		.trim()
		.replace(/^"|"$/g, "")
		.replace(/"\s+"/g, "")
		.replace(/\.$/, "")
		.toLowerCase();
}

/** MX answers carry a priority ("10 mx.example.com"); the host alone matches too. */
function dnsValueMatches(answer: string, expected: string): boolean {
	return answer === expected || answer.endsWith(` ${expected}`);
}

/* ---------- Accepted status codes ---------- */

type StatusRange = readonly [min: number, max: number];

/**
 * Parses "200", "2xx", "200-299, 301" into ranges. Returns null when any part is invalid.
 */
export function parseStatusSpec(spec: string): StatusRange[] | null {
	const parts = spec.split(",").map((part) => part.trim()).filter(Boolean);
	if (parts.length === 0) return null;

	const ranges: StatusRange[] = [];
	for (const part of parts) {
		const range = parseStatusPart(part.toLowerCase());
		if (!range) return null;
		ranges.push(range);
	}
	return ranges;
}

function parseStatusPart(part: string): StatusRange | null {
	const valid = (code: number) => Number.isInteger(code) && code >= 100 && code <= 599;

	const statusClass = part.match(/^([1-5])xx$/);
	if (statusClass) {
		const base = Number(statusClass[1]) * 100;
		return [base, base + 99];
	}

	const range = part.match(/^(\d{3})\s*-\s*(\d{3})$/);
	if (range) {
		const [min, max] = [Number(range[1]), Number(range[2])];
		return valid(min) && valid(max) && min <= max ? [min, max] : null;
	}

	if (/^\d{3}$/.test(part)) {
		const code = Number(part);
		return valid(code) ? [code, code] : null;
	}

	return null;
}

export function matchesStatus(statusCode: number, spec: string): boolean {
	const ranges = parseStatusSpec(spec) ?? [[200, 200]];
	return ranges.some(([min, max]) => statusCode >= min && statusCode <= max);
}

/* ---------- Request headers ---------- */

/**
 * Parses one "Name: value" header per line. Returns the headers, or the first line that is wrong.
 */
export function parseHeaderLines(text: string): { ok: true; headers: Record<string, string> } | { ok: false; line: string } {
	const headers: Record<string, string> = {};
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;
		const colon = line.indexOf(":");
		const name = colon > 0 ? line.slice(0, colon).trim() : "";
		if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) return { ok: false, line };
		headers[name] = line.slice(colon + 1).trim();
	}
	return { ok: true, headers };
}

/* ---------- JSON path ---------- */

/**
 * Splits "$.data.items[0].status" or "data.items.0.status" into keys. Returns null when malformed.
 */
export function parseJsonPath(path: string): string[] | null {
	const trimmed = path.trim().replace(/^\$/, "");
	if (trimmed === "") return [];

	const keys: string[] = [];
	const token = /\.([^.[\]]+)|\[(\d+)\]|\["([^"]*)"\]|^([^.[\]]+)/y;
	let index = 0;
	while (index < trimmed.length) {
		token.lastIndex = index;
		const match = token.exec(trimmed);
		if (!match) return null;
		keys.push(match[1] ?? match[2] ?? match[3] ?? match[4]);
		index = token.lastIndex;
	}
	return keys;
}

export function readJsonPath(value: unknown, path: string): unknown {
	const keys = parseJsonPath(path);
	if (!keys) return undefined;

	let current: unknown = value;
	for (const key of keys) {
		if (current === null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

/** Strings compare as-is; everything else as JSON, so `true`, `1` and `null` can be expected. */
function formatJsonValue(value: unknown): string {
	return typeof value === "string" ? value : JSON.stringify(value);
}

function looksLikeJson(body: string): boolean {
	const first = body.trimStart()[0];
	return first === "{" || first === "[";
}

function truncate(text: string, length: number): string {
	return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
