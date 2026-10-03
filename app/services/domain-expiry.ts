/**
 * Domain registration expiry through RDAP, the registries' JSON successor to WHOIS.
 * rdap.org redirects each query to the registry responsible for the TLD.
 */

const RDAP_TIMEOUT_MS = 8000;

/**
 * Candidates for the registered domain of a hostname, most likely first: "a.b.example.com"
 * gives "example.com" then "b.example.com" (for suffixes like co.uk).
 */
export function registrableDomainCandidates(hostname: string): string[] {
	const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
	if (labels.length < 2 || /^\d+$/.test(labels[labels.length - 1]) || hostname.includes(":")) return [];
	const candidates = [labels.slice(-2).join(".")];
	if (labels.length >= 3) candidates.push(labels.slice(-3).join("."));
	return candidates;
}

/**
 * When the domain behind `hostname` expires, or null when the registry does not publish it
 * (some ccTLDs have no RDAP service).
 */
export async function fetchDomainExpiry(hostname: string): Promise<{ domain: string; expiresAt: number } | null> {
	for (const domain of registrableDomainCandidates(hostname)) {
		const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
			// rdap.org refuses requests without a User-Agent.
			headers: { Accept: "application/rdap+json, application/json", "User-Agent": "RemixUptimeMonitor/1.0" },
			signal: AbortSignal.timeout(RDAP_TIMEOUT_MS),
		});
		if (response.status === 404) {
			await response.body?.cancel();
			continue;
		}
		if (!response.ok) {
			await response.body?.cancel();
			throw new Error(`The registry lookup failed with HTTP ${response.status}`);
		}

		const expiresAt = readExpiration(await response.json());
		return expiresAt === null ? null : { domain, expiresAt };
	}
	return null;
}

export function readExpiration(rdap: unknown): number | null {
	const events = (rdap as { events?: { eventAction?: string; eventDate?: string }[] } | null)?.events;
	const expiration = events?.find((event) => event.eventAction === "expiration")?.eventDate;
	const time = expiration ? Date.parse(expiration) : NaN;
	return Number.isNaN(time) ? null : time;
}
