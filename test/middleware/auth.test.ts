import { describe, it, expect, beforeEach, vi } from "vitest";
import { bearerAuth } from "../../src/middleware/auth.js";

// Mock the KV namespace
const mockKV = {
	get: vi.fn(),
	put: vi.fn(),
	delete: vi.fn(),
};

describe("Bearer Auth Middleware", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Valid Authentication", () => {
		it("should pass through with valid Bearer token", async () => {
			const mockProps = {
				login: "testuser",
				baseUrl: "http://localhost",
				accessToken: "access-token",
			};

			mockKV.get.mockResolvedValue(mockProps);

			const request = new Request("http://localhost/mcp", {
				method: "POST",
				headers: { "Authorization": "Bearer valid-token" },
			});

			const mockEnv = { OAUTH_KV: mockKV };
			const mockCtx = {} as any;

			// Create a mock Hono context
			const mockContext = {
				req: {
					header: (name: string) => request.headers.get(name),
					url: request.url,
				},
				env: mockEnv,
				set: vi.fn(),
				json: vi.fn(),
			};

			const next = vi.fn();

			await bearerAuth(mockContext as any, next);

			expect(mockKV.get).toHaveBeenCalledWith("session:valid-token", "json");
			expect(mockContext.set).toHaveBeenCalledWith("props", mockProps);
			expect(next).toHaveBeenCalled();
		});

		it("should handle different token formats", async () => {
			const mockProps = { login: "testuser" };
			mockKV.get.mockResolvedValue(mockProps);

			const request = new Request("http://localhost/mcp", {
				method: "POST",
				headers: { "Authorization": "Bearer token-with-dashes-and_underscores" },
			});

			const mockEnv = { OAUTH_KV: mockKV };
			const mockCtx = {} as any;

			const mockContext = {
				req: {
					header: (name: string) => request.headers.get(name),
					url: request.url,
				},
				env: mockEnv,
				set: vi.fn(),
				json: vi.fn(),
			};

			const next = vi.fn();

			await bearerAuth(mockContext as any, next);

			expect(mockKV.get).toHaveBeenCalledWith("session:token-with-dashes-and_underscores", "json");
			expect(mockContext.set).toHaveBeenCalledWith("props", mockProps);
		});
	});

	describe("Invalid Authentication", () => {
		it("should return 401 for missing Authorization header", async () => {
			const request = new Request("http://localhost/mcp", {
				method: "POST",
			});

			const mockEnv = { OAUTH_KV: mockKV };
			const mockCtx = {} as any;

			const mockContext = {
				req: {
					header: (name: string) => request.headers.get(name),
					url: request.url,
				},
				env: mockEnv,
				set: vi.fn(),
				json: vi.fn().mockReturnValue(new Response()),
			};

			const next = vi.fn();

			await bearerAuth(mockContext as any, next);

			expect(mockContext.json).toHaveBeenCalledWith(
				{
					error: "unauthorized",
					message: "Authentication required. Please provide a valid Bearer token.",
				},
				401,
				{
					"WWW-Authenticate": `Bearer realm="${request.url}", error="invalid_token"`,
				}
			);
			expect(next).not.toHaveBeenCalled();
		});

		it("should return 401 for invalid Authorization header format", async () => {
			const request = new Request("http://localhost/mcp", {
				method: "POST",
				headers: { "Authorization": "Basic invalid-format" },
			});

			const mockEnv = { OAUTH_KV: mockKV };
			const mockCtx = {} as any;

			const mockContext = {
				req: {
					header: (name: string) => request.headers.get(name),
					url: request.url,
				},
				env: mockEnv,
				set: vi.fn(),
				json: vi.fn().mockReturnValue(new Response()),
			};

			const next = vi.fn();

			await bearerAuth(mockContext as any, next);

			expect(mockContext.json).toHaveBeenCalledWith(
				{
					error: "unauthorized",
					message: "Authentication required. Please provide a valid Bearer token.",
				},
				401,
				{
					"WWW-Authenticate": `Bearer realm="${request.url}", error="invalid_token"`,
				}
			);
			expect(next).not.toHaveBeenCalled();
		});

		it("should return 401 for empty Bearer token", async () => {
			const request = new Request("http://localhost/mcp", {
				method: "POST",
				headers: { "Authorization": "Bearer " },
			});

			const mockEnv = { OAUTH_KV: mockKV };
			const mockCtx = {} as any;

			const mockContext = {
				req: {
					header: (name: string) => request.headers.get(name),
					url: request.url,
				},
				env: mockEnv,
				set: vi.fn(),
				json: vi.fn().mockReturnValue(new Response()),
			};

			const next = vi.fn();

			await bearerAuth(mockContext as any, next);

			expect(mockContext.json).toHaveBeenCalledWith(
				{
					error: "unauthorized",
					message: "Authentication required. Please provide a valid Bearer token.",
				},
				401,
				{
					"WWW-Authenticate": `Bearer realm="${request.url}", error="invalid_token"`,
				}
			);
			expect(next).not.toHaveBeenCalled();
		});

		it("should return 401 for invalid session data", async () => {
			mockKV.get.mockResolvedValue(null);

			const request = new Request("http://localhost/mcp", {
				method: "POST",
				headers: { "Authorization": "Bearer invalid-token" },
			});

			const mockEnv = { OAUTH_KV: mockKV };
			const mockCtx = {} as any;

			const mockContext = {
				req: {
					header: (name: string) => request.headers.get(name),
					url: request.url,
				},
				env: mockEnv,
				set: vi.fn(),
				json: vi.fn().mockReturnValue(new Response()),
			};

			const next = vi.fn();

			await bearerAuth(mockContext as any, next);

			expect(mockKV.get).toHaveBeenCalledWith("session:invalid-token", "json");
			expect(mockContext.json).toHaveBeenCalledWith(
				{
					error: "unauthorized",
					message: "Invalid token.",
				},
				401
			);
			expect(next).not.toHaveBeenCalled();
		});

		it("should return 401 for non-object session data", async () => {
			mockKV.get.mockResolvedValue("invalid-session-data");

			const request = new Request("http://localhost/mcp", {
				method: "POST",
				headers: { "Authorization": "Bearer invalid-token" },
			});

			const mockEnv = { OAUTH_KV: mockKV };
			const mockCtx = {} as any;

			const mockContext = {
				req: {
					header: (name: string) => request.headers.get(name),
					url: request.url,
				},
				env: mockEnv,
				set: vi.fn(),
				json: vi.fn().mockReturnValue(new Response()),
			};

			const next = vi.fn();

			await bearerAuth(mockContext as any, next);

			expect(mockContext.json).toHaveBeenCalledWith(
				{
					error: "unauthorized",
					message: "Invalid token.",
				},
				401
			);
			expect(next).not.toHaveBeenCalled();
		});
	});

	describe("Error Handling", () => {
		it("should handle KV storage errors", async () => {
			mockKV.get.mockRejectedValue(new Error("KV storage error"));

			const request = new Request("http://localhost/mcp", {
				method: "POST",
				headers: { "Authorization": "Bearer test-token" },
			});

			const mockEnv = { OAUTH_KV: mockKV };
			const mockCtx = {} as any;

			const mockContext = {
				req: {
					header: (name: string) => request.headers.get(name),
					url: request.url,
				},
				env: mockEnv,
				set: vi.fn(),
				json: vi.fn().mockReturnValue(new Response()),
			};

			const next = vi.fn();

			await expect(bearerAuth(mockContext as any, next)).rejects.toThrow("KV storage error");
		});

		it("should handle malformed Authorization header", async () => {
			const request = new Request("http://localhost/mcp", {
				method: "POST",
				headers: { "Authorization": "Bearer" }, // Missing space
			});

			const mockEnv = { OAUTH_KV: mockKV };
			const mockCtx = {} as any;

			const mockContext = {
				req: {
					header: (name: string) => request.headers.get(name),
					url: request.url,
				},
				env: mockEnv,
				set: vi.fn(),
				json: vi.fn().mockReturnValue(new Response()),
			};

			const next = vi.fn();

			await bearerAuth(mockContext as any, next);

			expect(mockContext.json).toHaveBeenCalledWith(
				{
					error: "unauthorized",
					message: "Authentication required. Please provide a valid Bearer token.",
				},
				401,
				{
					"WWW-Authenticate": `Bearer realm="${request.url}", error="invalid_token"`,
				}
			);
		});
	});

	describe("WWW-Authenticate Header", () => {
		it("should include proper WWW-Authenticate header for missing token", async () => {
			const request = new Request("http://localhost/mcp", {
				method: "POST",
			});

			const mockEnv = { OAUTH_KV: mockKV };
			const mockCtx = {} as any;

			const mockContext = {
				req: {
					header: (name: string) => request.headers.get(name),
					url: request.url,
				},
				env: mockEnv,
				set: vi.fn(),
				json: vi.fn().mockReturnValue(new Response()),
			};

			const next = vi.fn();

			await bearerAuth(mockContext as any, next);

			expect(mockContext.json).toHaveBeenCalledWith(
				expect.any(Object),
				401,
				{
					"WWW-Authenticate": `Bearer realm="${request.url}", error="invalid_token"`,
				}
			);
		});

		it("should include proper WWW-Authenticate header for invalid token", async () => {
			mockKV.get.mockResolvedValue(null);

			const request = new Request("http://localhost/mcp", {
				method: "POST",
				headers: { "Authorization": "Bearer invalid-token" },
			});

			const mockEnv = { OAUTH_KV: mockKV };
			const mockCtx = {} as any;

			const mockContext = {
				req: {
					header: (name: string) => request.headers.get(name),
					url: request.url,
				},
				env: mockEnv,
				set: vi.fn(),
				json: vi.fn().mockReturnValue(new Response()),
			};

			const next = vi.fn();

			await bearerAuth(mockContext as any, next);

			expect(mockContext.json).toHaveBeenCalledWith(
				{
					error: "unauthorized",
					message: "Invalid token.",
				},
				401
			);
		});
	});
});
