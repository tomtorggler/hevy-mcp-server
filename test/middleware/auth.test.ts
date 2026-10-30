import { describe, it, expect, beforeEach, vi } from "vitest";
import { bearerAuth } from "../../src/middleware/auth.js";

const mockKV = {
	get: vi.fn(),
	put: vi.fn(),
	delete: vi.fn(),
};

const BASE = "http://localhost";
const RESOURCE_METADATA = `${BASE}/.well-known/oauth-protected-resource/mcp`;

function makeContext(request: Request) {
	return {
		req: {
			header: (name: string) => request.headers.get(name) ?? undefined,
			url: request.url,
		},
		env: { OAUTH_KV: mockKV },
		set: vi.fn(),
		json: vi.fn().mockReturnValue(new Response()),
	};
}

function requestWith(authorization?: string) {
	return new Request(`${BASE}/mcp`, {
		method: "POST",
		headers: authorization ? { Authorization: authorization } : {},
	});
}

/** KV stub keyed by full key name. */
function kvWith(records: Record<string, unknown>) {
	mockKV.get.mockImplementation(async (key: string) => records[key] ?? null);
}

const MISSING_TOKEN_BODY = {
	error: "unauthorized",
	message:
		"Authentication required. Provide an OAuth access token as a Bearer token.",
};
const MISSING_TOKEN_HEADER = {
	"WWW-Authenticate": `Bearer realm="${BASE}", resource_metadata="${RESOURCE_METADATA}", scope="mcp"`,
};
const INVALID_TOKEN_BODY = {
	error: "unauthorized",
	message: "Invalid or expired token.",
};
const INVALID_TOKEN_HEADER = {
	"WWW-Authenticate": `Bearer realm="${BASE}", error="invalid_token", error_description="The access token is invalid or has expired", resource_metadata="${RESOURCE_METADATA}", scope="mcp"`,
};

describe("Bearer Auth Middleware", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockKV.get.mockReset();
	});

	describe("Valid Authentication", () => {
		it("resolves a minted access token and stores identity props", async () => {
			const identity = {
				login: "testuser",
				name: "Test User",
				email: "t@example.com",
				baseUrl: BASE,
			};
			kvWith({ "token:valid-token": identity });

			const ctx = makeContext(requestWith("Bearer valid-token"));
			const next = vi.fn();

			await bearerAuth(ctx as any, next);

			expect(mockKV.get).toHaveBeenCalledWith("token:valid-token", "json");
			expect(ctx.set).toHaveBeenCalledWith("props", identity);
			expect(next).toHaveBeenCalled();
			expect(ctx.json).not.toHaveBeenCalled();
		});

		it("accepts legacy session tokens but strips the GitHub access token", async () => {
			kvWith({
				"session:legacy-token": {
					login: "testuser",
					name: "Test User",
					email: "t@example.com",
					accessToken: "gho_secret",
					baseUrl: BASE,
				},
			});

			const ctx = makeContext(requestWith("Bearer legacy-token"));
			await bearerAuth(ctx as any, vi.fn());

			expect(mockKV.get).toHaveBeenCalledWith("token:legacy-token", "json");
			expect(mockKV.get).toHaveBeenCalledWith("session:legacy-token", "json");
			const props = ctx.set.mock.calls[0][1];
			expect(props).toEqual({
				login: "testuser",
				name: "Test User",
				email: "t@example.com",
				baseUrl: BASE,
			});
			expect(props).not.toHaveProperty("accessToken");
		});

		it("accepts tokens with dashes and underscores", async () => {
			kvWith({
				"token:token-with-dashes-and_underscores": { login: "testuser" },
			});
			const ctx = makeContext(
				requestWith("Bearer token-with-dashes-and_underscores"),
			);

			await bearerAuth(ctx as any, vi.fn());

			expect(mockKV.get).toHaveBeenCalledWith(
				"token:token-with-dashes-and_underscores",
				"json",
			);
		});

		it("treats the Bearer scheme case-insensitively", async () => {
			kvWith({ "token:abc123": { login: "testuser" } });
			const ctx = makeContext(requestWith("bearer abc123"));

			await bearerAuth(ctx as any, vi.fn());

			expect(mockKV.get).toHaveBeenCalledWith("token:abc123", "json");
		});
	});

	describe("Missing credentials", () => {
		it.each([
			["no Authorization header", undefined],
			["a non-Bearer scheme", "Basic invalid-format"],
			["an empty Bearer token", "Bearer "],
			["a bare Bearer keyword", "Bearer"],
		])(
			"returns 401 with a discovery challenge for %s",
			async (_label, authorization) => {
				const ctx = makeContext(requestWith(authorization));
				const next = vi.fn();

				await bearerAuth(ctx as any, next);

				expect(ctx.json).toHaveBeenCalledWith(
					MISSING_TOKEN_BODY,
					401,
					MISSING_TOKEN_HEADER,
				);
				expect(mockKV.get).not.toHaveBeenCalled();
				expect(next).not.toHaveBeenCalled();
			},
		);

		it("does not include an error code when no credentials were presented (RFC 6750 §3.1)", async () => {
			const ctx = makeContext(requestWith());
			await bearerAuth(ctx as any, vi.fn());

			const header = ctx.json.mock.calls[0][2]["WWW-Authenticate"];
			expect(header).not.toContain("error=");
			expect(header).toContain(`resource_metadata="${RESOURCE_METADATA}"`);
		});
	});

	describe("Invalid tokens", () => {
		it("does not accept a browser session cookie value as a bearer token", async () => {
			kvWith({
				"web_session:cookie-value": {
					login: "testuser",
					accessToken: "gho_secret",
				},
			});
			const ctx = makeContext(requestWith("Bearer cookie-value"));
			const next = vi.fn();

			await bearerAuth(ctx as any, next);

			expect(ctx.json).toHaveBeenCalledWith(
				INVALID_TOKEN_BODY,
				401,
				INVALID_TOKEN_HEADER,
			);
			expect(mockKV.get).not.toHaveBeenCalledWith(
				"web_session:cookie-value",
				"json",
			);
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 401 invalid_token when neither record exists", async () => {
			kvWith({});
			const ctx = makeContext(requestWith("Bearer invalid-token"));
			const next = vi.fn();

			await bearerAuth(ctx as any, next);

			expect(ctx.json).toHaveBeenCalledWith(
				INVALID_TOKEN_BODY,
				401,
				INVALID_TOKEN_HEADER,
			);
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 401 invalid_token when the record has no login", async () => {
			kvWith({ "token:odd": "invalid-session-data" });
			const ctx = makeContext(requestWith("Bearer odd"));

			await bearerAuth(ctx as any, vi.fn());

			expect(ctx.json).toHaveBeenCalledWith(
				INVALID_TOKEN_BODY,
				401,
				INVALID_TOKEN_HEADER,
			);
		});
	});

	describe("Error Handling", () => {
		it("propagates KV storage errors", async () => {
			mockKV.get.mockRejectedValue(new Error("KV storage error"));
			const ctx = makeContext(requestWith("Bearer test-token"));

			await expect(bearerAuth(ctx as any, vi.fn())).rejects.toThrow(
				"KV storage error",
			);
		});
	});
});
