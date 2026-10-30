/**
 * OAuth client resolution and redirect URI validation.
 *
 * Three kinds of clients are recognised:
 *  - the built-in "setup" pseudo-client used by the /setup page
 *  - clients registered via Dynamic Client Registration (stored in KV)
 *  - Client ID Metadata Documents (client_id is an HTTPS URL pointing at a
 *    JSON document; see draft-ietf-oauth-client-id-metadata-document)
 */

export const SETUP_CLIENT_ID = "setup";

export type ClientSource = "setup" | "registered" | "metadata_document";

export interface ResolvedClient {
	clientId: string;
	clientName: string;
	clientUri?: string;
	redirectUris: string[];
	source: ClientSource;
}

export interface RegisteredClientRecord {
	client_id: string;
	client_name?: string;
	client_uri?: string;
	redirect_uris: string[];
	application_type?: string;
	created_at: string;
}

const CIMD_FETCH_TIMEOUT_MS = 5_000;
const CIMD_MAX_BYTES = 64 * 1024;
const CIMD_CACHE_TTL_SECONDS = 60 * 60;

type FetchLike = typeof fetch;

/** Setup page redirect for a given worker base URL. */
export function setupRedirectUri(baseUrl: string): string {
	return `${baseUrl}/setup`;
}

/**
 * A client_id is treated as a Client ID Metadata Document URL when it is an
 * absolute https URL with a non-empty path and no fragment.
 */
export function isClientIdMetadataUrl(clientId: string): boolean {
	let url: URL;
	try {
		url = new URL(clientId);
	} catch {
		return false;
	}
	return (
		url.protocol === "https:" &&
		url.pathname.length > 1 &&
		url.hash === "" &&
		url.username === ""
	);
}

function isLoopbackHost(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "[::1]" ||
		hostname === "::1"
	);
}

/**
 * Exact-match redirect URI comparison, with the RFC 8252 §7.3 allowance that
 * loopback redirect URIs may use any port.
 */
export function isRedirectUriAllowed(
	redirectUri: string,
	allowed: string[],
): boolean {
	if (allowed.includes(redirectUri)) return true;

	let presented: URL;
	try {
		presented = new URL(redirectUri);
	} catch {
		return false;
	}
	if (presented.protocol !== "http:" || !isLoopbackHost(presented.hostname))
		return false;

	return allowed.some((candidate) => {
		let registered: URL;
		try {
			registered = new URL(candidate);
		} catch {
			return false;
		}
		return (
			registered.protocol === "http:" &&
			isLoopbackHost(registered.hostname) &&
			registered.hostname === presented.hostname &&
			registered.pathname === presented.pathname &&
			registered.search === presented.search
		);
	});
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every((v) => typeof v === "string" && v.length > 0)
	);
}

function isAbsoluteUrl(value: string): boolean {
	try {
		new URL(value);
		return true;
	} catch {
		return false;
	}
}

/** Validate redirect URIs supplied at registration time. */
export function validateRedirectUris(value: unknown): string[] | null {
	if (!isStringArray(value)) return null;
	if (!value.every(isAbsoluteUrl)) return null;
	return value;
}

interface ClientMetadataDocument {
	client_id: string;
	client_name?: string;
	client_uri?: string;
	redirect_uris: string[];
}

async function fetchClientMetadataDocument(
	clientId: string,
	fetchFn: FetchLike,
): Promise<ClientMetadataDocument | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), CIMD_FETCH_TIMEOUT_MS);
	try {
		const response = await fetchFn(clientId, {
			method: "GET",
			headers: { Accept: "application/json" },
			redirect: "error",
			signal: controller.signal,
		});
		if (!response.ok) return null;

		const text = await response.text();
		if (text.length > CIMD_MAX_BYTES) return null;

		const doc = JSON.parse(text) as Partial<ClientMetadataDocument>;
		if (!doc || typeof doc !== "object") return null;
		if (doc.client_id !== clientId) return null;
		if (!isStringArray(doc.redirect_uris)) return null;
		if (doc.client_name !== undefined && typeof doc.client_name !== "string")
			return null;
		if (doc.client_uri !== undefined && typeof doc.client_uri !== "string")
			return null;

		return {
			client_id: doc.client_id,
			client_name: doc.client_name,
			client_uri: doc.client_uri,
			redirect_uris: doc.redirect_uris,
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

function displayNameFromUrl(clientId: string): string {
	try {
		return new URL(clientId).hostname;
	} catch {
		return clientId;
	}
}

/**
 * Resolve a client_id to its registered metadata, or null when unknown.
 */
export async function resolveClient(
	kv: KVNamespace,
	clientId: string,
	baseUrl: string,
	fetchFn: FetchLike = fetch,
): Promise<ResolvedClient | null> {
	if (clientId === SETUP_CLIENT_ID) {
		return {
			clientId,
			clientName: "Hevy MCP Server setup",
			redirectUris: [setupRedirectUri(baseUrl)],
			source: "setup",
		};
	}

	const registered = await kv.get<RegisteredClientRecord>(
		`client:${clientId}`,
		"json",
	);
	if (registered && Array.isArray(registered.redirect_uris)) {
		return {
			clientId,
			clientName: registered.client_name || "Unnamed MCP client",
			clientUri: registered.client_uri,
			redirectUris: registered.redirect_uris,
			source: "registered",
		};
	}

	if (isClientIdMetadataUrl(clientId)) {
		const cacheKey = `cimd:${clientId}`;
		let doc = await kv.get<ClientMetadataDocument>(cacheKey, "json");
		if (!doc) {
			doc = await fetchClientMetadataDocument(clientId, fetchFn);
			if (doc) {
				await kv.put(cacheKey, JSON.stringify(doc), {
					expirationTtl: CIMD_CACHE_TTL_SECONDS,
				});
			}
		}
		if (doc) {
			return {
				clientId,
				clientName: doc.client_name || displayNameFromUrl(clientId),
				clientUri: doc.client_uri,
				redirectUris: doc.redirect_uris,
				source: "metadata_document",
			};
		}
	}

	return null;
}
