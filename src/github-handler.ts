/**
 * OAuth 2.1 authorization server + account setup pages.
 *
 * This worker acts as both the MCP resource server and its own authorization
 * server. Users authenticate with GitHub; MCP clients receive a bearer token
 * scoped to this server. Hevy API keys are stored per user, encrypted, in KV.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import {
	getUpstreamAuthorizeUrl,
	fetchUpstreamAuthToken,
	fetchGitHubUser,
	type BrowserSession,
	type Props,
} from "./utils.js";
import {
	parseRedirectApproval,
	clientIdAlreadyApproved,
	storeClientApproval,
} from "./workers-oauth-utils.js";
import {
	getUserApiKey,
	setUserApiKey,
	deleteUserApiKey,
	maskApiKey,
} from "./lib/key-storage.js";
import { HevyClient } from "./lib/client.js";
import { getBaseUrl, getMcpUrl } from "./lib/base-url.js";
import {
	resolveClient,
	isRedirectUriAllowed,
	validateRedirectUris,
	type RegisteredClientRecord,
	type ResolvedClient,
} from "./lib/oauth-clients.js";
import { isSupportedCodeChallengeMethod, verifyPkce } from "./lib/pkce.js";
import { renderApprovalDialog } from "./ui/approval.js";
import { renderSetupPage } from "./ui/setup.js";
import { VERSION } from "./version.js";

interface Env {
	OAUTH_KV: KVNamespace;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	COOKIE_ENCRYPTION_KEY: string;
}

type AppContext = Context<{ Bindings: Env }>;

const SESSION_COOKIE = "session";
/** Browser sessions written by this version. Never read by bearerAuth. */
const WEB_SESSION_PREFIX = "web_session:";
/**
 * Browser sessions written before 3.2.0. Cookies in the wild still point at
 * these, so they are read (never written) until they expire; bearerAuth reads
 * the same prefix for the same reason. Delete both reads after 2026-12-01.
 */
const LEGACY_SESSION_PREFIX = "session:";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const AUTH_CODE_TTL_SECONDS = 10 * 60;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const CLIENT_REGISTRATION_TTL_SECONDS = 365 * 24 * 60 * 60;
const DEFAULT_SCOPE = "mcp";

/** A validated OAuth authorization request waiting for user consent. */
interface PendingAuthorization {
	clientId: string;
	redirectUri: string;
	state: string;
	scope: string;
	codeChallenge: string;
	codeChallengeMethod: string;
}

/** What we stash in KV while the user is at GitHub. */
type OAuthStateRecord =
	| { kind: "authorize"; pending: PendingAuthorization }
	| { kind: "login"; returnTo: string };

interface AuthCodeRecord {
	clientId: string;
	redirectUri: string;
	sessionToken: string;
	codeChallenge: string;
	codeChallengeMethod: string;
}

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomToken(bytes = 32): string {
	const array = new Uint8Array(bytes);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

function getCookie(c: AppContext, name: string): string | undefined {
	const header = c.req.header("Cookie");
	if (!header) return undefined;
	for (const part of header.split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key === name) return rest.join("=");
	}
	return undefined;
}

