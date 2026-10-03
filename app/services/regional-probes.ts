/**
 * Regional probes: when a check fails here, the failure is re-checked from other Cloudflare
 * regions before anyone is paged. Each region is a Durable Object pinned there with a
 * location hint, running the same probe code as the Worker.
 */

import type { CheckOutcome, ProbeRequest } from "~/app/services/checker";

/** Durable Object location hints and how they are shown. */
export const regionLabels: Record<string, string> = {
	wnam: "Western North America",
	enam: "Eastern North America",
	sam: "South America",
	weur: "Western Europe",
	eeur: "Eastern Europe",
	apac: "Asia-Pacific",
	oc: "Oceania",
	afr: "Africa",
	me: "Middle East",
};

export const DEFAULT_PROBE_REGIONS = ["enam", "weur", "apac"];

export interface RegionalProbes {
	regions: string[];
	run(region: string, request: ProbeRequest): Promise<CheckOutcome>;
}

/** The slice of a Durable Object namespace this module needs, so tests can fake it. */
export interface ProbeNamespace {
	idFromName(name: string): DurableObjectId;
	get(id: DurableObjectId, options?: { locationHint?: DurableObjectLocationHint }): {
		probe(request: ProbeRequest): Promise<CheckOutcome>;
	};
}

export function createRegionalProbes(namespace: ProbeNamespace, regions: string[] = DEFAULT_PROBE_REGIONS): RegionalProbes {
	return {
		regions,
		run(region, request) {
			// The hint only applies when the object is first created; the name keeps it in that region.
			const stub = namespace.get(namespace.idFromName(`probe-${region}`), {
				locationHint: region as DurableObjectLocationHint,
			});
			return stub.probe(request);
		},
	};
}

/** Reads PROBE_REGIONS ("enam,weur,apac"), keeping only known location hints. */
export function parseProbeRegions(raw: string | undefined): string[] {
	if (!raw) return DEFAULT_PROBE_REGIONS;
	const regions = raw
		.split(",")
		.map((region) => region.trim().toLowerCase())
		.filter((region) => region in regionLabels);
	return regions.length > 0 ? [...new Set(regions)] : DEFAULT_PROBE_REGIONS;
}

export function regionLabel(region: string): string {
	return regionLabels[region] ?? region;
}
