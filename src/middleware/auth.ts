import { createMiddleware } from "hono/factory";
import type { Props } from "../utils.js";

interface Env {
	OAUTH_KV: KVNamespace;
	GITHUB_CLIENT_ID: string;
}

interface Variables {
	props: Props;
}

/**
 * Bearer token authentication middleware
 * Validates Authorization header and stores user props in context
 */
export const bearerAuth = createMiddleware<{ Bindings: Env; Variables: Variables }>(
	async (c, next) => {
		const authHeader = c.req.header("Authorization");

		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			const wwwAuthenticateValue = `Bearer realm="${c.req.url}", error="invalid_token"`;
			
			return c.json(
				{
					error: "unauthorized",
					message: "Authentication required. Please provide a valid Bearer token.",
				},
				401,
				{
					"WWW-Authenticate": wwwAuthenticateValue,
				}
			);
		}

		const token = authHeader.substring(7); // Remove "Bearer " prefix
		const sessionData = await c.env.OAUTH_KV.get(`session:${token}`, "json");

		if (!sessionData || typeof sessionData !== "object") {
			return c.json(
				{
					error: "unauthorized",
					message: "Invalid token.",
				},
				401
			);
		}

		// Store props in context variables
		c.set("props", sessionData as Props);

		await next();
	}
);

/**
 * Session cookie authentication middleware
 * Used for browser-based routes like /setup
 */
export const sessionAuth = createMiddleware<{
	Bindings: Env;
	Variables: { session: Props };
}>(async (c, next) => {
	const sessionCookie = c.req.header("Cookie");
	const sessionToken = sessionCookie?.match(/session=([^;]+)/)?.[1];

	if (!sessionToken) {
		// Redirect to authorize with proper state
		const state = crypto.randomUUID();
		const baseUrl = `${c.req.url.split('/').slice(0, 3).join('/')}`;
		const redirectUri = `${baseUrl}/callback`;
		const authorizeUrl = `https://github.com/login/oauth/authorize?client_id=${c.env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=user:email`;
		return c.redirect(authorizeUrl);
	}

	const sessionData = await c.env.OAUTH_KV.get(`session:${sessionToken}`, "json");

	if (!sessionData) {
		const state = crypto.randomUUID();
		const baseUrl = `${c.req.url.split('/').slice(0, 3).join('/')}`;
		const redirectUri = `${baseUrl}/callback`;
		const authorizeUrl = `https://github.com/login/oauth/authorize?client_id=${c.env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=user:email`;
		return c.redirect(authorizeUrl);
	}

	c.set("session", sessionData as Props);
	await next();
});