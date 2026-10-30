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

function isIdentity(value: unknown): value is Props & Record<string, unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { login?: unknown }).login === "string"
	);
}

/** Bearer tokens minted by /token (identity only). */
const TOKEN_PREFIX = "token:";
/**
 * Before 3.2.0 the browser session token doubled as the access token, under
 * this prefix. Nothing writes it any more (new browser sessions live under
 * `web_session:`, which this middleware never reads), so the fallback dies
 * with the last 30-day record. Delete this read after 2026-12-01.
 */
const LEGACY_TOKEN_PREFIX = "session:";

/**
 * Resolve a bearer token to the identity it was issued for. The GitHub access
 * token inside a legacy record is dropped before anything downstream sees it.
 */
async function lookupToken(
	kv: KVNamespace,
	token: string,
): Promise<Props | null> {
	const record =
		(await kv.get(`${TOKEN_PREFIX}${token}`, "json")) ??
		(await kv.get(`${LEGACY_TOKEN_PREFIX}${token}`, "json"));
	if (!isIdentity(record)) return null;

	return {
		login: record.login,
		name: typeof record.name === "string" ? record.name : record.login,
		email: typeof record.email === "string" ? record.email : "",
		baseUrl: typeof record.baseUrl === "string" ? record.baseUrl : undefined,
	};
}

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

	const props = await lookupToken(c.env.OAUTH_KV, match[1]);

	if (!props) {
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

	c.set("props", props);
	await next();
});
