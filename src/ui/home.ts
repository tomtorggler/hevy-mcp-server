import { escapeHtml, renderPage } from "./layout.js";

export interface ToolGroup {
	title: string;
	description: string;
	tools: string[];
}

export const TOOL_GROUPS: ToolGroup[] = [
	{
		title: "Workouts",
		description:
			"Browse history, log new sessions, fix mistakes, and sync changes.",
		tools: [
			"get_workouts",
			"get_workout",
			"create_workout",
			"update_workout",
			"get_workouts_count",
			"get_workout_events",
		],
	},
	{
		title: "Routines",
		description:
			"Read and build training programs, including rep ranges and rest times.",
		tools: ["get_routines", "get_routine", "create_routine", "update_routine"],
	},
	{
		title: "Exercises",
		description:
			"Look up Hevy's exercise library, add custom exercises, track progress per lift.",
		tools: [
			"get_exercise_templates",
			"get_exercise_template",
			"create_exercise_template",
			"get_exercise_history",
		],
	},
	{
		title: "Folders",
		description: "Keep routines organised.",
		tools: [
			"get_routine_folders",
			"get_routine_folder",
			"create_routine_folder",
		],
	},
];

export interface HomePageOptions {
	baseUrl: string;
	version: string;
}

export function renderHomePage({ baseUrl, version }: HomePageOptions): string {
	const mcpUrl = `${baseUrl}/mcp`;
	const mcpUrlHtml = escapeHtml(mcpUrl);

	const toolCards = TOOL_GROUPS.map(
		(group) => `
			<div class="card">
				<h3>${escapeHtml(group.title)}</h3>
				<p class="muted small">${escapeHtml(group.description)}</p>
				<div class="tool-list">${group.tools.map((t) => `<code>${escapeHtml(t)}</code>`).join("")}</div>
			</div>`,
	).join("");

	const body = `
	<div class="container stack">
		<section class="hero">
			<h1>Your Hevy training log, available to your AI assistant.</h1>
			<p>A remote MCP server that lets Claude and other MCP clients read and log workouts, manage routines and track progress in your Hevy account.</p>
			<div class="btn-group">
				<a class="btn btn-primary" href="/setup">Connect your Hevy account</a>
				<a class="btn btn-secondary" href="#connect">Client setup</a>
			</div>
			<p class="muted small" style="margin-top:1rem"><span id="stats" aria-live="polite"></span></p>
		</section>

		<section class="card" id="connect">
			<h2>Connect in three steps</h2>
			<ol class="steps">
				<li>
					<strong>Add your Hevy API key.</strong>
					<div class="muted small">Sign in with GitHub on the <a href="/setup">setup page</a> and paste the key from <a href="https://hevy.com/settings?developer" target="_blank" rel="noopener noreferrer">Hevy Settings → Developer</a>. The API requires a Hevy Pro subscription.</div>
				</li>
				<li>
					<strong>Add this server to your MCP client.</strong>
					<div class="copy-field" style="margin:0.6rem 0">
						<code id="mcp-url">${mcpUrlHtml}</code>
						<button class="btn btn-secondary" type="button" data-copy="${mcpUrlHtml}">Copy</button>
					</div>
					<div class="tabs" role="tablist" aria-label="Client">
						<button class="tab" role="tab" id="tab-claude" aria-selected="true" aria-controls="panel-claude" type="button">Claude</button>
						<button class="tab" role="tab" id="tab-code" aria-selected="false" aria-controls="panel-code" type="button">Claude Code</button>
						<button class="tab" role="tab" id="tab-other" aria-selected="false" aria-controls="panel-other" type="button">Other clients</button>
					</div>
					<div class="tab-panel" id="panel-claude" role="tabpanel" aria-labelledby="tab-claude">
						<p class="small">In Claude (web or desktop) open <strong>Settings → Connectors → Add custom connector</strong>, name it <em>Hevy</em> and paste the server URL above. No client ID or credentials are needed.</p>
					</div>
					<div class="tab-panel" id="panel-code" role="tabpanel" aria-labelledby="tab-code" hidden>
						<pre><code>claude mcp add --transport http hevy ${mcpUrlHtml}</code></pre>
						<p class="small muted" style="margin-top:0.5rem">Then run <code>/mcp</code> inside Claude Code to complete sign-in.</p>
					</div>
					<div class="tab-panel" id="panel-other" role="tabpanel" aria-labelledby="tab-other" hidden>
						<p class="small">Any client that supports <strong>Streamable HTTP</strong> with OAuth works with the URL above. Clients that only support local stdio servers can bridge with:</p>
						<pre><code>npx mcp-remote ${mcpUrlHtml}</code></pre>
					</div>
				</li>
				<li>
					<strong>Approve the connection.</strong>
					<div class="muted small">Your client opens a browser window; sign in with the same GitHub account you used on the setup page and approve access.</div>
				</li>
			</ol>
		</section>

		<section>
			<h2>What your assistant can do</h2>
			<p class="muted">Seventeen tools covering the Hevy public API. Ask for “my last five workouts”, “log today’s push session”, or “how has my deadlift progressed this year”.</p>
			<div class="grid">${toolCards}</div>
		</section>

		<section class="card">
			<h2>How your data is handled</h2>
			<div class="grid">
				<div>
					<h3>Identity</h3>
					<p class="muted small">GitHub sign-in identifies you. Only your username, display name and email are stored.</p>
				</div>
				<div>
					<h3>API key</h3>
					<p class="muted small">Your Hevy key is encrypted (AES-GCM) at rest in Cloudflare KV and never shown back to you or returned to a client.</p>
				</div>
				<div>
					<h3>Access</h3>
					<p class="muted small">Each client gets its own 30-day token. Remove your key or sign out on the <a href="/setup">setup page</a> at any time.</p>
				</div>
			</div>
		</section>
	</div>`;

	const script = `
	fetch('/stats').then(r => r.ok ? r.json() : null).then(data => {
		if (!data || typeof data.total_users !== 'number') return;
		const el = document.getElementById('stats');
		el.textContent = data.total_users + (data.total_users === 1 ? ' account connected' : ' accounts connected');
	}).catch(() => {});
	`;

	return renderPage(
		{
			title: "Hevy MCP Server",
			description:
				"Remote Model Context Protocol server for the Hevy fitness tracking API.",
			body,
			script,
		},
		version,
	);
}
