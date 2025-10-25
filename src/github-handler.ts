/**
 * GitHub OAuth Handler
 * Handles OAuth authorization flow for multi-user authentication
 */

import { Hono } from "hono";
import {
	getUpstreamAuthorizeUrl,
	fetchUpstreamAuthToken,
	fetchGitHubUser,
	type Props,
} from "./utils.js";
import {
	renderApprovalDialog,
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

interface Env {
	OAUTH_KV: KVNamespace;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	COOKIE_ENCRYPTION_KEY: string;
}

// Create Hono app for OAuth routes
const app = new Hono<{ Bindings: Env }>();

// Add CORS middleware for all routes
app.use("*", async (c, next) => {
	// Handle OPTIONS preflight requests
	if (c.req.method === "OPTIONS") {
		return new Response(null, {
			status: 204,
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type, Authorization",
				"Access-Control-Max-Age": "86400",
			},
		});
	}

	await next();

	// Add CORS headers to all responses
	c.res.headers.set("Access-Control-Allow-Origin", "*");
	c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
	c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
});

/**
 * Generate a random state parameter for OAuth
 */
function generateState(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Helper function to get the base URL for OAuth endpoints
 * Handles local development where Wrangler rewrites the Host header
 */
function getBaseUrl(c: any): string {
	const url = new URL(c.req.url);

	// Check for X-Forwarded-Host header (reverse proxy)
	const forwardedHost = c.req.header("X-Forwarded-Host");
	if (forwardedHost) {
		return `${url.protocol}//${forwardedHost}`;
	}

	// Check if request came from localhost (local dev)
	// Wrangler dev adds CF-Connecting-IP with localhost address
	const cfConnectingIp = c.req.header("CF-Connecting-IP");

	// Check if connecting from localhost (::1 is IPv6 localhost, 127.0.0.1 is IPv4)
	const isLocalhost = cfConnectingIp === "::1" || cfConnectingIp === "127.0.0.1" || cfConnectingIp?.startsWith("127.");

	if (isLocalhost) {
		return `${url.protocol}//localhost:8787`;
	}

	// Production: use the Host header as-is
	return `${url.protocol}//${url.host}`;
}

/**
 * GET /.well-known/oauth-protected-resource
 * OAuth 2.0 Resource Server Metadata (RFC 8707)
 * Tells clients how to access the protected resource
 */
app.get("/.well-known/oauth-protected-resource", (c) => {
	const baseUrl = getBaseUrl(c);

	const response = c.json({
		resource: baseUrl,
		authorization_servers: [`${baseUrl}`],
		bearer_methods_supported: ["header"],
		resource_documentation: `${baseUrl}/`,
	});

	response.headers.set("Access-Control-Allow-Origin", "*");
	return response;
});

/**
 * GET /.well-known/oauth-authorization-server
 * OAuth 2.1 Authorization Server Metadata (RFC 8414)
 * Allows clients to discover OAuth configuration automatically
 */
app.get("/.well-known/oauth-authorization-server", (c) => {
	const baseUrl = getBaseUrl(c);

	const response = c.json({
		issuer: baseUrl,
		authorization_endpoint: `${baseUrl}/authorize`,
		token_endpoint: `${baseUrl}/token`,
		registration_endpoint: `${baseUrl}/register`,
		scopes_supported: ["mcp"],
		response_types_supported: ["code"],
		grant_types_supported: ["authorization_code"],
		token_endpoint_auth_methods_supported: ["none"], // Public client
		code_challenge_methods_supported: ["S256"], // PKCE support
		revocation_endpoint_auth_methods_supported: ["none"],
		service_documentation: `${baseUrl}/`,
	});

	response.headers.set("Access-Control-Allow-Origin", "*");
	return response;
});

/**
 * GET /authorize
 * OAuth authorization endpoint - initiates GitHub OAuth flow
 */
app.get("/authorize", async (c) => {
	const clientId = c.req.query("client_id");
	const redirectUri = c.req.query("redirect_uri");
	const state = c.req.query("state");
	const scope = c.req.query("scope") || "mcp";

	if (!clientId || !redirectUri || !state) {
		return c.text("Missing required parameters: client_id, redirect_uri, or state", 400);
	}

	// Check if user is already authenticated (has session cookie)
	const sessionCookie = c.req.header("Cookie");
	const sessionToken = sessionCookie?.match(/session=([^;]+)/)?.[1];

	if (sessionToken) {
		// User is already authenticated, check if client is already approved
		const sessionData = await c.env.OAUTH_KV.get(`session:${sessionToken}`, "json");

		if (sessionData && typeof sessionData === "object" && "login" in sessionData) {
			const username = (sessionData as { login: string }).login;
			const alreadyApproved = await clientIdAlreadyApproved(c.env.OAUTH_KV, username, clientId);

			if (alreadyApproved) {
				// Auto-approve and redirect
				const authCode = generateState();
				await c.env.OAUTH_KV.put(
					`authcode:${authCode}`,
					JSON.stringify({
						clientId,
						redirectUri,
						sessionToken,
					}),
					{ expirationTtl: 600 } // 10 minutes
				);

				const redirectUrl = new URL(redirectUri);
				redirectUrl.searchParams.set("code", authCode);
				redirectUrl.searchParams.set("state", state);

				return c.redirect(redirectUrl.toString());
			}

			// Show approval dialog
			const html = renderApprovalDialog({
				clientId,
				redirectUri,
				state,
				scope,
				userLogin: username,
				userName: (sessionData as { name?: string }).name || username,
				authorizeEndpoint: "/authorize",
			});

			return c.html(html);
		}
	}

	// User not authenticated, redirect to GitHub OAuth
	const githubState = generateState();

	// Store OAuth state and client info
	await c.env.OAUTH_KV.put(
		`oauth_state:${githubState}`,
		JSON.stringify({
			clientId,
			redirectUri,
			state,
			scope,
		}),
		{ expirationTtl: 600 } // 10 minutes
	);

	const url = new URL(c.req.url);
	const callbackUri = `${url.protocol}//${url.host}/callback`;

	const githubAuthUrl = getUpstreamAuthorizeUrl(
		c.env.GITHUB_CLIENT_ID,
		callbackUri,
		githubState,
		"user:email"
	);

	return c.redirect(githubAuthUrl);
});

/**
 * POST /authorize
 * Handles approval form submission
 */
app.post("/authorize", async (c) => {
	const approval = await parseRedirectApproval(c.req.raw);

	if (!approval.approved) {
		return c.text("Authorization denied", 403);
	}

	// Get session from cookie
	const sessionCookie = c.req.header("Cookie");
	const sessionToken = sessionCookie?.match(/session=([^;]+)/)?.[1];

	if (!sessionToken) {
		return c.text("No session found", 401);
	}

	const sessionData = await c.env.OAUTH_KV.get(`session:${sessionToken}`, "json");
	if (!sessionData || typeof sessionData !== "object" || !("login" in sessionData)) {
		return c.text("Invalid session", 401);
	}

	const username = (sessionData as { login: string }).login;

	// Store approval
	await storeClientApproval(c.env.OAUTH_KV, username, approval.clientId);

	// Generate authorization code
	const authCode = generateState();
	await c.env.OAUTH_KV.put(
		`authcode:${authCode}`,
		JSON.stringify({
			clientId: approval.clientId,
			redirectUri: approval.redirectUri,
			sessionToken,
		}),
		{ expirationTtl: 600 } // 10 minutes
	);

	// Redirect back to client with auth code
	const redirectUrl = new URL(approval.redirectUri);
	redirectUrl.searchParams.set("code", authCode);
	redirectUrl.searchParams.set("state", approval.state);

	return c.redirect(redirectUrl.toString());
});

/**
 * GET /callback
 * GitHub OAuth callback - exchanges code for access token
 */
app.get("/callback", async (c) => {
	const code = c.req.query("code");
	const state = c.req.query("state");

	if (!code || !state) {
		return c.text("Missing code or state parameter", 400);
	}

	// Retrieve OAuth state
	const stateData = await c.env.OAUTH_KV.get(`oauth_state:${state}`, "json");
	if (!stateData || typeof stateData !== "object") {
		return c.text("Invalid or expired state parameter", 400);
	}

	const { clientId, redirectUri, state: clientState, scope } = stateData as {
		clientId: string;
		redirectUri: string;
		state: string;
		scope: string;
	};

	try {
		// Exchange code for GitHub access token
		const url = new URL(c.req.url);
		const callbackUri = `${url.protocol}//${url.host}/callback`;

		const accessToken = await fetchUpstreamAuthToken(
			code,
			c.env.GITHUB_CLIENT_ID,
			c.env.GITHUB_CLIENT_SECRET,
			callbackUri
		);

		// Fetch user information from GitHub
		const user = await fetchGitHubUser(accessToken);

		// Create session
		const sessionToken = generateState();
		const baseUrl = `${url.protocol}//${url.host}`;
		const sessionData: Props = {
			login: user.login,
			name: user.name,
			email: user.email,
			accessToken,
			baseUrl,
		};

		// Store session in KV (expires in 30 days)
		await c.env.OAUTH_KV.put(`session:${sessionToken}`, JSON.stringify(sessionData), {
			expirationTtl: 30 * 24 * 60 * 60,
		});

		// Clean up state
		await c.env.OAUTH_KV.delete(`oauth_state:${state}`);

		// Check if client is already approved
		const alreadyApproved = await clientIdAlreadyApproved(c.env.OAUTH_KV, user.login, clientId);

		if (alreadyApproved) {
			// Auto-approve and redirect
			const authCode = generateState();
			await c.env.OAUTH_KV.put(
				`authcode:${authCode}`,
				JSON.stringify({
					clientId,
					redirectUri,
					sessionToken,
				}),
				{ expirationTtl: 600 }
			);

			const redirectUrl = new URL(redirectUri);
			redirectUrl.searchParams.set("code", authCode);
			redirectUrl.searchParams.set("state", clientState);

			// Set session cookie
			const response = c.redirect(redirectUrl.toString());
			response.headers.set(
				"Set-Cookie",
				`session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
			);
			return response;
		}

		// Show approval dialog
		const html = renderApprovalDialog({
			clientId,
			redirectUri,
			state: clientState,
			scope,
			userLogin: user.login,
			userName: user.name,
			authorizeEndpoint: "/authorize",
		});

		const response = c.html(html);
		response.headers.set(
			"Set-Cookie",
			`session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
		);
		return response;
	} catch (error) {
		console.error("OAuth callback error:", error);
		return c.text(`OAuth error: ${error instanceof Error ? error.message : "Unknown error"}`, 500);
	}
});

/**
 * POST /token
 * OAuth 2.1 token endpoint - exchanges authorization code for access token
 * This is what MCP clients call to complete the OAuth flow
 */
app.post("/token", async (c) => {
	try {
		const formData = await c.req.formData();
		const grantType = formData.get("grant_type");
		const code = formData.get("code");
		const redirectUri = formData.get("redirect_uri");
		const clientId = formData.get("client_id");

		if (grantType !== "authorization_code") {
			return c.json(
				{
					error: "unsupported_grant_type",
					error_description: "Only authorization_code grant type is supported",
				},
				400
			);
		}

		if (!code || !redirectUri || !clientId) {
			return c.json(
				{
					error: "invalid_request",
					error_description: "Missing required parameters: code, redirect_uri, or client_id",
				},
				400
			);
		}

		// Retrieve authorization code from KV
		const authData = await c.env.OAUTH_KV.get(`authcode:${code}`, "json");
		if (!authData || typeof authData !== "object") {
			return c.json(
				{
					error: "invalid_grant",
					error_description: "Invalid or expired authorization code",
				},
				400
			);
		}

		const { clientId: storedClientId, redirectUri: storedRedirectUri, sessionToken } = authData as {
			clientId: string;
			redirectUri: string;
			sessionToken: string;
		};

		// Validate client_id and redirect_uri match
		if (clientId !== storedClientId || redirectUri !== storedRedirectUri) {
			return c.json(
				{
					error: "invalid_grant",
					error_description: "Client ID or redirect URI mismatch",
				},
				400
			);
		}

		// Retrieve session data
		const sessionData = await c.env.OAUTH_KV.get(`session:${sessionToken}`, "json");
		if (!sessionData || typeof sessionData !== "object") {
			return c.json(
				{
					error: "invalid_grant",
					error_description: "Invalid or expired session",
				},
				400
			);
		}

		// Delete the authorization code (single-use)
		await c.env.OAUTH_KV.delete(`authcode:${code}`);

		// Generate access token (we'll use the session token as the access token)
		const accessToken = sessionToken;

		// Return OAuth 2.1 token response
		return c.json({
			access_token: accessToken,
			token_type: "Bearer",
			expires_in: 30 * 24 * 60 * 60, // 30 days
			scope: "mcp",
		});
	} catch (error) {
		console.error("Token endpoint error:", error);
		return c.json(
			{
				error: "server_error",
				error_description: "An error occurred while processing the token request",
			},
			500
		);
	}
});

/**
 * POST /register
 * OAuth 2.1 dynamic client registration endpoint
 * For now, we accept all clients dynamically
 */
app.post("/register", async (c) => {
	try {
		const body = await c.req.json();
		const redirectUris = body.redirect_uris;

		if (!redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
			return c.json(
				{
					error: "invalid_redirect_uri",
					error_description: "At least one redirect_uri is required",
				},
				400
			);
		}

		// Generate a client ID
		const clientId = generateState();

		// Store client registration in KV (optional, for future validation)
		await c.env.OAUTH_KV.put(
			`client:${clientId}`,
			JSON.stringify({
				client_id: clientId,
				redirect_uris: redirectUris,
				created_at: new Date().toISOString(),
			}),
			{ expirationTtl: 365 * 24 * 60 * 60 } // 1 year
		);

		// Return OAuth 2.1 registration response
		return c.json({
			client_id: clientId,
			redirect_uris: redirectUris,
			grant_types: ["authorization_code"],
			token_endpoint_auth_method: "none", // Public client
		});
	} catch (error) {
		console.error("Client registration error:", error);
		return c.json(
			{
				error: "server_error",
				error_description: "An error occurred during client registration",
			},
			500
		);
	}
});

/**
 * GET /logout
 * Clears user session
 */
app.get("/logout", async (c) => {
	const sessionCookie = c.req.header("Cookie");
	const sessionToken = sessionCookie?.match(/session=([^;]+)/)?.[1];

	if (sessionToken) {
		await c.env.OAUTH_KV.delete(`session:${sessionToken}`);
	}

	const response = c.text("Logged out successfully");
	response.headers.set("Set-Cookie", "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
	return response;
});

/**
 * Helper: Get authenticated session data
 */
async function getAuthenticatedSession(c: any): Promise<Props | null> {
	const sessionCookie = c.req.header("Cookie");
	const sessionToken = sessionCookie?.match(/session=([^;]+)/)?.[1];

	if (!sessionToken) {
		return null;
	}

	const sessionData = await c.env.OAUTH_KV.get(`session:${sessionToken}`, "json");
	if (!sessionData || typeof sessionData !== "object" || !("login" in sessionData)) {
		return null;
	}

	return sessionData as Props;
}

/**
 * GET /setup
 * API key management page
 */
app.get("/setup", async (c) => {
	const session = await getAuthenticatedSession(c);

	if (!session) {
		// Redirect to login if not authenticated
		const url = new URL(c.req.url);
		const authorizeUrl = new URL("/authorize", url.origin);
		authorizeUrl.searchParams.set("client_id", "setup");
		authorizeUrl.searchParams.set("redirect_uri", `${url.origin}/setup`);
		authorizeUrl.searchParams.set("state", "setup");
		return c.redirect(authorizeUrl.toString());
	}

	// Check if user has an API key configured
	const hasApiKey = await getUserApiKey(
		c.env.OAUTH_KV,
		c.env.COOKIE_ENCRYPTION_KEY,
		session.login
	);

	const html = `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Hevy API Key Setup</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 20px;
		}

		.container {
			background: white;
			border-radius: 12px;
			box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
			max-width: 600px;
			width: 100%;
			padding: 40px;
		}

		h1 {
			color: #333;
			margin-bottom: 10px;
			font-size: 28px;
		}

		.user-info {
			background: #f8f9fa;
			padding: 15px;
			border-radius: 8px;
			margin-bottom: 30px;
			display: flex;
			align-items: center;
			gap: 12px;
		}

		.user-info img {
			width: 40px;
			height: 40px;
			border-radius: 50%;
		}

		.user-details {
			flex: 1;
		}

		.user-name {
			font-weight: 600;
			color: #333;
		}

		.user-login {
			font-size: 14px;
			color: #666;
		}

		.logout-btn {
			background: #dc3545;
			color: white;
			border: none;
			padding: 6px 12px;
			border-radius: 4px;
			font-size: 14px;
			cursor: pointer;
			text-decoration: none;
		}

		.logout-btn:hover {
			background: #c82333;
		}

		.status {
			padding: 15px;
			border-radius: 8px;
			margin-bottom: 20px;
			display: flex;
			align-items: center;
			gap: 10px;
		}

		.status.configured {
			background: #d4edda;
			color: #155724;
			border: 1px solid #c3e6cb;
		}

		.status.not-configured {
			background: #fff3cd;
			color: #856404;
			border: 1px solid #ffeaa7;
		}

		.status-icon {
			font-size: 24px;
		}

		label {
			display: block;
			font-weight: 600;
			margin-bottom: 8px;
			color: #333;
		}

		.help-text {
			font-size: 14px;
			color: #666;
			margin-bottom: 8px;
		}

		.help-text a {
			color: #667eea;
			text-decoration: none;
		}

		.help-text a:hover {
			text-decoration: underline;
		}

		input[type="text"] {
			width: 100%;
			padding: 12px;
			border: 2px solid #e0e0e0;
			border-radius: 6px;
			font-size: 14px;
			font-family: monospace;
			transition: border-color 0.2s;
		}

		input[type="text"]:focus {
			outline: none;
			border-color: #667eea;
		}

		.button-group {
			display: flex;
			gap: 10px;
			margin-top: 20px;
		}

		button {
			flex: 1;
			padding: 12px 24px;
			border: none;
			border-radius: 6px;
			font-size: 16px;
			font-weight: 600;
			cursor: pointer;
			transition: all 0.2s;
		}

		.btn-primary {
			background: #667eea;
			color: white;
		}

		.btn-primary:hover:not(:disabled) {
			background: #5568d3;
		}

		.btn-secondary {
			background: #6c757d;
			color: white;
		}

		.btn-secondary:hover:not(:disabled) {
			background: #5a6268;
		}

		.btn-danger {
			background: #dc3545;
			color: white;
		}

		.btn-danger:hover:not(:disabled) {
			background: #c82333;
		}

		button:disabled {
			opacity: 0.6;
			cursor: not-allowed;
		}

		.message {
			padding: 12px;
			border-radius: 6px;
			margin-bottom: 20px;
			display: none;
		}

		.message.success {
			background: #d4edda;
			color: #155724;
			border: 1px solid #c3e6cb;
		}

		.message.error {
			background: #f8d7da;
			color: #721c24;
			border: 1px solid #f5c6cb;
		}

		.message.info {
			background: #d1ecf1;
			color: #0c5460;
			border: 1px solid #bee5eb;
		}

		.spinner {
			border: 3px solid #f3f3f3;
			border-top: 3px solid #667eea;
			border-radius: 50%;
			width: 20px;
			height: 20px;
			animation: spin 0.8s linear infinite;
			display: inline-block;
			margin-left: 10px;
		}

		@keyframes spin {
			0% { transform: rotate(0deg); }
			100% { transform: rotate(360deg); }
		}
	</style>
</head>
<body>
	<div class="container">
		<h1>🏋️ Hevy API Key Setup</h1>
		
		<div class="user-info">
			<div class="user-details">
				<div class="user-name">${session.name || session.login}</div>
				<div class="user-login">@${session.login}</div>
			</div>
			<a href="/logout" class="logout-btn">Logout</a>
		</div>

		<div class="status ${hasApiKey ? "configured" : "not-configured"}">
			<span class="status-icon">${hasApiKey ? "✅" : "⚠️"}</span>
			<div>
				<strong>${hasApiKey ? "API Key Configured" : "API Key Not Configured"}</strong>
				<div style="font-size: 14px; margin-top: 4px;">
					${hasApiKey ? "Your Hevy API key is stored securely." : "Please enter your Hevy API key below to start using the MCP server."}
				</div>
			</div>
		</div>

		<div id="message" class="message"></div>

		<form id="apiKeyForm">
			<label for="apiKey">Hevy API Key</label>
			<div class="help-text">
				Get your API key from <a href="https://hevy.com/settings?developer" target="_blank" rel="noopener noreferrer">Hevy Settings → Developer</a>
			</div>
			<input 
				type="text" 
				id="apiKey" 
				name="apiKey" 
				placeholder="Enter your Hevy API key..."
				required
			/>

			<div class="button-group">
				<button type="button" id="testBtn" class="btn-secondary">Test Key</button>
				<button type="submit" class="btn-primary">Save Key</button>
			</div>
		</form>

		${hasApiKey ? `
		<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
			<button id="deleteBtn" class="btn-danger" style="width: 100%;">Delete API Key</button>
		</div>
		` : ""}
	</div>

	<script>
		const form = document.getElementById('apiKeyForm');
		const apiKeyInput = document.getElementById('apiKey');
		const testBtn = document.getElementById('testBtn');
		const deleteBtn = document.getElementById('deleteBtn');
		const message = document.getElementById('message');

		function showMessage(text, type) {
			message.textContent = text;
			message.className = 'message ' + type;
			message.style.display = 'block';
			setTimeout(() => {
				message.style.display = 'none';
			}, 5000);
		}

		async function testApiKey() {
			const apiKey = apiKeyInput.value.trim();
			if (!apiKey) {
				showMessage('Please enter an API key', 'error');
				return;
			}

			testBtn.disabled = true;
			testBtn.innerHTML = 'Testing...<span class="spinner"></span>';

			try {
				const response = await fetch('/api/test-key', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ apiKey }),
				});

				const data = await response.json();

				if (response.ok) {
					showMessage('✅ API key is valid!', 'success');
				} else {
					showMessage('❌ ' + (data.error || 'Invalid API key'), 'error');
				}
			} catch (error) {
				showMessage('❌ Failed to test API key: ' + error.message, 'error');
			} finally {
				testBtn.disabled = false;
				testBtn.textContent = 'Test Key';
			}
		}

		async function saveApiKey(e) {
			e.preventDefault();

			const apiKey = apiKeyInput.value.trim();
			if (!apiKey) {
				showMessage('Please enter an API key', 'error');
				return;
			}

			const submitBtn = form.querySelector('button[type="submit"]');
			submitBtn.disabled = true;
			submitBtn.innerHTML = 'Saving...<span class="spinner"></span>';

			try {
				const response = await fetch('/api/save-key', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ apiKey }),
				});

				const data = await response.json();

				if (response.ok) {
					showMessage('✅ API key saved successfully!', 'success');
					setTimeout(() => location.reload(), 1500);
				} else {
					showMessage('❌ ' + (data.error || 'Failed to save API key'), 'error');
				}
			} catch (error) {
				showMessage('❌ Failed to save API key: ' + error.message, 'error');
			} finally {
				submitBtn.disabled = false;
				submitBtn.textContent = 'Save Key';
			}
		}

		async function deleteApiKey() {
			if (!confirm('Are you sure you want to delete your API key? You will need to configure it again to use the MCP server.')) {
				return;
			}

			deleteBtn.disabled = true;
			deleteBtn.innerHTML = 'Deleting...<span class="spinner"></span>';

			try {
				const response = await fetch('/api/delete-key', {
					method: 'DELETE',
				});

				if (response.ok) {
					showMessage('✅ API key deleted successfully', 'success');
					setTimeout(() => location.reload(), 1500);
				} else {
					const data = await response.json();
					showMessage('❌ ' + (data.error || 'Failed to delete API key'), 'error');
				}
			} catch (error) {
				showMessage('❌ Failed to delete API key: ' + error.message, 'error');
			} finally {
				deleteBtn.disabled = false;
				deleteBtn.textContent = 'Delete API Key';
			}
		}

		testBtn.addEventListener('click', testApiKey);
		form.addEventListener('submit', saveApiKey);
		if (deleteBtn) {
			deleteBtn.addEventListener('click', deleteApiKey);
		}
	</script>
</body>
</html>
	`;

	return c.html(html);
});

/**
 * POST /api/test-key
 * Test if a Hevy API key is valid
 */
app.post("/api/test-key", async (c) => {
	const session = await getAuthenticatedSession(c);
	if (!session) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	try {
		const body = await c.req.json();
		const apiKey = body.apiKey;

		if (!apiKey || typeof apiKey !== "string") {
			return c.json({ error: "Invalid request: apiKey is required" }, 400);
		}

		// Test the API key by making a simple request
		const client = new HevyClient({ apiKey });
		await client.getWorkouts({ pageSize: 1 });

		return c.json({ valid: true });
	} catch (error) {
		console.error("API key test error:", error);
		return c.json(
			{ error: error instanceof Error ? error.message : "Invalid API key" },
			400
		);
	}
});

/**
 * POST /api/save-key
 * Save user's Hevy API key
 */
app.post("/api/save-key", async (c) => {
	const session = await getAuthenticatedSession(c);
	if (!session) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	try {
		const body = await c.req.json();
		const apiKey = body.apiKey;

		if (!apiKey || typeof apiKey !== "string") {
			return c.json({ error: "Invalid request: apiKey is required" }, 400);
		}

		// Validate the API key first
		const client = new HevyClient({ apiKey });
		await client.getWorkouts({ pageSize: 1 });

		// Store encrypted API key in KV
		await setUserApiKey(
			c.env.OAUTH_KV,
			c.env.COOKIE_ENCRYPTION_KEY,
			session.login,
			apiKey
		);

		return c.json({ success: true });
	} catch (error) {
		console.error("API key save error:", error);
		return c.json(
			{ error: error instanceof Error ? error.message : "Failed to save API key" },
			400
		);
	}
});

/**
 * GET /api/get-key
 * Get API key status
 */
app.get("/api/get-key", async (c) => {
	const session = await getAuthenticatedSession(c);
	if (!session) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	try {
		const apiKey = await getUserApiKey(
			c.env.OAUTH_KV,
			c.env.COOKIE_ENCRYPTION_KEY,
			session.login
		);

		if (!apiKey) {
			return c.json({ configured: false });
		}

		return c.json({
			configured: true,
			maskedKey: maskApiKey(apiKey),
		});
	} catch (error) {
		console.error("API key retrieval error:", error);
		return c.json({ error: "Failed to retrieve API key status" }, 500);
	}
});

/**
 * DELETE /api/delete-key
 * Delete user's API key
 */
app.delete("/api/delete-key", async (c) => {
	const session = await getAuthenticatedSession(c);
	if (!session) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	try {
		await deleteUserApiKey(c.env.OAUTH_KV, session.login);
		return c.json({ success: true });
	} catch (error) {
		console.error("API key deletion error:", error);
		return c.json({ error: "Failed to delete API key" }, 500);
	}
});

export default app;

