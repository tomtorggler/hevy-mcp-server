import { describe, it, expect } from "vitest";
import { escapeHtml, toJsString, renderPage } from "../../src/ui/layout.js";
import { renderApprovalDialog } from "../../src/ui/approval.js";
import { renderSetupPage } from "../../src/ui/setup.js";

describe("escapeHtml", () => {
	it("escapes all HTML-significant characters", () => {
		expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
			"&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;",
		);
	});

	it("handles null, undefined and numbers", () => {
		expect(escapeHtml(null)).toBe("");
		expect(escapeHtml(undefined)).toBe("");
		expect(escapeHtml(42)).toBe("42");
	});
});

describe("toJsString", () => {
	it("produces a JS string literal that cannot close a script tag", () => {
		expect(toJsString("</script><script>alert(1)</script>")).toBe(
			'"\\u003c/script>\\u003cscript>alert(1)\\u003c/script>"',
		);
	});
});

describe("renderPage", () => {
	it("escapes the title and emits the theme tokens", () => {
		const html = renderPage({ title: "<b>Hi</b>", body: "<p>x</p>" }, "1.2.3");
		expect(html).toContain("<title>&lt;b&gt;Hi&lt;/b&gt;</title>");
		expect(html).toContain("--accent:");
		expect(html).toContain("prefers-color-scheme: dark");
		expect(html).toContain("v1.2.3");
	});

	it("omits the top bar when minimalChrome is set", () => {
		const html = renderPage(
			{ title: "t", body: "", minimalChrome: true },
			"1.0.0",
		);
		expect(html).not.toContain('class="topbar"');
	});
});

describe("renderApprovalDialog", () => {
	const base = {
		clientId: "abc",
		clientName: "Friendly Client",
		redirectUri: "https://client.example/callback",
		state: "s",
		scope: "mcp",
		userLogin: "octocat",
		userName: "The Octocat",
		authorizeEndpoint: "/authorize",
		version: "1.0.0",
	};

	it("escapes attacker-controlled request parameters", () => {
		const html = renderApprovalDialog({
			...base,
			clientId: `"><script>alert(1)</script>`,
			clientName: "<img src=x onerror=alert(1)>",
			redirectUri: `https://client.example/cb?x="><svg onload=alert(1)>`,
			state: `"><iframe>`,
		});

		expect(html).not.toContain("<script>alert(1)</script>");
		expect(html).not.toContain("<img src=x");
		expect(html).not.toContain("<svg onload");
		expect(html).not.toContain('"><iframe>');
		expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
	});

	it("carries PKCE parameters through the consent form", () => {
		const html = renderApprovalDialog({
			...base,
			codeChallenge: "abc123",
			codeChallengeMethod: "S256",
		});
		expect(html).toContain('name="code_challenge" value="abc123"');
		expect(html).toContain('name="code_challenge_method" value="S256"');
	});

	it("shows the client name and redirect host to the user", () => {
		const html = renderApprovalDialog(base);
		expect(html).toContain("Friendly Client");
		expect(html).toContain("client.example");
		expect(html).toContain("@octocat");
	});
});

describe("renderSetupPage", () => {
	const options = {
		baseUrl: "https://hevy.example.com",
		version: "1.0.0",
		userName: "The Octocat",
		userLogin: "octocat",
	};

	it("prompts for a key when none is configured", () => {
		const html = renderSetupPage({ ...options, hasApiKey: false });
		expect(html).toContain("No API key yet");
		expect(html).not.toContain('id="deleteBtn"');
		expect(html).not.toContain("Next: add the server");
	});

	it("shows the masked key, remove button and connection URL when configured", () => {
		const html = renderSetupPage({
			...options,
			hasApiKey: true,
			maskedKey: "****abcd",
		});
		expect(html).toContain("API key configured");
		expect(html).toContain("****abcd");
		expect(html).toContain('id="deleteBtn"');
		expect(html).toContain('data-copy="https://hevy.example.com/mcp"');
	});

	it("escapes the GitHub display name", () => {
		const html = renderSetupPage({
			...options,
			userName: "<b>bold</b>",
			hasApiKey: false,
		});
		expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
		expect(html).not.toContain("<b>bold</b>");
	});
});
