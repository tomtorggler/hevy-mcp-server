import { Hono } from "hono";
import type { Props } from "./utils.js";
import githubHandler from "./github-handler.js";
import { handleMcpRequest } from "./mcp-handler.js";
import { createMcpRoutes } from "./routes/mcp.js";
import utilityRoutes from "./routes/utility.js";

// Worker bindings and secrets
interface Env {
	OAUTH_KV: KVNamespace;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	COOKIE_ENCRYPTION_KEY: string;
}

// Variables interface for Hono context
interface Variables {
	props?: Props;
}

const CORS_ALLOW_METHODS = "GET, POST, DELETE, OPTIONS";
const CORS_ALLOW_HEADERS =
	"Content-Type, Authorization, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Mcp-Method, Mcp-Name, Last-Event-ID";
const CORS_EXPOSE_HEADERS =
	"Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global CORS middleware
app.use("*", async (c, next) => {
	if (c.req.method === "OPTIONS") {
		return new Response(null, {
			status: 204,
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
				"Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
				"Access-Control-Max-Age": "86400",
			},
		});
	}

	await next();

	c.res.headers.set("Access-Control-Allow-Origin", "*");
	c.res.headers.set("Access-Control-Allow-Methods", CORS_ALLOW_METHODS);
	c.res.headers.set("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
	c.res.headers.set("Access-Control-Expose-Headers", CORS_EXPOSE_HEADERS);
});

// Error handling middleware
app.onError((err, c) => {
	console.error("Unhandled error:", err);
	return c.json(
		{
			error: "internal_server_error",
			message: "An unexpected error occurred",
		},
		500,
	);
});

// Mount routes (order matters!)
app.route("/", githubHandler); // OAuth + setup pages (highest priority)
app.route("/", createMcpRoutes(handleMcpRequest)); // MCP endpoint
app.route("/", utilityRoutes); // Health, stats, home

// 404 handler
app.notFound((c) => {
	return c.text("Not found", 404);
});

export default app;
export type { Env, Variables };
