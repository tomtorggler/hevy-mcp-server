import { McpAgent } from "agents/mcp";
import { HevyClient } from "./lib/client.js";
import { getUserApiKey } from "./lib/key-storage.js";
import { createHevyServer } from "./tools.js";
import type { Props } from "./utils.js";

interface Env {
	MCP_OBJECT: DurableObjectNamespace;
	OAUTH_KV: KVNamespace;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	COOKIE_ENCRYPTION_KEY: string;
}

/** Re-read the user's API key from KV after this long, so key changes take effect. */
const CLIENT_CACHE_MS = 5 * 60 * 1000;

/**
 * Durable Object that hosts one MCP session for one authenticated user.
 *
 * Note: `McpAgent` is deprecated upstream in favour of the stateless
 * `createMcpHandler` (Agents SDK ≥ 0.20 / MCP SDK v2). The tool surface lives
 * in `tools.ts` so that migration only touches this file and the routes.
 */
export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = createHevyServer(() => this.getClient());

	private client: HevyClient | null = null;
	private clientLoadedAt = 0;
	private login = "";

	async init() {
		if (!this.props?.login) {
			throw new Error(
				"Authentication required. Connect through OAuth to use the Hevy MCP server." +
					(this.props?.baseUrl
						? ` Visit ${this.props.baseUrl}/setup to get started.`
						: ""),
			);
		}
		this.login = this.props.login;
	}

	private get setupUrl(): string {
		return this.props?.baseUrl
			? `${this.props.baseUrl}/setup`
			: "/setup on the server URL";
	}

	/**
	 * Returns a Hevy client for the signed-in user, loading (and periodically
	 * reloading) the encrypted API key from KV. Throws a user-facing error when
	 * no key is configured, so each tool call explains how to fix it instead of
	 * the whole server failing to start.
	 */
	private async getClient(): Promise<HevyClient> {
		const stale = Date.now() - this.clientLoadedAt > CLIENT_CACHE_MS;
		if (!this.client || stale) {
			const apiKey = await getUserApiKey(
				this.env.OAUTH_KV,
				this.env.COOKIE_ENCRYPTION_KEY,
				this.login,
			);
			this.client = apiKey ? new HevyClient({ apiKey }) : null;
			this.clientLoadedAt = Date.now();
		}
		if (!this.client) {
			throw new Error(
				`No Hevy API key is configured for @${this.login}. ` +
					`Ask the user to add one at ${this.setupUrl}, then retry.`,
			);
		}
		return this.client;
	}
}
