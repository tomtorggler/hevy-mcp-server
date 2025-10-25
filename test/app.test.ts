import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";

// Mock the modules FIRST (before any variables that use them)
vi.mock("../src/github-handler.js", () => {
	const mockHandler = new Hono();
	mockHandler.get("/authorize", (c) => c.text("OAuth authorize"));
	mockHandler.get("/callback", (c) => c.text("OAuth callback"));
	mockHandler.post("/token", (c) => c.json({ access_token: "test" }));
	mockHandler.get("/.well-known/oauth-authorization-server", (c) => c.json({ issuer: "test" }));
	return { default: mockHandler };
});

vi.mock("../src/mcp-handlers.js", () => ({
	mcpHandlers: {
		streamableHTTP: { fetch: vi.fn() },
		sse: { fetch: vi.fn() },
	},
}));

vi.mock("../src/routes/mcp.js", async () => {
	const { Hono } = await import("hono");
	return {
		createMcpRoutes: vi.fn((handlers: any) => {
			const routes = new Hono();
			routes.all("/mcp", async (c) => {
				const response = await handlers.streamableHTTP.fetch(c.req.raw, c.env, c.executionCtx);
				return response || c.text("MCP response");
			});
			routes.all("/mcp/*", async (c) => {
				const response = await handlers.streamableHTTP.fetch(c.req.raw, c.env, c.executionCtx);
				return response || c.text("MCP response");
			});
			routes.all("/sse", async (c) => {
				const response = await handlers.sse.fetch(c.req.raw, c.env, c.executionCtx);
				return response || c.text("SSE response");
			});
			return routes;
		}),
	};
});

vi.mock("../src/routes/utility.js", async () => {
	const { Hono } = await import("hono");
	const routes = new Hono();
	routes.get("/health", (c) => c.json({ status: "healthy", transport: "streamable-http", version: "3.1.0", oauth: "enabled" }));
	routes.get("/", (c) => c.html("<html>Home</html>"));
	return { default: routes };
});

import app from "../src/app.js";
import { mcpHandlers } from "../src/mcp-handlers.js";

describe("Hono App Integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("CORS Middleware", () => {
		it("should handle OPTIONS preflight requests", async () => {
			const request = new Request("http://localhost/mcp", {
				method: "OPTIONS",
				headers: {
					"Origin": "https://claude.ai",
					"Access-Control-Request-Method": "POST",
					"Access-Control-Request-Headers": "Content-Type, Authorization",
				},
			});

			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};

			const mockCtx = {} as any;

			const response = await app.fetch(request, mockEnv, mockCtx);

			expect(response.status).toBe(204);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, DELETE, OPTIONS");
			expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization");
			expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
		});

		it("should add CORS headers to all responses", async () => {
			const request = new Request("http://localhost/health");
			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};
			const mockCtx = {} as any;

			const response = await app.fetch(request, mockEnv, mockCtx);

			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, DELETE, OPTIONS");
			expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization");
		});
	});

	describe("Error Handling", () => {
		it("should handle unhandled errors gracefully", async () => {
			// Make MCP handler throw an error
			mcpHandlers.streamableHTTP.fetch.mockRejectedValue(new Error("Test error"));

			const request = new Request("http://localhost/mcp", {
				method: "POST",
			});

			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};

			const mockCtx = {} as any;

			const response = await app.fetch(request, mockEnv, mockCtx);

			expect(response.status).toBe(500);
			const data = await response.json();
			expect(data).toEqual({
				error: "internal_server_error",
				message: "An unexpected error occurred",
			});
		});
	});

	describe("Route Ordering", () => {
		it("should prioritize OAuth routes over MCP routes", async () => {
			const request = new Request("http://localhost/authorize");
			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};
			const mockCtx = {} as any;

			const response = await app.fetch(request, mockEnv, mockCtx);

			expect(response.status).toBe(200);
			expect(await response.text()).toBe("OAuth authorize");
		});

		it("should route MCP requests to MCP handlers", async () => {
			mcpHandlers.streamableHTTP.fetch.mockResolvedValue(new Response("MCP response"));

			const request = new Request("http://localhost/mcp", {
				method: "POST",
			});

			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};

			const mockCtx = {} as any;

			const response = await app.fetch(request, mockEnv, mockCtx);

			expect(mcpHandlers.streamableHTTP.fetch).toHaveBeenCalled();
			expect(await response.text()).toBe("MCP response");
		});

		it("should route utility requests to utility handlers", async () => {
			const request = new Request("http://localhost/health");
			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};
			const mockCtx = {} as any;

			const response = await app.fetch(request, mockEnv, mockCtx);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe("healthy");
		});
	});

	describe("404 Handling", () => {
		it("should return 404 for unknown routes", async () => {
			const request = new Request("http://localhost/unknown-route");
			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};
			const mockCtx = {} as any;

			const response = await app.fetch(request, mockEnv, mockCtx);

			expect(response.status).toBe(404);
			await expect(response.text()).resolves.toBe("Not found");
		});

		it("should handle 404 with proper CORS headers", async () => {
			const request = new Request("http://localhost/unknown-route");
			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};
			const mockCtx = {} as any;

			const response = await app.fetch(request, mockEnv, mockCtx);

			expect(response.status).toBe(404);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});
	});

	describe("Environment Variables", () => {
		it("should pass environment variables to routes", async () => {
			const request = new Request("http://localhost/health");
			const mockEnv = {
				OAUTH_KV: { get: vi.fn() } as any,
				MCP_OBJECT: { idFromName: vi.fn() } as any,
				GITHUB_CLIENT_ID: "test-client-id",
				GITHUB_CLIENT_SECRET: "test-secret",
				COOKIE_ENCRYPTION_KEY: "test-key",
			};
			const mockCtx = {} as any;

			const response = await app.fetch(request, mockEnv, mockCtx);

			// Health endpoint should work regardless of env vars
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe("healthy");
		});
	});

	describe("Request Methods", () => {
		it("should handle GET requests", async () => {
			const request = new Request("http://localhost/health", { method: "GET" });
			const mockEnv = { OAUTH_KV: {} as any, MCP_OBJECT: {} as any };
			const mockCtx = {} as any;

			const response = await app.fetch(request, mockEnv, mockCtx);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe("healthy");
		});

		it("should handle POST requests", async () => {
			mcpHandlers.streamableHTTP.fetch.mockResolvedValue(new Response("POST OK"));

			const request = new Request("http://localhost/mcp", {
				method: "POST",
			});

			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};
			const mockCtx = {} as any;

			const response = await app.fetch(request, mockEnv, mockCtx);

			expect(await response.text()).toBe("POST OK");
		});

		it("should handle GET requests to OAuth endpoints", async () => {
			const request = new Request("http://localhost/.well-known/oauth-authorization-server", { method: "GET" });
			const mockEnv = { OAUTH_KV: {} as any, MCP_OBJECT: {} as any };
			const mockCtx = {} as any;

			const response = await app.fetch(request, mockEnv, mockCtx);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.issuer).toBe("test");
		});
	});
});
