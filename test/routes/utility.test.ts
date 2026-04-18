import { describe, it, expect } from "vitest";
import utilityRoutes from "../../src/routes/utility.js";

describe("Utility Routes", () => {
	describe("Health Check", () => {
		it("should return health status", async () => {
			const request = new Request("http://localhost/health");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);

			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("application/json");

			const data = await response.json();
			expect(data).toEqual({
				status: "healthy",
				transport: "streamable-http",
				version: "3.1.0",
				oauth: "enabled",
			});
		});

		it("should return 200 status code", async () => {
			const request = new Request("http://localhost/health");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);

			expect(response.status).toBe(200);
		});

		it("should return proper content type", async () => {
			const request = new Request("http://localhost/health");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);

			expect(response.headers.get("Content-Type")).toBe("application/json");
		});
	});

	describe("Home Page", () => {
		it("should return HTML content", async () => {
			const request = new Request("http://localhost/");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);

			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("text/html; charset=UTF-8");

			const html = await response.text();
			expect(html).toContain("<!DOCTYPE html>");
			expect(html).toContain("Hevy MCP Server");
		});

		it("should include proper HTML structure", async () => {
			const request = new Request("http://localhost/");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);
			const html = await response.text();

			// Check for key HTML elements
			expect(html).toContain("<html lang=\"en\">");
			expect(html).toContain("<head>");
			expect(html).toContain("<body>");
			expect(html).toContain("Hevy MCP Server");
		});

		it("should include login link to /setup", async () => {
			const request = new Request("http://localhost/");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);
			const html = await response.text();

			expect(html).toContain('href="/setup"');
			expect(html).toContain("Login");
		});

		it("should include viewport meta tag", async () => {
			const request = new Request("http://localhost/");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);
			const html = await response.text();

			expect(html).toContain('meta name="viewport"');
		});

		it("should include basic styling", async () => {
			const request = new Request("http://localhost/");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);
			const html = await response.text();

			expect(html).toContain("<style>");
			expect(html).toContain("font-family:");
		});
	});

	describe("Error Handling", () => {
		it("should handle 404 for unknown routes", async () => {
			const request = new Request("http://localhost/unknown");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);

			expect(response.status).toBe(404);
		});

		it("should only accept GET for health endpoint", async () => {
			const request = new Request("http://localhost/health", { method: "POST" });
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			// Health endpoint is GET only, so POST should return 404
			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);
			expect(response.status).toBe(404);
		});

		it("should accept GET for health endpoint", async () => {
			const request = new Request("http://localhost/health", { method: "GET" });
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);
			expect(response.status).toBe(200);
		});
	});

	describe("Content Security", () => {
		it("should not include sensitive information in HTML", async () => {
			const request = new Request("http://localhost/");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);
			const html = await response.text();

			// Should not include any sensitive data
			expect(html).not.toContain("api-key");
			expect(html).not.toContain("secret");
			expect(html).not.toContain("token");
		});

	});
});
