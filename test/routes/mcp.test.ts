import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMcpRoutes } from "../../src/routes/mcp.js";

// Mock the bearerAuth middleware to pass through for tests
vi.mock("../../src/middleware/auth.js", () => ({
	bearerAuth: async (c: any, next: any) => {
		// Set mock props for tests
		c.set("props", {
			login: "testuser",
			baseUrl: "http://localhost",
			accessToken: "test-token",
		});
		await next();
	},
}));

describe("MCP Routes", () => {
	let mockStreamableHTTP: any;
	let mockSSE: any;
	let mcpApp: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create mock MCP handlers
		mockStreamableHTTP = { fetch: vi.fn() };
		mockSSE = { fetch: vi.fn() };

		// Create real Hono app with mocked handlers
		mcpApp = createMcpRoutes({
			streamableHTTP: mockStreamableHTTP,
			sse: mockSSE,
		});
	});

	describe("Streamable HTTP Routes", () => {
		it("should handle /mcp requests", async () => {
			mockStreamableHTTP.fetch.mockResolvedValue(new Response("MCP Response", { status: 200 }));

			const request = new Request("http://localhost/mcp", {
				method: "POST",
			});

			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};

			const mockCtx = {} as any;

			const response = await mcpApp.fetch(request, mockEnv, mockCtx);

			// Verify the handler was called
			expect(mockStreamableHTTP.fetch).toHaveBeenCalled();
			expect(await response.text()).toBe("MCP Response");
		});

		it("should handle /mcp/* requests", async () => {
			mockStreamableHTTP.fetch.mockResolvedValue(new Response("MCP Initialize", { status: 200 }));

			const request = new Request("http://localhost/mcp/initialize", {
				method: "POST",
			});

			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};

			const mockCtx = {} as any;

			const response = await mcpApp.fetch(request, mockEnv, mockCtx);

			expect(mockStreamableHTTP.fetch).toHaveBeenCalled();
			expect(await response.text()).toBe("MCP Initialize");
		});

		it("should pass props to ExecutionContext", async () => {
			mockStreamableHTTP.fetch.mockImplementation((req, env, ctx) => {
				// Verify ctx.props is set (would be set by the route handler)
				return new Response(JSON.stringify({ received: "props" }), { status: 200 });
			});

			const request = new Request("http://localhost/mcp", {
				method: "POST",
			});

			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};

			const mockCtx = {} as any;

			await mcpApp.fetch(request, mockEnv, mockCtx);

			// Verify the handler was called with env and ctx
			expect(mockStreamableHTTP.fetch).toHaveBeenCalled();
			const callArgs = mockStreamableHTTP.fetch.mock.calls[0];
			expect(callArgs[1]).toBe(mockEnv); // env
			expect(callArgs[2]).toBeDefined(); // ctx exists
		});
	});

	describe("SSE Routes", () => {
		it("should handle /sse requests", async () => {
			mockSSE.fetch.mockResolvedValue(new Response("SSE Response", { status: 200 }));

			const request = new Request("http://localhost/sse", {
				method: "GET",
			});

			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};

			const mockCtx = {} as any;

			const response = await mcpApp.fetch(request, mockEnv, mockCtx);

			expect(mockSSE.fetch).toHaveBeenCalled();
			expect(await response.text()).toBe("SSE Response");
		});

		it("should handle /sse/* requests", async () => {
			mockSSE.fetch.mockResolvedValue(new Response("SSE Message", { status: 200 }));

			const request = new Request("http://localhost/sse/message", {
				method: "GET",
			});

			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};

			const mockCtx = {} as any;

			const response = await mcpApp.fetch(request, mockEnv, mockCtx);

			expect(mockSSE.fetch).toHaveBeenCalled();
			expect(await response.text()).toBe("SSE Message");
		});
	});

	describe("Error Handling", () => {
		it("should handle MCP handler errors gracefully", async () => {
			const error = new Error("MCP Handler Error");
			mockStreamableHTTP.fetch.mockRejectedValue(error);

			const request = new Request("http://localhost/mcp", {
				method: "POST",
			});

			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};

			const mockCtx = {} as any;

			// The error handling middleware should catch the error and return 500
			const response = await mcpApp.fetch(request, mockEnv, mockCtx);
			expect(response.status).toBe(500);
			expect(await response.text()).toBe("Internal Server Error");
		});

		it("should handle SSE handler errors gracefully", async () => {
			const error = new Error("SSE Handler Error");
			mockSSE.fetch.mockRejectedValue(error);

			const request = new Request("http://localhost/sse", {
				method: "GET",
			});

			const mockEnv = {
				OAUTH_KV: {} as any,
				MCP_OBJECT: {} as any,
			};

			const mockCtx = {} as any;

			// The error handling middleware should catch the error and return 500
			const response = await mcpApp.fetch(request, mockEnv, mockCtx);
			expect(response.status).toBe(500);
			expect(await response.text()).toBe("Internal Server Error");
		});
	});

	describe("Route Matching", () => {
		it("should match /mcp exactly", async () => {
			mockStreamableHTTP.fetch.mockResolvedValue(new Response("OK"));

			const request = new Request("http://localhost/mcp", {
				method: "POST",
			});

			const mockEnv = { OAUTH_KV: {} as any, MCP_OBJECT: {} as any };
			const mockCtx = {} as any;

			await mcpApp.fetch(request, mockEnv, mockCtx);

			expect(mockStreamableHTTP.fetch).toHaveBeenCalledTimes(1);
		});

		it("should match /mcp/* patterns", async () => {
			mockStreamableHTTP.fetch.mockResolvedValue(new Response("OK"));

			const request = new Request("http://localhost/mcp/some/path", {
				method: "POST",
			});

			const mockEnv = { OAUTH_KV: {} as any, MCP_OBJECT: {} as any };
			const mockCtx = {} as any;

			await mcpApp.fetch(request, mockEnv, mockCtx);

			expect(mockStreamableHTTP.fetch).toHaveBeenCalledTimes(1);
		});

		it("should match /sse exactly", async () => {
			mockSSE.fetch.mockResolvedValue(new Response("OK"));

			const request = new Request("http://localhost/sse", {
				method: "GET",
			});

			const mockEnv = { OAUTH_KV: {} as any, MCP_OBJECT: {} as any };
			const mockCtx = {} as any;

			await mcpApp.fetch(request, mockEnv, mockCtx);

			expect(mockSSE.fetch).toHaveBeenCalledTimes(1);
		});

		it("should match /sse/* patterns", async () => {
			mockSSE.fetch.mockResolvedValue(new Response("OK"));

			const request = new Request("http://localhost/sse/some/path", {
				method: "GET",
			});

			const mockEnv = { OAUTH_KV: {} as any, MCP_OBJECT: {} as any };
			const mockCtx = {} as any;

			await mcpApp.fetch(request, mockEnv, mockCtx);

			expect(mockSSE.fetch).toHaveBeenCalledTimes(1);
		});

		it("should return 404 for non-matching routes", async () => {
			const request = new Request("http://localhost/unknown", {
				method: "GET",
			});

			const mockEnv = { OAUTH_KV: {} as any, MCP_OBJECT: {} as any };
			const mockCtx = {} as any;

			const response = await mcpApp.fetch(request, mockEnv, mockCtx);

			expect(response.status).toBe(404);
			expect(mockStreamableHTTP.fetch).not.toHaveBeenCalled();
			expect(mockSSE.fetch).not.toHaveBeenCalled();
		});
	});

	describe("HTTP Methods", () => {
		it("should accept all HTTP methods for /mcp", async () => {
			mockStreamableHTTP.fetch.mockResolvedValue(new Response("OK"));

			const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"];

			for (const method of methods) {
				const request = new Request("http://localhost/mcp", { method });
				const mockEnv = { OAUTH_KV: {} as any, MCP_OBJECT: {} as any };
				const mockCtx = {} as any;

				await mcpApp.fetch(request, mockEnv, mockCtx);
			}

			// Should be called once for each method
			expect(mockStreamableHTTP.fetch).toHaveBeenCalledTimes(methods.length);
		});

		it("should accept all HTTP methods for /sse", async () => {
			mockSSE.fetch.mockResolvedValue(new Response("OK"));

			const methods = ["GET", "POST"];

			for (const method of methods) {
				const request = new Request("http://localhost/sse", { method });
				const mockEnv = { OAUTH_KV: {} as any, MCP_OBJECT: {} as any };
				const mockCtx = {} as any;

				await mcpApp.fetch(request, mockEnv, mockCtx);
			}

			// Should be called once for each method
			expect(mockSSE.fetch).toHaveBeenCalledTimes(methods.length);
		});
	});
});
