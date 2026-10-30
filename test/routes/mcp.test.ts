import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMcpRoutes } from "../../src/routes/mcp.js";

const PROPS = {
	login: "testuser",
	name: "Test",
	email: "t@example.com",
	baseUrl: "http://localhost",
};

// Pass bearerAuth through with fixed props
vi.mock("../../src/middleware/auth.js", () => ({
	bearerAuth: async (c: any, next: any) => {
		c.set("props", PROPS);
		await next();
	},
}));

describe("MCP Routes", () => {
	let handleMcp: ReturnType<typeof vi.fn>;
	let mcpApp: ReturnType<typeof createMcpRoutes>;
	const env = { OAUTH_KV: {} as any } as any;
	const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any;

	beforeEach(() => {
		vi.clearAllMocks();
		handleMcp = vi.fn().mockResolvedValue(new Response("MCP Response"));
		mcpApp = createMcpRoutes(handleMcp);
	});

	describe("Streamable HTTP", () => {
		it("forwards /mcp to the handler with env, execution context and props", async () => {
			const request = new Request("http://localhost/mcp", { method: "POST" });
			const response = await mcpApp.fetch(request, env, ctx);

			expect(await response.text()).toBe("MCP Response");
			expect(handleMcp).toHaveBeenCalledTimes(1);
			const [req, passedEnv, passedCtx, props] = handleMcp.mock.calls[0];
			expect(req).toBeInstanceOf(Request);
			expect(req.url).toBe("http://localhost/mcp");
			expect(passedEnv).toBe(env);
			expect(passedCtx).toBe(ctx);
			expect(props).toEqual(PROPS);
		});

		it("forwards /mcp/* sub-paths too", async () => {
			await mcpApp.fetch(new Request("http://localhost/mcp/extra"), env, ctx);
			expect(handleMcp).toHaveBeenCalledTimes(1);
		});

		it.each(["GET", "POST", "DELETE", "PUT"])("accepts %s", async (method) => {
			await mcpApp.fetch(
				new Request("http://localhost/mcp", { method }),
				env,
				ctx,
			);
			expect(handleMcp).toHaveBeenCalledTimes(1);
		});

		it("lets handler errors propagate to the app error handler", async () => {
			handleMcp.mockRejectedValue(new Error("MCP Handler Error"));
			const response = await mcpApp.fetch(
				new Request("http://localhost/mcp", { method: "POST" }),
				env,
				ctx,
			);
			expect(response.status).toBe(500);
		});
	});

	describe("Removed SSE transport", () => {
		it.each(["/sse", "/sse/message"])(
			"answers %s with 410 Gone pointing at /mcp",
			async (path) => {
				const response = await mcpApp.fetch(
					new Request(`http://localhost${path}`),
					env,
					ctx,
				);
				expect(response.status).toBe(410);
				const body = (await response.json()) as any;
				expect(body.error).toBe("gone");
				expect(body.mcp_endpoint).toBe("http://localhost/mcp");
				expect(handleMcp).not.toHaveBeenCalled();
			},
		);
	});

	it("returns 404 for unrelated routes", async () => {
		const response = await mcpApp.fetch(
			new Request("http://localhost/unknown"),
			env,
			ctx,
		);
		expect(response.status).toBe(404);
		expect(handleMcp).not.toHaveBeenCalled();
	});
});
