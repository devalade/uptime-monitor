/**
 * JSON helpers for the REST API controllers.
 */

export function apiError(status: number, error: string, details?: unknown): Response {
	return Response.json(details === undefined ? { error } : { error, details }, { status });
}

/** Reads a JSON object body, or null when the body is not a JSON object. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const body: unknown = await request.json();
		return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}
