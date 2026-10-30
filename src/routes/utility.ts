import { Hono } from "hono";
import type { Env, Variables } from "../app.js";
import { getBaseUrl, getMcpUrl } from "../lib/base-url.js";
import { renderHomePage } from "../ui/home.js";
import { VERSION } from "../version.js";

const utilityRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Health check endpoint
utilityRoutes.get("/health", (c) => {
	const baseUrl = getBaseUrl(c.req);
	return c.json({
		status: "healthy",
		transport: "streamable-http",
		version: VERSION,
		oauth: "enabled",
		mcp_endpoint: getMcpUrl(baseUrl),
	});
});

// Stats endpoint - aggregate counts only (no per-user data)
utilityRoutes.get("/stats", async (c) => {
	try {
		const kv = c.env.OAUTH_KV;

		// KV list() returns at most 1000 keys per call; counts are capped accordingly.
		const [userKeys, tokenKeys, sessionKeys, approvalKeys] = await Promise.all([
			kv.list({ prefix: "hevy_key:" }),
			kv.list({ prefix: "token:" }),
			kv.list({ prefix: "session:" }),
			kv.list({ prefix: "approval:" }),
		]);

		return c.json({
			total_users: userKeys.keys.length,
			connected_clients: tokenKeys.keys.length,
			browser_sessions: sessionKeys.keys.length,
			approved_clients: approvalKeys.keys.length,
		});
	} catch (error) {
		console.error("Error fetching stats:", error);
		return c.json({ error: "Failed to fetch stats" }, 500);
	}
});

// Home page
utilityRoutes.get("/", (c) => {
	return c.html(
		renderHomePage({ baseUrl: getBaseUrl(c.req), version: VERSION }),
	);
});

export default utilityRoutes;
