import { describe, it, expect } from "vitest";
import utilityRoutes from "../../src/routes/utility.js";
import { VERSION } from "../../src/version.js";

const mockEnv = {} as any;
const mockCtx = {} as any;

async function get(path: string, init?: RequestInit) {
	return utilityRoutes.fetch(
		new Request(`http://localhost${path}`, init),
		mockEnv,
		mockCtx,
	);
}

describe("Utility Routes", () => {
	describe("Health Check", () => {
		it("returns health status with the package version and MCP endpoint", async () => {
			const response = await get("/health");

			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("application/json");
			expect(await response.json()).toEqual({
				status: "healthy",
				transport: "streamable-http",
				version: VERSION,
				oauth: "enabled",
				mcp_endpoint: "http://localhost/mcp",
			});
		});

		it("only accepts GET", async () => {
			const response = await get("/health", { method: "POST" });
			expect(response.status).toBe(404);
		});
	});

	describe("Home Page", () => {
		it("returns an HTML document", async () => {
			const response = await get("/");

			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe(
				"text/html; charset=UTF-8",
			);

			const html = await response.text();
			expect(html).toContain("<!DOCTYPE html>");
			expect(html).toContain('<html lang="en">');
			expect(html).toContain("<title>Hevy MCP Server</title>");
		});

		it("links to the setup page", async () => {
			const html = await (await get("/")).text();
			expect(html).toContain('href="/setup"');
			expect(html).toContain("Connect your Hevy account");
		});

		it("shows the MCP endpoint URL derived from the request", async () => {
			const html = await (await get("/")).text();
			expect(html).toContain("http://localhost/mcp");
			expect(html).toContain('data-copy="http://localhost/mcp"');
		});

		it("honours X-Forwarded-Host when building the endpoint URL", async () => {
			const html = await (
				await get("/", {
					headers: {
						"X-Forwarded-Host": "hevy.example.com",
						"X-Forwarded-Proto": "https",
					},
				})
			).text();
			expect(html).toContain("https://hevy.example.com/mcp");
		});

		it("documents the current client setup paths", async () => {
			const html = await (await get("/")).text();
			expect(html).toContain("Add custom connector");
			expect(html).toContain(
				"claude mcp add --transport http hevy http://localhost/mcp",
			);
			expect(html).toContain("npx mcp-remote http://localhost/mcp");
		});

		it("lists every tool group", async () => {
			const html = await (await get("/")).text();
			for (const tool of [
				"get_workouts",
				"create_workout",
				"get_routines",
				"update_routine",
				"get_exercise_templates",
				"get_exercise_history",
				"create_routine_folder",
			]) {
				expect(html).toContain(`<code>${tool}</code>`);
			}
		});

		it("includes the footer links", async () => {
			const html = await (await get("/")).text();
			expect(html).toContain('href="/health"');
			expect(html).toContain('href="https://modelcontextprotocol.io/"');
			expect(html).toContain(
				'href="https://developers.cloudflare.com/workers/"',
			);
			expect(html).toContain(`v${VERSION}`);
		});

		it("is responsive and supports dark mode", async () => {
			const html = await (await get("/")).text();
			expect(html).toContain('meta name="viewport"');
			expect(html).toContain("@media (max-width: 640px)");
			expect(html).toContain("@media (prefers-color-scheme: dark)");
		});

		it("opens external links safely", async () => {
			const html = await (await get("/")).text();
			const externalLinks = html.match(/<a [^>]*target="_blank"[^>]*>/g) ?? [];
			expect(externalLinks.length).toBeGreaterThan(0);
			for (const link of externalLinks) {
				expect(link).toContain('rel="noopener noreferrer"');
			}
		});

		it("does not leak secrets", async () => {
			const html = await (await get("/")).text();
			expect(html).not.toContain("api-key");
			expect(html).not.toContain("secret");
			expect(html).not.toMatch(/Bearer [A-Za-z0-9]/);
		});
	});

	describe("Error Handling", () => {
		it("returns 404 for unknown routes", async () => {
			const response = await get("/unknown");
			expect(response.status).toBe(404);
		});
	});
});
