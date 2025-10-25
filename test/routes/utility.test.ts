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
			expect(html).toContain("🏋️ Hevy MCP Server");
			expect(html).toContain("✅ Online & Ready");
		});

		it("should include setup link", async () => {
			const request = new Request("http://localhost/");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);
			const html = await response.text();

			expect(html).toContain('href="/setup"');
			expect(html).toContain("🚀 Setup Your Account");
		});

		it("should include feature sections", async () => {
			const request = new Request("http://localhost/");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);
			const html = await response.text();

			// Check for feature sections
			expect(html).toContain("📊 Track Workouts");
			expect(html).toContain("📋 Manage Routines");
			expect(html).toContain("🏃 Exercise History");
			expect(html).toContain("🔐 Secure & Private");
		});

		it("should include footer links", async () => {
			const request = new Request("http://localhost/");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);
			const html = await response.text();

			expect(html).toContain('href="/health"');
			expect(html).toContain("Model Context Protocol");
			expect(html).toContain("Cloudflare Workers");
		});

		it("should be responsive", async () => {
			const request = new Request("http://localhost/");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);
			const html = await response.text();

			// Check for responsive design elements
			expect(html).toContain('meta name="viewport"');
			expect(html).toContain("@media (max-width: 768px)");
		});

		it("should include proper styling", async () => {
			const request = new Request("http://localhost/");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);
			const html = await response.text();

			// Check for CSS styles
			expect(html).toContain("<style>");
			expect(html).toContain("font-family:");
			expect(html).toContain("background:");
			expect(html).toContain("border-radius:");
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

		it("should use secure external links", async () => {
			const request = new Request("http://localhost/");
			const mockEnv = {} as any;
			const mockCtx = {} as any;

			const response = await utilityRoutes.fetch(request, mockEnv, mockCtx);
			const html = await response.text();

			// Check for secure external links
			expect(html).toContain('href="https://modelcontextprotocol.io/"');
			expect(html).toContain('href="https://developers.cloudflare.com/workers/"');
			expect(html).toContain('target="_blank"');
		});
	});
});
