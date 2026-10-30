import { createMiddleware } from "hono/factory";
import type { Props } from "../utils.js";
import { getBaseUrl, getResourceMetadataUrl } from "../lib/base-url.js";

interface Env {
	OAUTH_KV: KVNamespace;
}

interface Variables {
	props: Props;
}

const REQUIRED_SCOPE = "mcp";

/**
 * Bearer token authentication middleware for the MCP endpoints.
 *
 * On failure it returns 401 with a WWW-Authenticate challenge that points at
 * the protected resource metadata (RFC 9728 §5.1), which is how MCP clients
 * discover the authorization server.
 */
export const bearerAuth = createMiddleware<{
	Bindings: Env;
	Variables: Variables;
}>(async (c, next) => {
	const baseUrl = getBaseUrl(c.req);
	const resourceMetadata = getResourceMetadataUrl(baseUrl);

	const authHeader = c.req.header("Authorization");
	const match = authHeader?.match(/^Bearer\s+(\S+)$/i);

	if (!match) {
		// RFC 6750 §3.1: no error code when the request carried no credentials.
		return c.json(
			{
				error: "unauthorized",
				message:
					"Authentication required. Provide an OAuth access token as a Bearer token.",
			},
			401,
			{
				"WWW-Authenticate": `Bearer realm="${baseUrl}", resource_metadata="${resourceMetadata}", scope="${REQUIRED_SCOPE}"`,
			},
		);
	}

	const token = match[1];
	const sessionData = await c.env.OAUTH_KV.get(`session:${token}`, "json");

	if (!sessionData || typeof sessionData !== "object") {
		return c.json(
			{
				error: "unauthorized",
				message: "Invalid or expired token.",
			},
			401,
			{
				"WWW-Authenticate": `Bearer realm="${baseUrl}", error="invalid_token", error_description="The access token is invalid or has expired", resource_metadata="${resourceMetadata}", scope="${REQUIRED_SCOPE}"`,
			},
		);
	}

	c.set("props", sessionData as Props);
	await next();
});