function sessionCookie(token: string): string {
	return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

function clearedSessionCookie(): string {
	return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

async function readBrowserSession(
	kv: KVNamespace,
	token: string,
): Promise<BrowserSession | null> {
	const data =
		(await kv.get(`${WEB_SESSION_PREFIX}${token}`, "json")) ??
		(await kv.get(`${LEGACY_SESSION_PREFIX}${token}`, "json"));
	if (!data || typeof data !== "object" || !("login" in data)) return null;
	return data as BrowserSession;
}

async function getSession(
	c: AppContext,
): Promise<{ token: string; session: BrowserSession } | null> {
	const token = getCookie(c, SESSION_COOKIE);
	if (!token) return null;

	const session = await readBrowserSession(c.env.OAUTH_KV, token);
	return session ? { token, session } : null;
}

/** Only same-origin, absolute-path return targets are allowed after login. */
function isSafeReturnPath(path: string): boolean {
	return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}

/** Stash `record` under a fresh state value and send the browser to GitHub. */
async function beginGitHubLogin(
	c: AppContext,
	record: OAuthStateRecord,
): Promise<Response> {
	const githubState = randomToken(16);
	await c.env.OAUTH_KV.put(
		`oauth_state:${githubState}`,
		JSON.stringify(record),
		{ expirationTtl: OAUTH_STATE_TTL_SECONDS },
	);

	const callbackUri = `${getBaseUrl(c.req)}/callback`;
	return c.redirect(
		getUpstreamAuthorizeUrl(
			c.env.GITHUB_CLIENT_ID,
			callbackUri,
			githubState,
			"user:email",
		),
	);
}

async function issueAuthCode(
	kv: KVNamespace,
	record: AuthCodeRecord,
): Promise<string> {
	const code = randomToken();
	await kv.put(`authcode:${code}`, JSON.stringify(record), {
		expirationTtl: AUTH_CODE_TTL_SECONDS,
	});
	return code;
}

/** Build the redirect back to the client (success). Includes `iss` per RFC 9207. */
function successRedirect(
	pending: PendingAuthorization,
	code: string,
	issuer: string,
): string {
	const url = new URL(pending.redirectUri);
	url.searchParams.set("code", code);
	if (pending.state) url.searchParams.set("state", pending.state);
	url.searchParams.set("iss", issuer);
	return url.toString();
}

/** Build the redirect back to the client (error). Only used after redirect_uri was validated. */
function errorRedirect(
	target: { redirectUri: string; state: string },
	error: string,
	description: string,
	issuer: string,
): string {
	const url = new URL(target.redirectUri);
	url.searchParams.set("error", error);
	url.searchParams.set("error_description", description);
	if (target.state) url.searchParams.set("state", target.state);
	url.searchParams.set("iss", issuer);
	return url.toString();
}

type ValidationResult =
	| { ok: true; client: ResolvedClient; pending: PendingAuthorization }
	| { ok: false; response: Response };

/**
 * Validate the client_id / redirect_uri pair and PKCE parameters of an
 * authorization request. Errors in client_id or redirect_uri MUST NOT redirect
 * (RFC 6749 §4.1.2.1), so they are returned as plain 400 responses. PKCE
 * errors are reported to the (now validated) redirect URI.
 */
async function validateAuthorizationRequest(
	c: AppContext,
	params: {
		clientId?: string;
		redirectUri?: string;
		state?: string;
		scope?: string;
		codeChallenge?: string;
		codeChallengeMethod?: string;
	},
): Promise<ValidationResult> {
	const baseUrl = getBaseUrl(c.req);
	const { clientId, redirectUri } = params;

	if (!clientId || !redirectUri) {
		return {
			ok: false,
			response: c.text(
				"Missing required parameters: client_id and redirect_uri",
				400,
			),
		};
	}

	const client = await resolveClient(c.env.OAUTH_KV, clientId);
	if (!client) {
		return {
			ok: false,
			response: c.text(
				"Unknown client_id. Register the client first (POST /register) or use a Client ID Metadata Document URL.",
				400,
			),
		};
	}

	if (!isRedirectUriAllowed(redirectUri, client.redirectUris)) {
		return {
			ok: false,
			response: c.text("redirect_uri is not registered for this client", 400),
		};
	}

	const target = { redirectUri, state: params.state ?? "" };

	// OAuth 2.1 / MCP: PKCE with S256 is mandatory for every client.
	if (!params.codeChallenge) {
		return {
			ok: false,
			response: c.redirect(
				errorRedirect(
					target,
					"invalid_request",
					"code_challenge is required (PKCE)",
					baseUrl,
				),
			),
		};
	}
	// RFC 7636: a missing method means "plain", which OAuth 2.1 forbids.
	if (!isSupportedCodeChallengeMethod(params.codeChallengeMethod)) {
		return {
			ok: false,
			response: c.redirect(
				errorRedirect(
					target,
					"invalid_request",
					"code_challenge_method must be S256",
					baseUrl,
				),
			),
		};
	}

	return {
		ok: true,
		client,
		pending: {
			clientId,
			redirectUri,
			state: target.state,
			scope: params.scope || DEFAULT_SCOPE,
			codeChallenge: params.codeChallenge,
			codeChallengeMethod: params.codeChallengeMethod,
		},
	};
}

async function completeAuthorization(
	c: AppContext,
	pending: PendingAuthorization,
	sessionToken: string,
	extraHeaders: Record<string, string> = {},
): Promise<Response> {
	const baseUrl = getBaseUrl(c.req);
	const code = await issueAuthCode(c.env.OAUTH_KV, {
		clientId: pending.clientId,
		redirectUri: pending.redirectUri,
		sessionToken,
		codeChallenge: pending.codeChallenge,
		codeChallengeMethod: pending.codeChallengeMethod,
	});

	const response = c.redirect(successRedirect(pending, code, baseUrl));
	for (const [key, value] of Object.entries(extraHeaders)) {
		response.headers.set(key, value);
	}
	return response;
}

function approvalDialog(
	c: AppContext,
	client: ResolvedClient,
	pending: PendingAuthorization,
	user: { login: string; name: string },
	extraHeaders: Record<string, string> = {},
): Response {
	const html = renderApprovalDialog({
		clientId: client.clientId,
		clientName: client.clientName,
		clientUri: client.clientUri,
		redirectUri: pending.redirectUri,
		state: pending.state,
		scope: pending.scope,
		codeChallenge: pending.codeChallenge,
		codeChallengeMethod: pending.codeChallengeMethod,
		userLogin: user.login,
		userName: user.name || user.login,
		authorizeEndpoint: "/authorize",
		version: VERSION,
	});
	const response = c.html(html);
	for (const [key, value] of Object.entries(extraHeaders)) {
		response.headers.set(key, value);
	}
	return response;
}

// ---------------------------------------------------------------------------
// Discovery metadata
// ---------------------------------------------------------------------------

function protectedResourceMetadata(baseUrl: string, resource: string) {
	return {
		resource,
		authorization_servers: [baseUrl],
		bearer_methods_supported: ["header"],
		scopes_supported: [DEFAULT_SCOPE],
		resource_name: "Hevy MCP Server",
		resource_documentation: `${baseUrl}/`,
	};
}

/**
 * RFC 9728 Protected Resource Metadata for the MCP endpoint (path-suffixed
 * well-known URI, which clients try first) and at the root as a fallback.
 */
app.get("/.well-known/oauth-protected-resource/mcp", (c) => {
	const baseUrl = getBaseUrl(c.req);
	return c.json(protectedResourceMetadata(baseUrl, getMcpUrl(baseUrl)));
});

app.get("/.well-known/oauth-protected-resource", (c) => {
	const baseUrl = getBaseUrl(c.req);
	return c.json(protectedResourceMetadata(baseUrl, baseUrl));
});

/** RFC 8414 Authorization Server Metadata. */
app.get("/.well-known/oauth-authorization-server", (c) => {
	const baseUrl = getBaseUrl(c.req);
	return c.json({
		issuer: baseUrl,
		authorization_endpoint: `${baseUrl}/authorize`,
		token_endpoint: `${baseUrl}/token`,
		registration_endpoint: `${baseUrl}/register`,
		scopes_supported: [DEFAULT_SCOPE],
		response_types_supported: ["code"],
		response_modes_supported: ["query"],
		grant_types_supported: ["authorization_code"],
		token_endpoint_auth_methods_supported: ["none"],
		code_challenge_methods_supported: ["S256"],
		client_id_metadata_document_supported: true,
		authorization_response_iss_parameter_supported: true,
		service_documentation: `${baseUrl}/`,
	});
});

// ---------------------------------------------------------------------------
// Authorization endpoint
// ---------------------------------------------------------------------------

app.get("/authorize", async (c) => {
	const validation = await validateAuthorizationRequest(c, {
		clientId: c.req.query("client_id"),
		redirectUri: c.req.query("redirect_uri"),
		state: c.req.query("state"),
		scope: c.req.query("scope"),
		codeChallenge: c.req.query("code_challenge"),
		codeChallengeMethod: c.req.query("code_challenge_method"),
	});
	if (!validation.ok) return validation.response;
	const { client, pending } = validation;

	const current = await getSession(c);
	if (current) {
		const approved = await clientIdAlreadyApproved(
			c.env.OAUTH_KV,
			current.session.login,
			client.clientId,
		);
		if (approved) {
			return completeAuthorization(c, pending, current.token);
		}
		return approvalDialog(c, client, pending, current.session);
	}

	// Not signed in: stash the request and bounce through GitHub.
	return beginGitHubLogin(c, { kind: "authorize", pending });
});

/** Consent form submission. */
app.post("/authorize", async (c) => {
	const approval = await parseRedirectApproval(c.req.raw);

	const current = await getSession(c);
	if (!current) {
		return c.text(
			"No session found. Please start the authorization again.",
			401,
		);
	}

	// Re-validate: hidden form fields are under the user's control.
	const validation = await validateAuthorizationRequest(c, {
		clientId: approval.clientId,
		redirectUri: approval.redirectUri,
		state: approval.state,
		scope: approval.scope,
		codeChallenge: approval.codeChallenge,
		codeChallengeMethod: approval.codeChallengeMethod,
	});
	if (!validation.ok) return validation.response;
	const { client, pending } = validation;

	if (!approval.approved) {
		return c.redirect(
			errorRedirect(
				pending,
				"access_denied",
				"The user denied the request",
				getBaseUrl(c.req),
			),
		);
	}

	await storeClientApproval(
		c.env.OAUTH_KV,
		current.session.login,
		client.clientId,
	);
	return completeAuthorization(c, pending, current.token);
});

/** GitHub OAuth callback, shared by MCP authorization and plain web sign-in. */
app.get("/callback", async (c) => {
	const code = c.req.query("code");
	const state = c.req.query("state");

	if (!code || !state) {
		return c.text("Missing code or state parameter", 400);
	}

	const stateKey = `oauth_state:${state}`;
	const record = await c.env.OAUTH_KV.get<OAuthStateRecord>(stateKey, "json");
	if (!record || typeof record !== "object" || !("kind" in record)) {
		return c.text(
			"Invalid or expired state parameter. Please start again.",
			400,
		);
	}
	await c.env.OAUTH_KV.delete(stateKey);

	const baseUrl = getBaseUrl(c.req);

	try {
		const accessToken = await fetchUpstreamAuthToken(
			code,
			c.env.GITHUB_CLIENT_ID,
			c.env.GITHUB_CLIENT_SECRET,
			`${baseUrl}/callback`,
		);
		const user = await fetchGitHubUser(accessToken);

		const sessionToken = randomToken();
		const session: BrowserSession = {
			login: user.login,
			name: user.name,
			email: user.email,
			accessToken,
			baseUrl,
		};
		await c.env.OAUTH_KV.put(
			`${WEB_SESSION_PREFIX}${sessionToken}`,
			JSON.stringify(session),
			{ expirationTtl: SESSION_TTL_SECONDS },
		);
		const cookieHeaders = { "Set-Cookie": sessionCookie(sessionToken) };

		if (record.kind === "login") {
			const returnTo = isSafeReturnPath(record.returnTo)
				? record.returnTo
				: "/";
			const response = c.redirect(returnTo);
			response.headers.set("Set-Cookie", cookieHeaders["Set-Cookie"]);
			return response;
		}

		const { pending } = record;

		// The client was validated before we left for GitHub, but resolve it
		// again for the consent screen and in case its registration vanished.
		const client = await resolveClient(c.env.OAUTH_KV, pending.clientId);
		if (
			!client ||
			!isRedirectUriAllowed(pending.redirectUri, client.redirectUris)
		) {
			return c.text(
				"The requesting client is no longer valid. Please start the authorization again.",
				400,
			);
		}

		const approved = await clientIdAlreadyApproved(
			c.env.OAUTH_KV,
			user.login,
			client.clientId,
		);
		if (approved) {
			return completeAuthorization(c, pending, sessionToken, cookieHeaders);
		}
		return approvalDialog(c, client, pending, user, cookieHeaders);
	} catch (error) {
		console.error("OAuth callback error:", error);
		return c.text(
			`OAuth error: ${error instanceof Error ? error.message : "Unknown error"}`,
			500,
		);
	}
});

// ---------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------

async function readTokenRequest(
	c: AppContext,
): Promise<Record<string, string>> {
	const contentType = c.req.header("Content-Type") || "";
	if (contentType.includes("application/json")) {
		const body = (await c.req.json()) as Record<string, unknown>;
		return Object.fromEntries(
			Object.entries(body).filter(([, v]) => typeof v === "string") as [
				string,
				string,
			][],
		);
	}
	const form = await c.req.formData();
	const result: Record<string, string> = {};
	form.forEach((value, key) => {
		if (typeof value === "string") result[key] = value;
	});
	return result;
}

function tokenError(
	c: AppContext,
	status: 400 | 401 | 500,
	error: string,
	description: string,
): Response {
	return c.json({ error, error_description: description }, status, {
		"Cache-Control": "no-store",
		Pragma: "no-cache",
	});
}

app.post("/token", async (c) => {
	let params: Record<string, string>;
	try {
		params = await readTokenRequest(c);
	} catch {
		return tokenError(
			c,
			400,
			"invalid_request",
			"Malformed token request body",
		);
	}

	const { grant_type, code, redirect_uri, client_id, code_verifier } = params;

	if (grant_type !== "authorization_code") {
		return tokenError(
			c,
			400,
			"unsupported_grant_type",
			"Only the authorization_code grant type is supported",
		);
	}
	if (!code || !client_id) {
		return tokenError(
			c,
			400,
			"invalid_request",
			"Missing required parameters: code and client_id",
		);
	}

	const codeKey = `authcode:${code}`;
	const record = await c.env.OAUTH_KV.get<AuthCodeRecord>(codeKey, "json");
	if (!record || typeof record !== "object") {
		return tokenError(
			c,
			400,
			"invalid_grant",
			"Invalid or expired authorization code",
		);
	}
	// Authorization codes are single-use, regardless of the outcome below.
	await c.env.OAUTH_KV.delete(codeKey);

	if (client_id !== record.clientId) {
		return tokenError(
			c,
			400,
			"invalid_grant",
			"client_id does not match the authorization request",
		);
	}
	if (redirect_uri !== undefined && redirect_uri !== record.redirectUri) {
		return tokenError(
			c,
			400,
			"invalid_grant",
			"redirect_uri does not match the authorization request",
		);
	}

	const pkceOk =
		Boolean(record.codeChallenge) &&
		(await verifyPkce(
			code_verifier,
			record.codeChallenge,
			record.codeChallengeMethod,
		));
	if (!pkceOk) {
		return tokenError(c, 400, "invalid_grant", "PKCE verification failed");
	}

	const session = await readBrowserSession(c.env.OAUTH_KV, record.sessionToken);
	if (!session) {
		return tokenError(
			c,
			400,
			"invalid_grant",
			"The user session has expired. Please authorize again.",
		);
	}

	// The access token is its own credential: identity only, no GitHub token,
	// stored under a separate prefix from browser sessions.
	const identity: Props = {
		login: session.login,
		name: session.name,
		email: session.email,
		baseUrl: session.baseUrl,
	};
	const accessToken = randomToken();
	await c.env.OAUTH_KV.put(`token:${accessToken}`, JSON.stringify(identity), {
		expirationTtl: ACCESS_TOKEN_TTL_SECONDS,
	});

	return c.json(
		{
			access_token: accessToken,
			token_type: "Bearer",
			expires_in: ACCESS_TOKEN_TTL_SECONDS,
			scope: DEFAULT_SCOPE,
		},
		200,
		{ "Cache-Control": "no-store", Pragma: "no-cache" },
	);
});

// ---------------------------------------------------------------------------
// Dynamic client registration (RFC 7591) - deprecated by MCP but still widely used
// ---------------------------------------------------------------------------

app.post("/register", async (c) => {
	let body: Record<string, unknown>;
	try {
		body = (await c.req.json()) as Record<string, unknown>;
	} catch {
		return c.json(
			{
				error: "invalid_client_metadata",
				error_description: "Body must be JSON",
			},
			400,
		);
	}

	const redirectUris = validateRedirectUris(body.redirect_uris);
	if (!redirectUris) {
		return c.json(
			{
				error: "invalid_redirect_uri",
				error_description:
					"redirect_uris must be a non-empty array of absolute URLs",
			},
			400,
		);
	}

	const authMethod = body.token_endpoint_auth_method;
	if (authMethod !== undefined && authMethod !== "none") {
		return c.json(
			{
				error: "invalid_client_metadata",
				error_description:
					'Only public clients (token_endpoint_auth_method "none") are supported',
			},
			400,
		);
	}

	const clientName =
		typeof body.client_name === "string"
			? body.client_name.slice(0, 200)
			: undefined;
	const clientUri =
		typeof body.client_uri === "string" && /^https?:\/\//.test(body.client_uri)
			? body.client_uri
			: undefined;
	const applicationType =
		typeof body.application_type === "string"
			? body.application_type
			: undefined;

	const clientId = randomToken(16);
	const record: RegisteredClientRecord = {
		client_id: clientId,
		client_name: clientName,
		client_uri: clientUri,
		redirect_uris: redirectUris,
		application_type: applicationType,
		created_at: new Date().toISOString(),
	};
	await c.env.OAUTH_KV.put(`client:${clientId}`, JSON.stringify(record), {
		expirationTtl: CLIENT_REGISTRATION_TTL_SECONDS,
	});

	return c.json(
		{
			client_id: clientId,
			client_id_issued_at: Math.floor(Date.now() / 1000),
			client_name: clientName,
			client_uri: clientUri,
			redirect_uris: redirectUris,
			grant_types: ["authorization_code"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		},
		201,
	);
});

// ---------------------------------------------------------------------------
// Web UI: session + API key management
// ---------------------------------------------------------------------------

app.get("/logout", async (c) => {
	const token = getCookie(c, SESSION_COOKIE);
	if (token) {
		await Promise.all([
			c.env.OAUTH_KV.delete(`${WEB_SESSION_PREFIX}${token}`),
			c.env.OAUTH_KV.delete(`${LEGACY_SESSION_PREFIX}${token}`),
		]);
	}
	const response = c.redirect("/");
	response.headers.set("Set-Cookie", clearedSessionCookie());
	return response;
});

app.get("/setup", async (c) => {
	const baseUrl = getBaseUrl(c.req);
	const current = await getSession(c);

	if (!current) {
		// Plain web sign-in: no OAuth client, no code, no consent screen.
		return beginGitHubLogin(c, { kind: "login", returnTo: "/setup" });
	}

	const apiKey = await getUserApiKey(
		c.env.OAUTH_KV,
		c.env.COOKIE_ENCRYPTION_KEY,
		current.session.login,
	);

	return c.html(
		renderSetupPage({
			baseUrl,
			version: VERSION,
			userName: current.session.name || current.session.login,
			userLogin: current.session.login,
			hasApiKey: Boolean(apiKey),
			maskedKey: apiKey ? maskApiKey(apiKey) : null,
		}),
	);
});

async function readApiKeyBody(c: AppContext): Promise<string | null> {
	try {
		const body = (await c.req.json()) as { apiKey?: unknown };
		return typeof body.apiKey === "string" && body.apiKey.trim()
			? body.apiKey.trim()
			: null;
	} catch {
		return null;
	}
}

app.post("/api/test-key", async (c) => {
	const current = await getSession(c);
	if (!current) return c.json({ error: "Unauthorized" }, 401);

	const apiKey = await readApiKeyBody(c);
	if (!apiKey)
		return c.json({ error: "Invalid request: apiKey is required" }, 400);

	try {
		await new HevyClient({ apiKey }).getWorkouts({ pageSize: 1 });
		return c.json({ valid: true });
	} catch (error) {
		console.error("API key test error:", error);
		return c.json(
			{ error: error instanceof Error ? error.message : "Invalid API key" },
			400,
		);
	}
});

app.post("/api/save-key", async (c) => {
	const current = await getSession(c);
	if (!current) return c.json({ error: "Unauthorized" }, 401);

	const apiKey = await readApiKeyBody(c);
	if (!apiKey)
		return c.json({ error: "Invalid request: apiKey is required" }, 400);

	try {
		await new HevyClient({ apiKey }).getWorkouts({ pageSize: 1 });
		await setUserApiKey(
			c.env.OAUTH_KV,
			c.env.COOKIE_ENCRYPTION_KEY,
			current.session.login,
			apiKey,
		);
		return c.json({ success: true });
	} catch (error) {
		console.error("API key save error:", error);
		return c.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to save API key",
			},
			400,
		);
	}
});

app.get("/api/get-key", async (c) => {
	const current = await getSession(c);
	if (!current) return c.json({ error: "Unauthorized" }, 401);

	try {
		const apiKey = await getUserApiKey(
			c.env.OAUTH_KV,
			c.env.COOKIE_ENCRYPTION_KEY,
			current.session.login,
		);
		if (!apiKey) return c.json({ configured: false });
		return c.json({ configured: true, maskedKey: maskApiKey(apiKey) });
	} catch (error) {
		console.error("API key retrieval error:", error);
		return c.json({ error: "Failed to retrieve API key status" }, 500);
	}
});

app.delete("/api/delete-key", async (c) => {
	const current = await getSession(c);
	if (!current) return c.json({ error: "Unauthorized" }, 401);

	try {
		await deleteUserApiKey(c.env.OAUTH_KV, current.session.login);
		return c.json({ success: true });
	} catch (error) {
		console.error("API key deletion error:", error);
		return c.json({ error: "Failed to delete API key" }, 500);
	}
});

export default app;
