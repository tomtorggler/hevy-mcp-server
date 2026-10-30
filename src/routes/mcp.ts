import { Hono } from "hono";
import type { Context } from "hono";
import { bearerAuth } from "../middleware/auth.js";
import type { Env, Variables } from "../app.js";
import type { Props } from "../utils.js";
import { getBaseUrl, getMcpUrl } from "../lib/base-url.js";

/** Serves one authenticated MCP request (see `src/mcp-handler.ts`). */
export type McpRequestHandler = (
	request: Request,
	env: Env,
	ctx: ExecutionContext,
	props: Props,
) => Promise<Response>;

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

export function createMcpRoutes(handleMcp: McpRequestHandler) {
	const routes = new Hono<{ Bindings: Env; Variables: Variables }>();

	const forward = (c: AppContext) =>
		handleMcp(c.req.raw, c.env, c.executionCtx, c.get("props") as Props);

	// Streamable HTTP endpoint. The handler itself only answers exactly /mcp;
	// sub-paths fall through to its 404.
	routes.all("/mcp", bearerAuth, forward);
	routes.all("/mcp/*", bearerAuth, forward);

	// The HTTP+SSE transport (deprecated in MCP 2025-03-26) was removed in 4.0.0.
	const gone = (c: AppContext) =>
		c.json(
			{
				error: "gone",
				message:
					"The SSE transport has been removed. Connect with Streamable HTTP at /mcp.",
				mcp_endpoint: getMcpUrl(getBaseUrl(c.req)),
			},
			410,
		);
	routes.all("/sse", gone);
	routes.all("/sse/*", gone);

	return routes;
}
