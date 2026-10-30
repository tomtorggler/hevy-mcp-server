import { describe, it, expect, beforeEach } from "vitest";
import githubHandler from "../../src/github-handler.js";
import { computeCodeChallenge } from "../../src/lib/pkce.js";
import { createMemoryKV, type MemoryKV } from "../helpers/memory-kv.js";

const BASE = "http://localhost";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

let kv: MemoryKV;
let env: any;

async function call(path: string, init?: RequestInit) {
	return githubHandler.fetch(
		new Request(`${BASE}${path}`, init),
		env,
		{} as any,
	);
}

async function registerClient(overrides: Record<string, unknown> = {}) {
	const response = await call("/register", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			client_name: "Test Client",
			redirect_uris: ["https://client.example/callback"],
			...overrides,
		}),
	});
	return { response, body: (await response.json()) as any };
}

async function seedSession(token = "session-token", login = "octocat") {
	await kv.put(
		`session:${token}`,
		JSON.stringify({
			login,
			name: "The Octocat",
			email: "o@example.com",
			accessToken: "gh",
			baseUrl: BASE,
		}),
	);
	return token;
}

function authorizeQuery(params: Record<string, string>) {
	return `/authorize?${new URLSearchParams(params).toString()}`;
}

describe("OAuth authorization server", () => {
	beforeEach(() => {
		kv = createMemoryKV();
		env = {
			OAUTH_KV: kv,
			GITHUB_CLIENT_ID: "gh-client",
			GITHUB_CLIENT_SECRET: "gh-secret",
			COOKIE_ENCRYPTION_KEY: "00".repeat(32),
		};
	});

	describe("discovery metadata", () => {
		it("serves protected resource metadata for the MCP endpoint", async () => {
			const response = await call("/.well-known/oauth-protected-resource/mcp");
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				resource: `${BASE}/mcp`,
				authorization_servers: [BASE],
				bearer_methods_supported: ["header"],
				scopes_supported: ["mcp"],
			});
		});

		it("serves root protected resource metadata as a fallback", async () => {
			const body = (await (
				await call("/.well-known/oauth-protected-resource")
			).json()) as any;
			expect(body.resource).toBe(BASE);
			expect(body.authorization_servers).toEqual([BASE]);
		});

		it("advertises PKCE S256, CIMD and iss support", async () => {
			const body = (await (
				await call("/.well-known/oauth-authorization-server")
			).json()) as any;
			expect(body).toMatchObject({
				issuer: BASE,
				authorization_endpoint: `${BASE}/authorize`,
				token_endpoint: `${BASE}/token`,
				registration_endpoint: `${BASE}/register`,
				code_challenge_methods_supported: ["S256"],
				client_id_metadata_document_supported: true,
				authorization_response_iss_parameter_supported: true,
				token_endpoint_auth_methods_supported: ["none"],
			});
		});
	});

	describe("POST /register", () => {
		it("registers a public client and stores its metadata", async () => {
			const { response, body } = await registerClient();
			expect(response.status).toBe(201);
			expect(body.client_id).toMatch(/^[0-9a-f]{32}$/);
			expect(body.client_name).toBe("Test Client");
			expect(body.token_endpoint_auth_method).toBe("none");

			const stored = await kv.get(`client:${body.client_id}`, "json");
			expect(stored).toMatchObject({
				client_name: "Test Client",
				redirect_uris: ["https://client.example/callback"],
			});
		});

		it("rejects missing or invalid redirect_uris", async () => {
			expect(
				(await registerClient({ redirect_uris: [] })).response.status,
			).toBe(400);
			expect(
				(await registerClient({ redirect_uris: ["not-a-url"] })).response
					.status,
			).toBe(400);
			expect(
				(await registerClient({ redirect_uris: undefined })).response.status,
			).toBe(400);
		});

		it("rejects confidential client authentication methods", async () => {
			const { response, body } = await registerClient({
				token_endpoint_auth_method: "client_secret_basic",
			});
			expect(response.status).toBe(400);
			expect(body.error).toBe("invalid_client_metadata");
		});
	});

	describe("GET /authorize", () => {
		let clientId: string;
		let challenge: string;

		beforeEach(async () => {
			clientId = (await registerClient()).body.client_id;
			challenge = await computeCodeChallenge(VERIFIER);
		});

		it("rejects requests without client_id or redirect_uri", async () => {
			const response = await call(authorizeQuery({ client_id: clientId }));
			expect(response.status).toBe(400);
			expect(response.headers.get("Location")).toBeNull();
		});

		it("rejects unknown clients without redirecting", async () => {
			const response = await call(
				authorizeQuery({
					client_id: "unknown",
					redirect_uri: "https://evil.example/cb",
					code_challenge: challenge,
					code_challenge_method: "S256",
				}),
			);
			expect(response.status).toBe(400);
			expect(response.headers.get("Location")).toBeNull();
		});

		it("rejects redirect URIs that are not registered for the client, without redirecting", async () => {
			const response = await call(
				authorizeQuery({
					client_id: clientId,
					redirect_uri: "https://evil.example/cb",
					state: "s",
					code_challenge: challenge,
					code_challenge_method: "S256",
				}),
			);
			expect(response.status).toBe(400);
			expect(response.headers.get("Location")).toBeNull();
			expect(await response.text()).toContain("redirect_uri is not registered");
		});

		it("requires PKCE and reports the error to the validated redirect URI", async () => {
			const response = await call(
				authorizeQuery({
					client_id: clientId,
					redirect_uri: "https://client.example/callback",
					state: "s",
				}),
			);
			expect(response.status).toBe(302);
			const location = new URL(response.headers.get("Location")!);
			expect(location.origin + location.pathname).toBe(
				"https://client.example/callback",
			);
			expect(location.searchParams.get("error")).toBe("invalid_request");
			expect(location.searchParams.get("state")).toBe("s");
			expect(location.searchParams.get("iss")).toBe(BASE);
		});

		it("rejects the plain PKCE method", async () => {
			const response = await call(
				authorizeQuery({
					client_id: clientId,
					redirect_uri: "https://client.example/callback",
					code_challenge: VERIFIER,
					code_challenge_method: "plain",
				}),
			);
			expect(response.status).toBe(302);
			expect(
				new URL(response.headers.get("Location")!).searchParams.get("error"),
			).toBe("invalid_request");
		});

		it("sends unauthenticated users to GitHub and remembers the PKCE challenge", async () => {
			const response = await call(
				authorizeQuery({
					client_id: clientId,
					redirect_uri: "https://client.example/callback",
					state: "client-state",
					code_challenge: challenge,
					code_challenge_method: "S256",
				}),
			);
			expect(response.status).toBe(302);
			const location = new URL(response.headers.get("Location")!);
			expect(location.origin).toBe("https://github.com");
			expect(location.searchParams.get("redirect_uri")).toBe(
				`${BASE}/callback`,
			);

			const stateKey = Array.from(kv.store.keys()).find((k) =>
				k.startsWith("oauth_state:"),
			);
			expect(stateKey).toBeDefined();
			expect(await kv.get(stateKey!, "json")).toMatchObject({
				clientId,
				redirectUri: "https://client.example/callback",
				state: "client-state",
				codeChallenge: challenge,
				codeChallengeMethod: "S256",
			});
		});

		it("shows an escaped consent screen to signed-in users for new clients", async () => {
			const token = await seedSession();
			const evil = (
				await registerClient({ client_name: "<img src=x onerror=alert(1)>" })
			).body.client_id;

			const response = await call(
				authorizeQuery({
					client_id: evil,
					redirect_uri: "https://client.example/callback",
					state: '"><script>',
					code_challenge: challenge,
					code_challenge_method: "S256",
				}),
				{ headers: { Cookie: `session=${token}` } },
			);

			expect(response.status).toBe(200);
			const html = await response.text();
			expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
			expect(html).not.toContain("<img src=x");
			expect(html).not.toContain('"><script>');
			expect(html).toContain('name="code_challenge"');
		});

		it("auto-approves previously approved clients and issues a code with iss", async () => {
			const token = await seedSession();
			await kv.put(`approval:octocat:${clientId}`, "true");

			const response = await call(
				authorizeQuery({
					client_id: clientId,
					redirect_uri: "https://client.example/callback",
					state: "client-state",
					code_challenge: challenge,
					code_challenge_method: "S256",
				}),
				{ headers: { Cookie: `session=${token}` } },
			);

			expect(response.status).toBe(302);
			const location = new URL(response.headers.get("Location")!);
			expect(location.origin + location.pathname).toBe(
				"https://client.example/callback",
			);
			expect(location.searchParams.get("state")).toBe("client-state");
			expect(location.searchParams.get("iss")).toBe(BASE);

			const code = location.searchParams.get("code")!;
			expect(await kv.get(`authcode:${code}`, "json")).toMatchObject({
				clientId,
				sessionToken: token,
				codeChallenge: challenge,
			});
		});

		it("does not auto-approve a previously approved client for an unregistered redirect URI", async () => {
			const token = await seedSession();
			await kv.put(`approval:octocat:${clientId}`, "true");

			const response = await call(
				authorizeQuery({
					client_id: clientId,
					redirect_uri: "https://evil.example/steal",
					code_challenge: challenge,
					code_challenge_method: "S256",
				}),
				{ headers: { Cookie: `session=${token}` } },
			);
			expect(response.status).toBe(400);
			expect(response.headers.get("Location")).toBeNull();
		});
	});

	describe("POST /authorize (consent form)", () => {
		it("re-validates the redirect URI from the form", async () => {
			const token = await seedSession();
			const clientId = (await registerClient()).body.client_id;
			const form = new URLSearchParams({
				approve: "true",
				client_id: clientId,
				redirect_uri: "https://evil.example/steal",
				state: "s",
				scope: "mcp",
				code_challenge: await computeCodeChallenge(VERIFIER),
				code_challenge_method: "S256",
			});
			const response = await call("/authorize", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Cookie: `session=${token}`,
				},
				body: form.toString(),
			});
			expect(response.status).toBe(400);
			expect(response.headers.get("Location")).toBeNull();
		});

		it("redirects with access_denied when the user denies", async () => {
			const token = await seedSession();
			const clientId = (await registerClient()).body.client_id;
			const form = new URLSearchParams({
				approve: "false",
				client_id: clientId,
				redirect_uri: "https://client.example/callback",
				state: "s",
				scope: "mcp",
				code_challenge: await computeCodeChallenge(VERIFIER),
				code_challenge_method: "S256",
			});
			const response = await call("/authorize", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Cookie: `session=${token}`,
				},
				body: form.toString(),
			});
			expect(response.status).toBe(302);
			const location = new URL(response.headers.get("Location")!);
			expect(location.searchParams.get("error")).toBe("access_denied");
			expect(await kv.get(`approval:octocat:${clientId}`)).toBeNull();
		});

		it("records approval and issues a code when the user approves", async () => {
			const token = await seedSession();
			const clientId = (await registerClient()).body.client_id;
			const form = new URLSearchParams({
				approve: "true",
				client_id: clientId,
				redirect_uri: "https://client.example/callback",
				state: "s",
				scope: "mcp",
				code_challenge: await computeCodeChallenge(VERIFIER),
				code_challenge_method: "S256",
			});
			const response = await call("/authorize", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Cookie: `session=${token}`,
				},
				body: form.toString(),
			});
			expect(response.status).toBe(302);
			expect(
				new URL(response.headers.get("Location")!).searchParams.get("code"),
			).toBeTruthy();
			expect(await kv.get(`approval:octocat:${clientId}`)).toBe("true");
		});
	});

	describe("POST /token", () => {
		let clientId: string;
		let sessionToken: string;

		async function seedCode(
			code: string,
			overrides: Record<string, unknown> = {},
		) {
			await kv.put(
				`authcode:${code}`,
				JSON.stringify({
					clientId,
					redirectUri: "https://client.example/callback",
					sessionToken,
					codeChallenge: await computeCodeChallenge(VERIFIER),
					codeChallengeMethod: "S256",
					...overrides,
				}),
			);
		}

		async function exchange(fields: Record<string, string>, asJson = false) {
			const init: RequestInit = asJson
				? {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(fields),
					}
				: {
						method: "POST",
						headers: { "Content-Type": "application/x-www-form-urlencoded" },
						body: new URLSearchParams(fields).toString(),
					};
			const response = await call("/token", init);
			return { response, body: (await response.json()) as any };
		}

		beforeEach(async () => {
			clientId = (await registerClient()).body.client_id;
			sessionToken = await seedSession();
		});

		it("exchanges a valid code + verifier for a fresh access token", async () => {
			await seedCode("good-code");
			const { response, body } = await exchange({
				grant_type: "authorization_code",
				code: "good-code",
				client_id: clientId,
				redirect_uri: "https://client.example/callback",
				code_verifier: VERIFIER,
			});

			expect(response.status).toBe(200);
			expect(response.headers.get("Cache-Control")).toBe("no-store");
			expect(body).toMatchObject({
				token_type: "Bearer",
				scope: "mcp",
				expires_in: 30 * 24 * 60 * 60,
			});
			expect(body.access_token).not.toBe(sessionToken);

			// The new token is a standalone session copied from the browser session
			expect(
				await kv.get(`session:${body.access_token}`, "json"),
			).toMatchObject({ login: "octocat" });
			// Codes are single use
			expect(await kv.get("authcode:good-code")).toBeNull();
		});

		it("accepts a JSON body", async () => {
			await seedCode("json-code");
			const { response } = await exchange(
				{
					grant_type: "authorization_code",
					code: "json-code",
					client_id: clientId,
					redirect_uri: "https://client.example/callback",
					code_verifier: VERIFIER,
				},
				true,
			);
			expect(response.status).toBe(200);
		});

		it("rejects a wrong or missing code_verifier and burns the code", async () => {
			await seedCode("pkce-code");
			const bad = await exchange({
				grant_type: "authorization_code",
				code: "pkce-code",
				client_id: clientId,
				redirect_uri: "https://client.example/callback",
				code_verifier: `${VERIFIER.slice(0, -1)}X`,
			});
			expect(bad.response.status).toBe(400);
			expect(bad.body.error).toBe("invalid_grant");

			const retry = await exchange({
				grant_type: "authorization_code",
				code: "pkce-code",
				client_id: clientId,
				redirect_uri: "https://client.example/callback",
				code_verifier: VERIFIER,
			});
			expect(retry.response.status).toBe(400);
		});

		it("rejects a code presented by a different client or redirect URI", async () => {
			await seedCode("c1");
			expect(
				(
					await exchange({
						grant_type: "authorization_code",
						code: "c1",
						client_id: "someone-else",
						redirect_uri: "https://client.example/callback",
						code_verifier: VERIFIER,
					})
				).body.error,
			).toBe("invalid_grant");

			await seedCode("c2");
			expect(
				(
					await exchange({
						grant_type: "authorization_code",
						code: "c2",
						client_id: clientId,
						redirect_uri: "https://evil.example/cb",
						code_verifier: VERIFIER,
					})
				).body.error,
			).toBe("invalid_grant");
		});

		it("rejects codes issued without PKCE for non-setup clients", async () => {
			await seedCode("no-pkce", {
				codeChallenge: undefined,
				codeChallengeMethod: undefined,
			});
			const { body } = await exchange({
				grant_type: "authorization_code",
				code: "no-pkce",
				client_id: clientId,
				redirect_uri: "https://client.example/callback",
			});
			expect(body.error).toBe("invalid_grant");
		});

		it("rejects unsupported grant types and unknown codes", async () => {
			expect(
				(
					await exchange({
						grant_type: "refresh_token",
						refresh_token: "x",
						client_id: clientId,
					})
				).body.error,
			).toBe("unsupported_grant_type");
			expect(
				(
					await exchange({
						grant_type: "authorization_code",
						code: "nope",
						client_id: clientId,
					})
				).body.error,
			).toBe("invalid_grant");
		});
	});

	describe("web UI session routes", () => {
		it("redirects anonymous visitors of /setup through the setup client", async () => {
			const response = await call("/setup");
			expect(response.status).toBe(302);
			const location = new URL(response.headers.get("Location")!);
			expect(location.pathname).toBe("/authorize");
			expect(location.searchParams.get("client_id")).toBe("setup");
			expect(location.searchParams.get("redirect_uri")).toBe(`${BASE}/setup`);
		});

		it("renders the setup page for signed-in users", async () => {
			const token = await seedSession();
			const response = await call("/setup", {
				headers: { Cookie: `session=${token}` },
			});
			expect(response.status).toBe(200);
			const html = await response.text();
			expect(html).toContain("@octocat");
			expect(html).toContain("No API key yet");
		});

		it("clears the session on logout", async () => {
			const token = await seedSession();
			const response = await call("/logout", {
				headers: { Cookie: `session=${token}` },
			});
			expect(response.status).toBe(302);
			expect(response.headers.get("Location")).toBe("/");
			expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
			expect(await kv.get(`session:${token}`)).toBeNull();
		});

		it("protects the key management API", async () => {
			expect((await call("/api/get-key")).status).toBe(401);
			expect((await call("/api/delete-key", { method: "DELETE" })).status).toBe(
				401,
			);
			expect(
				(
					await call("/api/save-key", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ apiKey: "x" }),
					})
				).status,
			).toBe(401);
		});
	});
});
