/**
 * Reads the TLS certificate a server actually serves, to warn before it expires.
 *
 * Workers' node:tls does not implement getPeerCertificate(), so this opens a raw TCP socket and
 * starts a TLS 1.2 handshake: in TLS 1.2 the server sends its certificate in the clear, right
 * after ServerHello. The handshake is abandoned once the certificate has been read. Servers that
 * only speak TLS 1.3 encrypt the certificate, so for them the expiry date stays unknown.
 */

const HANDSHAKE_TIMEOUT_MS = 8000;
const MAX_HANDSHAKE_BYTES = 64 * 1024;

export interface CertificateInfo {
	notBefore: number;
	notAfter: number;
	subject: string | null;
	issuer: string | null;
}

export interface RawSocket {
	readable: ReadableStream<Uint8Array>;
	writable: WritableStream<Uint8Array>;
	close(): Promise<void>;
}

export type SocketConnector = (address: { hostname: string; port: number }) => Promise<RawSocket>;

async function connectWithCloudflareSockets(address: { hostname: string; port: number }): Promise<RawSocket> {
	const { connect } = await import("cloudflare:sockets");
	return connect(address);
}

export class CertificateError extends Error {}

/**
 * Returns the leaf certificate `host` serves on `port`.
 * Throws CertificateError with a readable reason when it cannot be read.
 */
export async function fetchServerCertificate(
	host: string,
	port = 443,
	connectSocket: SocketConnector = connectWithCloudflareSockets,
): Promise<CertificateInfo> {
	const socket = await connectSocket({ hostname: host, port });
	const timer = setTimeout(() => socket.close().catch(() => {}), HANDSHAKE_TIMEOUT_MS);
	try {
		const writer = socket.writable.getWriter();
		await writer.write(buildClientHello(host));
		writer.releaseLock();
		const der = await readLeafCertificate(socket.readable);
		return parseCertificate(der);
	} catch (error) {
		if (error instanceof CertificateError) throw error;
		throw new CertificateError(error instanceof Error ? error.message : String(error));
	} finally {
		clearTimeout(timer);
		socket.close().catch(() => {});
	}
}

/* ---------- TLS ---------- */

const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];

export function buildClientHello(host: string): Uint8Array {
	const name = new TextEncoder().encode(host);
	const extension = (type: number, data: number[]) => [...u16(type), ...u16(data.length), ...data];
	// ECDHE suites first; old RSA ones last for servers that need them.
	const suites = [0xc02b, 0xc02f, 0xc02c, 0xc030, 0xcca9, 0xcca8, 0xc009, 0xc013, 0xc00a, 0xc014, 0x009c, 0x009d, 0x002f, 0x0035];
	const signatureAlgorithms = [0x0403, 0x0503, 0x0603, 0x0804, 0x0805, 0x0806, 0x0401, 0x0501, 0x0601, 0x0201];
	const extensions = [
		...extension(0x0000, [...u16(name.length + 3), 0, ...u16(name.length), ...name]), // server_name
		...extension(0x000a, [...u16(6), ...u16(0x001d), ...u16(0x0017), ...u16(0x0018)]), // supported_groups
		...extension(0x000b, [1, 0]), // ec_point_formats
		...extension(0x000d, [...u16(signatureAlgorithms.length * 2), ...signatureAlgorithms.flatMap(u16)]),
	];
	const body = [
		3, 3, // TLS 1.2
		...crypto.getRandomValues(new Uint8Array(32)),
		0, // no session id
		...u16(suites.length * 2),
		...suites.flatMap(u16),
		1, 0, // null compression
		...u16(extensions.length),
		...extensions,
	];
	const handshake = [1, (body.length >> 16) & 0xff, ...u16(body.length & 0xffff), ...body];
	return new Uint8Array([22, 3, 1, ...u16(handshake.length), ...handshake]);
}

const alertDescriptions: Record<number, string> = {
	40: "handshake failure",
	70: "protocol version not supported",
	71: "insufficient security",
	112: "unrecognized name",
};

