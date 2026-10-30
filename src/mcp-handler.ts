/**
 * Stateless MCP endpoint.
 *
 * Built on the Cloudflare Agents SDK `createMcpHandler` and MCP SDK v2: every
 * request gets a fresh `McpServer` from `createHevyServer()`, there is no
 * protocol session and no Durable Object. The signed-in user's identity comes
 * from `bearerAuth` as `props`; the Hevy API key is loaded from KV per user.
 */

import { createMcpHandler } from "agents/mcp/server";
import { HevyClient } from "./lib/client.js";
import { getUserApiKey } from "./lib/key-storage.js";
import { createHevyServer, type ClientProvider } from "./tools.js";
import type { Props } from "./utils.js";

export interface McpEnv {
	OAUTH_KV: KVNamespace;
	COOKIE_ENCRYPTION_KEY: string;
}

/** Re-read a user's API key from KV after this long so key changes take effect. */
const CLIENT_CACHE_MS = 5 * 60 * 1000;

/** Per-isolate cache of Hevy clients by GitHub login. Missing keys are never cached. */
const clientCache = new Map<string, { client: HevyClient; loadedAt: number }>();

/** Test hook. */
export function clearClientCache(): void {
	clientCache.clear();
}

/**
 * Resolves the Hevy client for `props.login`, or throws a user-facing error
 * telling the assistant where the user can add a key.
 */
export function hevyClientProvider(env: McpEnv, props: Props): ClientProvider {
	return async () => {
		const cached = clientCache.get(props.login);
		if (cached && Date.now() - cached.loadedAt < CLIENT_CACHE_MS) {
			return cached.client;
		}

		const apiKey = await getUserApiKey(
			env.OAUTH_KV,
			env.COOKIE_ENCRYPTION_KEY,
			props.login,
		);
		if (!apiKey) {
			clientCache.delete(props.login);
			const setupUrl = props.baseUrl
				? `${props.baseUrl}/setup`
				: "/setup on the server URL";
			throw new Error(
				`No Hevy API key is configured for @${props.login}. ` +
					`Ask the user to add one at ${setupUrl}, then retry.`,
			);
		}

		const client = new HevyClient({ apiKey });
		clientCache.set(props.login, { client, loadedAt: Date.now() });
		return client;
	};
}

/**
 * Serve one MCP request for an authenticated user.
 *
 * The handler is created per request so the server factory can close over
 * `env` and `props`; `createMcpHandler` does no I/O at construction time.
 */
export function handleMcpRequest(
	request: Request,
	env: McpEnv,
	ctx: ExecutionContext,
	props: Props,
): Promise<Response> {
	const handler = createMcpHandler(
		() => createHevyServer(hevyClientProvider(env, props)),
		{
			route: "/mcp",
			// CORS and Origin policy are applied by the Hono app; the bearer
			// token is the access control for this endpoint.
			corsOptions: false,
			allowedOriginHostnames: "*",
			authContext: { props },
			onerror: (error) => console.error("MCP handler error:", error),
		},
	);
	return handler(request, env, ctx);
}
