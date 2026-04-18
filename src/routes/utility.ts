import { Hono } from "hono";
import type { Env, Variables } from "../app.js";

const utilityRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Health check endpoint
utilityRoutes.get("/health", (c) => {
	return c.json({
		status: "healthy",
		transport: "streamable-http",
		version: "3.1.0",
		oauth: "enabled",
	});
});

// Stats endpoint - show user and session counts
utilityRoutes.get("/stats", async (c) => {
	try {
		const kv = c.env.OAUTH_KV;

		// List all keys with prefix "hevy_key:" to count users
		const userKeys = await kv.list({ prefix: "hevy_key:" });
		const totalUsers = userKeys.keys.length;

		// List all keys with prefix "session:" to count active sessions
		const sessionKeys = await kv.list({ prefix: "session:" });
		const activeSessions = sessionKeys.keys.length;

		// List approval tokens (pending OAuth flows)
		const approvalKeys = await kv.list({ prefix: "approval:" });
		const pendingApprovals = approvalKeys.keys.length;

		return c.json({
			total_users: totalUsers,
			active_sessions: activeSessions,
			pending_approvals: pendingApprovals,
		});
	} catch (error) {
		console.error("Error fetching stats:", error);
		return c.json({
			error: "Failed to fetch stats",
			total_users: 0,
			active_sessions: 0,
			pending_approvals: 0,
		}, 500);
	}
});

// Root endpoint - minimal login page
utilityRoutes.get("/", (c) => {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Hevy MCP Server</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			min-height: 100vh;
			display: flex; align-items: center; justify-content: center;
			padding: 20px;
		}
		.card {
			background: white; border-radius: 12px; padding: 40px;
			max-width: 380px; width: 100%; text-align: center;
			box-shadow: 0 20px 60px rgba(0,0,0,0.3);
		}
		h1 { color: #333; font-size: 22px; margin-bottom: 24px; }
		a.button {
			display: inline-block; background: #667eea; color: white;
			padding: 12px 28px; border-radius: 6px; text-decoration: none;
			font-weight: 600; font-size: 16px;
		}
		a.button:hover { background: #5568d3; }
	</style>
</head>
<body>
	<div class="card">
		<h1>🏋️ Hevy MCP Server</h1>
		<a href="/setup" class="button">Login</a>
	</div>
</body>
</html>`;

	return c.html(html);
});

export default utilityRoutes;
