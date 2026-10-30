/**
 * Resolve the public base URL of this worker from an incoming request.
 *
 * Handles reverse proxies (X-Forwarded-Host) and local development, where
 * Wrangler rewrites the Host header but marks the connection as loopback.
 */
export interface RequestLike {
	url: string;
	header(name: string): string | undefined;
}

export function getBaseUrl(req: RequestLike): string {
	const url = new URL(req.url);

	const forwardedHost = req.header("X-Forwarded-Host");
	if (forwardedHost) {
		const proto =
			req.header("X-Forwarded-Proto") || url.protocol.replace(":", "");
		return `${proto}://${forwardedHost}`;
	}

	const cfConnectingIp = req.header("CF-Connecting-IP");
	const isLocalhost =
		cfConnectingIp === "::1" ||
		cfConnectingIp === "127.0.0.1" ||
		cfConnectingIp?.startsWith("127.");
	if (isLocalhost) {
		return `${url.protocol}//localhost:8787`;
	}

	return `${url.protocol}//${url.host}`;
}

/** The canonical MCP endpoint URL (RFC 8707 resource identifier). */
export function getMcpUrl(baseUrl: string): string {
	return `${baseUrl}/mcp`;
}

/** URL of the protected resource metadata document for the MCP endpoint. */
export function getResourceMetadataUrl(baseUrl: string): string {
	return `${baseUrl}/.well-known/oauth-protected-resource/mcp`;
}
