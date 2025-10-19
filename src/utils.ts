/**
 * OAuth Utilities for GitHub Authentication
 * Based on Cloudflare OAuth provider patterns
 */

/**
 * Props type that holds user information from GitHub OAuth
 * Note: Hevy API keys are stored separately in KV and fetched as needed
 */
export type Props = {
	login: string; // GitHub username
	name: string; // GitHub display name
	email: string; // GitHub email
	accessToken: string; // GitHub access token
	baseUrl?: string; // Base URL of the worker (for generating setup links)
};

/**
 * Constructs the GitHub OAuth authorization URL
 */
export function getUpstreamAuthorizeUrl(
	clientId: string,
	redirectUri: string,
	state: string,
	scope = "user:email"
): string {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		state,
		scope,
		response_type: "code",
	});

	return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchanges authorization code for access token
 */
export async function fetchUpstreamAuthToken(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string
): Promise<string> {
	const response = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			redirect_uri: redirectUri,
		}),
	});

	if (!response.ok) {
		throw new Error(`GitHub token exchange failed: ${response.statusText}`);
	}

	const data = (await response.json()) as {
		access_token?: string;
		error?: string;
		error_description?: string;
	};

	if (data.error) {
		throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
	}

	if (!data.access_token) {
		throw new Error("No access token received from GitHub");
	}

	return data.access_token;
}

/**
 * Fetches user information from GitHub API
 */
export async function fetchGitHubUser(
	accessToken: string
): Promise<{ login: string; name: string; email: string }> {
	const response = await fetch("https://api.github.com/user", {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/vnd.github.v3+json",
			"User-Agent": "Hevy-MCP-Server",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch GitHub user: ${response.statusText}`);
	}

	const user = (await response.json()) as {
		login: string;
		name: string | null;
		email: string | null;
	};

	// Fetch email separately if not included in user object
	let email = user.email;
	if (!email) {
		const emailResponse = await fetch("https://api.github.com/user/emails", {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/vnd.github.v3+json",
				"User-Agent": "Hevy-MCP-Server",
			},
		});

		if (emailResponse.ok) {
			const emails = (await emailResponse.json()) as Array<{
				email: string;
				primary: boolean;
				verified: boolean;
			}>;
			const primaryEmail = emails.find((e) => e.primary && e.verified);
			email = primaryEmail?.email || emails[0]?.email || "";
		}
	}

	return {
		login: user.login,
		name: user.name || user.login,
		email: email || "",
	};
}

