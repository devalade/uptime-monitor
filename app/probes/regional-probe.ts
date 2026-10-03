/**
 * Durable Object that runs one probe from the region it lives in.
 * Holds no state: it exists so a check can be made from a chosen place.
 */

import { DurableObject } from "cloudflare:workers";
import { runProbe, type CheckOutcome, type ProbeRequest } from "~/app/services/checker";

export class RegionalProbe extends DurableObject {
	async probe(request: ProbeRequest): Promise<CheckOutcome> {
		return runProbe(request);
	}
}
