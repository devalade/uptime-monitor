/**
 * Email Transport contract for the Uptime Monitor.
 * Uses CloudflareTransport in production when an EMAIL binding exists,
 * otherwise falls back to MemoryTransport for local development and testing.
 */

import { CloudflareTransport } from "@sdxc/mail/cloudflare";
import { MemoryTransport } from "@sdxc/mail/memory";

export type Transport = CloudflareTransport | MemoryTransport;

export function createMailTransport(emailBinding?: SendEmail): Transport {
	if (emailBinding) {
		return new CloudflareTransport(emailBinding);
	}
	return new MemoryTransport();
}