/** Reads TLS records until the Certificate handshake message, and returns its first certificate. */
async function readLeafCertificate(readable: ReadableStream<Uint8Array>): Promise<Uint8Array> {
	const reader = readable.getReader();
	let records: Uint8Array = new Uint8Array(0);
	let handshake: Uint8Array = new Uint8Array(0);

	try {
		while (handshake.length < MAX_HANDSHAKE_BYTES) {
			const { value, done } = await reader.read();
			if (done) throw new CertificateError("The server closed the connection during the TLS handshake");
			records = concat(records, value);

			while (records.length >= 5) {
				const length = (records[3] << 8) | records[4];
				if (records.length < 5 + length) break;
				const contentType = records[0];
				const fragment = records.subarray(5, 5 + length);
				records = records.slice(5 + length);

				if (contentType === 21) {
					const description = alertDescriptions[fragment[1]] ?? `alert ${fragment[1]}`;
					throw new CertificateError(
						fragment[1] === 70 || fragment[1] === 40
							? "The server only accepts TLS 1.3, so its certificate cannot be read"
							: `The server refused the TLS handshake (${description})`,
					);
				}
				if (contentType === 22) handshake = concat(handshake, fragment);
			}

			let offset = 0;
			while (offset + 4 <= handshake.length) {
				const type = handshake[offset];
				const length = (handshake[offset + 1] << 16) | (handshake[offset + 2] << 8) | handshake[offset + 3];
				if (offset + 4 + length > handshake.length) break;
				if (type === 11) {
					const message = handshake.subarray(offset + 4, offset + 4 + length);
					// certificate_list length (3 bytes), then the first certificate's length (3 bytes) and DER
					const first = (message[3] << 16) | (message[4] << 8) | message[5];
					return message.slice(6, 6 + first);
				}
				offset += 4 + length;
			}
		}
		throw new CertificateError("The server sent no certificate");
	} finally {
		reader.releaseLock();
	}
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
	const out = new Uint8Array(a.length + b.length);
	out.set(a);
	out.set(b, a.length);
	return out;
}

/* ---------- X.509 ---------- */

interface Node {
	tag: number;
	/** Content bytes. */
	value: Uint8Array;
	/** Offset just past this node. */
	end: number;
}

function readNode(bytes: Uint8Array, offset: number): Node {
	const tag = bytes[offset];
	let length = bytes[offset + 1];
	let start = offset + 2;
	if (length & 0x80) {
		const count = length & 0x7f;
		length = 0;
		for (let i = 0; i < count; i++) length = (length << 8) | bytes[start + i];
		start += count;
	}
	if (start + length > bytes.length) throw new CertificateError("The certificate is malformed");
	return { tag, value: bytes.subarray(start, start + length), end: start + length };
}

function children(node: Node): Node[] {
	const nodes: Node[] = [];
	let offset = 0;
	while (offset < node.value.length) {
		const child = readNode(node.value, offset);
		nodes.push(child);
		offset = child.end;
	}
	return nodes;
}

export function parseCertificate(der: Uint8Array): CertificateInfo {
	const certificate = readNode(der, 0);
	const [tbs] = children(certificate);
	if (!tbs) throw new CertificateError("The certificate is malformed");
	const fields = children(tbs);
	// An explicit version ([0]) shifts the fields by one.
	const base = fields[0]?.tag === 0xa0 ? 1 : 0;
	const issuer = fields[base + 2];
	const validity = fields[base + 3];
	const subject = fields[base + 4];
	if (!issuer || !validity || !subject) throw new CertificateError("The certificate is malformed");

	const [notBefore, notAfter] = children(validity).map(parseTime);
	return { notBefore, notAfter, subject: readName(subject), issuer: readName(issuer) };
}

function parseTime(node: Node): number {
	const text = new TextDecoder().decode(node.value);
	// UTCTime YYMMDDHHMMSSZ or GeneralizedTime YYYYMMDDHHMMSSZ
	const match = node.tag === 0x17 ? text.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/) : text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
	if (!match) throw new CertificateError("The certificate has an unreadable date");
	let year = Number(match[1]);
	if (node.tag === 0x17) year += year < 50 ? 2000 : 1900;
	return Date.UTC(year, Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
}

const COMMON_NAME = "2.5.4.3";
const ORGANIZATION = "2.5.4.10";

/** The common name, else the organization, of an X.509 Name. */
function readName(name: Node): string | null {
	const values = new Map<string, string>();
	for (const set of children(name)) {
		for (const attribute of children(set)) {
			const [oid, value] = children(attribute);
			if (oid?.tag === 0x06 && value) values.set(decodeOid(oid.value), new TextDecoder().decode(value.value));
		}
	}
	return values.get(COMMON_NAME) ?? values.get(ORGANIZATION) ?? null;
}

function decodeOid(bytes: Uint8Array): string {
	const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
	let value = 0;
	for (const byte of bytes.subarray(1)) {
		value = (value << 7) | (byte & 0x7f);
		if (!(byte & 0x80)) {
			parts.push(value);
			value = 0;
		}
	}
	return parts.join(".");
}
