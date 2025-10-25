import { createMiddleware } from "hono/factory";
import type { Props } from "../utils.js";

interface Env {
	OAUTH_KV: KVNamespace;
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

