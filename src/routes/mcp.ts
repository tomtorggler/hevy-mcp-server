import { Hono } from "hono";
import { bearerAuth } from "../middleware/auth.js";
import type { Env, Variables } from "../app.js";

// Create MCP routes function that accepts mcpHandlers
export function createMcpRoutes(mcpHandlers: any) {
	const mcpRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Streamable HTTP endpoint
mcpRoutes.all("/mcp", bearerAuth, async (c) => {
	const props = c.get("props");

	// Create ExecutionContext with props
	// The agents library's serve() handler will read ctx.props and pass it to the DO
	const ctx = c.executionCtx as any;
	ctx.props = props;

	// Forward request to MCP handler
	const response = await mcpHandlers.streamableHTTP.fetch(
		c.req.raw,
		c.env,
		ctx
	);

	return response;
});

// Legacy SSE endpoint for backward compatibility
mcpRoutes.all("/sse", bearerAuth, async (c) => {
	const props = c.get("props");
	const ctx = c.executionCtx as any;
	ctx.props = props;

	return await mcpHandlers.sse.fetch(c.req.raw, c.env, ctx);
});

	return mcpRoutes;
}