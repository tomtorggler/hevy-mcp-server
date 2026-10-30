import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../src/github-handler.js", () => {
	const mockHandler = new Hono();
	mockHandler.get("/authorize", (c) => c.text("OAuth authorize"));
	mockHandler.get("/callback", (c) => c.text("OAuth callback"));
	mockHandler.post("/token", (c) => c.json({ access_token: "test" }));
	mockHandler.get("/.well-known/oauth-authorization-server", (c) =>
		c.json({ issuer: "test" }),
	);
	return { default: mockHandler };
});

vi.mock("../src/mcp-handler.js", () => ({
	handleMcpRequest: vi.fn(),
}));

vi.mock("../src/routes/mcp.js", async () => {
	const { Hono } = await import("hono");
	return {
		createMcpRoutes: vi.fn((handler: any) => {
			const routes = new Hono();
			routes.all("/mcp", async (c) => {
				const response = await handler(c.req.raw, c.env, c.executionCtx, {
					login: "t",
				});
				return response || c.text("MCP response");
			});
			routes.all("/sse", (c) => c.json({ error: "gone" }, 410));
			return routes;
		}),
	};
});

vi.mock("../src/routes/utility.js", async () => {
	const { Hono } = await import("hono");
	const routes = new Hono();
	routes.get("/health", (c) => c.json({ status: "healthy" }));
	routes.get("/", (c) => c.html("<html>Home</html>"));
	return { default: routes };
});

import app from "../src/app.js";
import { handleMcpRequest } from "../src/mcp-handler.js";

const mockEnv = { OAUTH_KV: {} as any };
const mockCtx = {} as any;
const handleMcp = handleMcpRequest as unknown as ReturnType<typeof vi.fn>;

describe("Hono App Integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("CORS Middleware", () => {
		it("handles OPTIONS preflight requests including MCP protocol headers", async () => {
			const request = new Request("http://localhost/mcp", {
				method: "OPTIONS",
				headers: {
					Origin: "https://claude.ai",
					"Access-Control-Request-Method": "POST",
					"Access-Control-Request-Headers":
						"Content-Type, Authorization, Mcp-Protocol-Version",
				},
			});

			const response = await app.fetch(request, mockEnv, mockCtx);

			expect(response.status).toBe(204);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
				"GET, POST, DELETE, OPTIONS",
			);
			const allowHeaders = response.headers.get(
				"Access-Control-Allow-Headers",
			)!;
			for (const h of [
				"Authorization",
				"Mcp-Session-Id",
				"Mcp-Protocol-Version",
				"Mcp-Method",
				"Mcp-Name",
			]) {
				expect(allowHeaders).toContain(h);
			}
			expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
		});

		it("adds CORS headers to all responses", async () => {
			const response = await app.fetch(
				new Request("http://localhost/health"),
				mockEnv,
				mockCtx,
			);

			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(response.headers.get("Access-Control-Expose-Headers")).toContain(
				"WWW-Authenticate",
			);
		});
	});

	describe("Error Handling", () => {
		it("turns unhandled errors into a JSON 500", async () => {
			handleMcp.mockRejectedValue(new Error("Test error"));

			const response = await app.fetch(
				new Request("http://localhost/mcp", { method: "POST" }),
				mockEnv,
				mockCtx,
			);

			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({
				error: "internal_server_error",
				message: "An unexpected error occurred",
			});
		});
	});

	describe("Route Ordering", () => {
		it("prioritizes OAuth routes", async () => {
			const response = await app.fetch(
				new Request("http://localhost/authorize"),
				mockEnv,
				mockCtx,
			);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe("OAuth authorize");
		});

		it("routes MCP requests to the MCP handler", async () => {
			handleMcp.mockResolvedValue(new Response("MCP response"));

			const response = await app.fetch(
				new Request("http://localhost/mcp", { method: "POST" }),
				mockEnv,
				mockCtx,
			);

			expect(handleMcp).toHaveBeenCalled();
			expect(await response.text()).toBe("MCP response");
		});

		it("routes utility requests", async () => {
			const response = await app.fetch(
				new Request("http://localhost/health"),
				mockEnv,
				mockCtx,
			);
			expect(response.status).toBe(200);
			expect(((await response.json()) as any).status).toBe("healthy");
		});

		it("serves OAuth discovery metadata", async () => {
			const response = await app.fetch(
				new Request("http://localhost/.well-known/oauth-authorization-server"),
				mockEnv,
				mockCtx,
			);
			expect(response.status).toBe(200);
			expect(((await response.json()) as any).issuer).toBe("test");
		});
	});

	describe("404 Handling", () => {
		it("returns 404 with CORS headers for unknown routes", async () => {
			const response = await app.fetch(
				new Request("http://localhost/unknown-route"),
				mockEnv,
				mockCtx,
			);
			expect(response.status).toBe(404);
			expect(await response.text()).toBe("Not found");
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});
	});
});
