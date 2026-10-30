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
	});

	describe("Valid Authentication", () => {
		it("passes through with a valid Bearer token and stores props", async () => {
			const props = {
				login: "testuser",
				baseUrl: BASE,
				accessToken: "access-token",
			};
			mockKV.get.mockResolvedValue(props);

			const ctx = makeContext(requestWith("Bearer valid-token"));
			const next = vi.fn();

			await bearerAuth(ctx as any, next);

			expect(mockKV.get).toHaveBeenCalledWith("session:valid-token", "json");
			expect(ctx.set).toHaveBeenCalledWith("props", props);
			expect(next).toHaveBeenCalled();
			expect(ctx.json).not.toHaveBeenCalled();
		});

		it("accepts tokens with dashes and underscores", async () => {
			mockKV.get.mockResolvedValue({ login: "testuser" });
			const ctx = makeContext(
				requestWith("Bearer token-with-dashes-and_underscores"),
			);

			await bearerAuth(ctx as any, vi.fn());

			expect(mockKV.get).toHaveBeenCalledWith(
				"session:token-with-dashes-and_underscores",
				"json",
			);
		});

		it("treats the Bearer scheme case-insensitively", async () => {
			mockKV.get.mockResolvedValue({ login: "testuser" });
			const ctx = makeContext(requestWith("bearer abc123"));

			await bearerAuth(ctx as any, vi.fn());

			expect(mockKV.get).toHaveBeenCalledWith("session:abc123", "json");
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
		it("returns 401 invalid_token when the session does not exist", async () => {
			mockKV.get.mockResolvedValue(null);
			const ctx = makeContext(requestWith("Bearer invalid-token"));
			const next = vi.fn();

			await bearerAuth(ctx as any, next);

			expect(mockKV.get).toHaveBeenCalledWith("session:invalid-token", "json");
			expect(ctx.json).toHaveBeenCalledWith(
				INVALID_TOKEN_BODY,
				401,
				INVALID_TOKEN_HEADER,
			);
			expect(next).not.toHaveBeenCalled();
		});

		it("returns 401 invalid_token when the session data is not an object", async () => {
			mockKV.get.mockResolvedValue("invalid-session-data");
			const ctx = makeContext(requestWith("Bearer invalid-token"));

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
