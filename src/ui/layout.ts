/**
 * Shared HTML layout, design tokens and escaping helpers for the server's
 * web pages (home, setup, OAuth approval).
 */

const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

/** Escape a value for safe interpolation into HTML text or attributes. */
export function escapeHtml(value: unknown): string {
	return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Escape a value for embedding inside a <script> block as a JS string literal. */
export function toJsString(value: unknown): string {
	return JSON.stringify(String(value ?? "")).replace(/</g, "\\u003c");
}

export const BASE_STYLES = `
:root {
	--bg: #f5f6f8;
	--surface: #ffffff;
	--surface-2: #f0f2f5;
	--text: #14181f;
	--muted: #5c6672;
	--border: #e1e5ea;
	--accent: #2456d6;
	--accent-hover: #1b45b3;
	--accent-soft: #e8eefc;
	--success: #1a7f4b;
	--success-soft: #e4f5ec;
	--warn: #9a5b00;
	--warn-soft: #fff4dd;
	--danger: #b42318;
	--danger-soft: #fdecea;
	--code-bg: #eef1f5;
	--shadow: 0 1px 2px rgba(16, 24, 40, 0.06), 0 8px 24px -12px rgba(16, 24, 40, 0.18);
	--radius: 12px;
	--font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, "Helvetica Neue", Arial, sans-serif;
	--mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
	color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
	:root:not([data-theme="light"]) {
		--bg: #0e1116;
		--surface: #161b23;
		--surface-2: #1d232d;
		--text: #e7eaef;
		--muted: #98a2b3;
		--border: #2a313c;
		--accent: #6f9bff;
		--accent-hover: #8db0ff;
		--accent-soft: #1b2a4a;
		--success: #4cc38a;
		--success-soft: #13301f;
		--warn: #f0b24a;
		--warn-soft: #3a2a0f;
		--danger: #f0776b;
		--danger-soft: #3d1a17;
		--code-bg: #1d232d;
		--shadow: 0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.6);
	}
}
:root[data-theme="dark"] {
	--bg: #0e1116;
	--surface: #161b23;
	--surface-2: #1d232d;
	--text: #e7eaef;
	--muted: #98a2b3;
	--border: #2a313c;
	--accent: #6f9bff;
	--accent-hover: #8db0ff;
	--accent-soft: #1b2a4a;
	--success: #4cc38a;
	--success-soft: #13301f;
	--warn: #f0b24a;
	--warn-soft: #3a2a0f;
	--danger: #f0776b;
	--danger-soft: #3d1a17;
	--code-bg: #1d232d;
	--shadow: 0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.6);
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
	margin: 0;
	font-family: var(--font);
	font-size: 16px;
	line-height: 1.55;
	color: var(--text);
	background: var(--bg);
	min-height: 100vh;
	display: flex;
	flex-direction: column;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code, pre, .mono { font-family: var(--mono); font-size: 0.9em; }
code { background: var(--code-bg); padding: 0.1em 0.4em; border-radius: 6px; }
pre {
	background: var(--code-bg);
	padding: 0.9rem 1rem;
	border-radius: 10px;
	overflow-x: auto;
	margin: 0;
	border: 1px solid var(--border);
}
pre code { background: none; padding: 0; }
h1, h2, h3 { line-height: 1.2; margin: 0 0 0.5rem; letter-spacing: -0.01em; }
h1 { font-size: clamp(1.9rem, 4vw, 2.6rem); font-weight: 700; }
h2 { font-size: 1.35rem; font-weight: 650; }
h3 { font-size: 1.05rem; font-weight: 600; }
p { margin: 0 0 1rem; }
.muted { color: var(--muted); }
.small { font-size: 0.9rem; }

.topbar {
	border-bottom: 1px solid var(--border);
	background: var(--surface);
}
.topbar-inner {
	max-width: 960px;
	margin: 0 auto;
	padding: 0.85rem 16px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
}
.brand {
	display: inline-flex;
	align-items: center;
	gap: 0.6rem;
	font-weight: 700;
	color: var(--text);
	text-decoration: none;
}
.brand:hover { text-decoration: none; }
.brand-mark {
	width: 28px; height: 28px; border-radius: 8px;
	background: var(--accent);
	color: #fff;
	display: inline-grid; place-items: center;
	font-size: 15px; font-weight: 800;
}
.nav { display: flex; gap: 1.1rem; font-size: 0.95rem; }
.nav a { color: var(--muted); }
.nav a:hover { color: var(--text); text-decoration: none; }

main { flex: 1; }
.container { max-width: 960px; margin: 0 auto; padding: 2.5rem 16px 3rem; }
.container.narrow { max-width: 600px; }
.stack > * + * { margin-top: 1.5rem; }

.card {
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: var(--radius);
	box-shadow: var(--shadow);
	padding: 1.5rem;
}
.card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }

.btn {
	display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
	padding: 0.65rem 1.1rem;
	border-radius: 10px;
	border: 1px solid transparent;
	font: inherit; font-weight: 600; font-size: 0.95rem;
	cursor: pointer;
	text-decoration: none;
	transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.btn:hover { text-decoration: none; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-secondary { background: var(--surface); color: var(--text); border-color: var(--border); }
.btn-secondary:hover:not(:disabled) { background: var(--surface-2); }
.btn-danger { background: transparent; color: var(--danger); border-color: var(--border); }
.btn-danger:hover:not(:disabled) { background: var(--danger-soft); }
.btn-block { width: 100%; }
.btn-group { display: flex; flex-wrap: wrap; gap: 0.6rem; }

.badge {
	display: inline-flex; align-items: center; gap: 0.35rem;
	padding: 0.2rem 0.6rem; border-radius: 999px;
	font-size: 0.8rem; font-weight: 600;
	background: var(--surface-2); color: var(--muted);
	border: 1px solid var(--border);
}
.badge-success { background: var(--success-soft); color: var(--success); border-color: transparent; }
.badge-warn { background: var(--warn-soft); color: var(--warn); border-color: transparent; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }

.alert {
	display: flex; gap: 0.75rem; align-items: flex-start;
	padding: 0.9rem 1rem; border-radius: 10px;
	border: 1px solid var(--border);
	background: var(--surface-2);
}
.alert strong { display: block; }
.alert-success { background: var(--success-soft); border-color: transparent; color: var(--success); }
.alert-warn { background: var(--warn-soft); border-color: transparent; color: var(--warn); }
.alert-danger { background: var(--danger-soft); border-color: transparent; color: var(--danger); }
.alert-info { background: var(--accent-soft); border-color: transparent; color: var(--accent); }
.alert .body { color: var(--text); }

label { display: block; font-weight: 600; margin-bottom: 0.4rem; }
.help { color: var(--muted); font-size: 0.9rem; margin-bottom: 0.6rem; }
.input {
	width: 100%;
	padding: 0.7rem 0.85rem;
	border: 1px solid var(--border);
	border-radius: 10px;
	background: var(--surface);
	color: var(--text);
	font: inherit;
	font-family: var(--mono);
	font-size: 0.95rem;
	transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.input-row { display: flex; gap: 0.5rem; }
.input-row .input { flex: 1; min-width: 0; }

.copy-field {
	display: flex; align-items: center; gap: 0.5rem;
	background: var(--code-bg);
	border: 1px solid var(--border);
	border-radius: 10px;
	padding: 0.45rem 0.45rem 0.45rem 0.85rem;
}
.copy-field code { background: none; padding: 0; flex: 1; min-width: 0; overflow-x: auto; white-space: nowrap; }
.copy-field .btn { padding: 0.4rem 0.75rem; font-size: 0.85rem; }

.steps { list-style: none; padding: 0; margin: 0; counter-reset: step; }
.steps li { position: relative; padding-left: 2.6rem; margin-bottom: 1.25rem; }
.steps li::before {
	counter-increment: step; content: counter(step);
	position: absolute; left: 0; top: 0;
	width: 1.9rem; height: 1.9rem; border-radius: 50%;
	display: grid; place-items: center;
	background: var(--accent-soft); color: var(--accent);
	font-weight: 700; font-size: 0.9rem;
}
.steps li:last-child { margin-bottom: 0; }

.tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--border); margin-bottom: 1rem; flex-wrap: wrap; }
.tab {
	background: none; border: none; border-bottom: 2px solid transparent;
	padding: 0.5rem 0.8rem; margin-bottom: -1px;
	font: inherit; font-weight: 600; font-size: 0.92rem; color: var(--muted); cursor: pointer;
}
.tab[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
.tab-panel[hidden] { display: none; }

.tool-list { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }
.tool-list code { font-size: 0.8rem; padding: 0.2em 0.5em; }

.kv { display: grid; grid-template-columns: max-content 1fr; gap: 0.35rem 1rem; font-size: 0.9rem; }
.kv dt { color: var(--muted); }
.kv dd { margin: 0; word-break: break-all; }

details summary { cursor: pointer; color: var(--muted); font-size: 0.9rem; }

footer {
	border-top: 1px solid var(--border);
	color: var(--muted);
	font-size: 0.88rem;
}
.footer-inner {
	max-width: 960px; margin: 0 auto; padding: 1.25rem 16px;
	display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.75rem;
}
.footer-inner a { color: var(--muted); }
.footer-inner a:hover { color: var(--text); }

.hero { padding: 1rem 0 0.5rem; max-width: 640px; }
.hero p { font-size: 1.15rem; color: var(--muted); }

.spinner {
	width: 1em; height: 1em; border-radius: 50%;
	border: 2px solid currentColor; border-right-color: transparent;
	display: inline-block; animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (max-width: 640px) {
	.container { padding-top: 1.5rem; }
	.card { padding: 1.15rem; }
	.nav { gap: 0.8rem; }
	.card-header { flex-direction: column; }
}
`;

export const COPY_SCRIPT = `
document.addEventListener('click', async (event) => {
	const button = event.target.closest('[data-copy]');
	if (!button) return;
	const text = button.getAttribute('data-copy');
	try {
		await navigator.clipboard.writeText(text);
		const original = button.textContent;
		button.textContent = 'Copied';
		setTimeout(() => { button.textContent = original; }, 1500);
	} catch (error) {
		console.error('Copy failed', error);
	}
});
`;

export const TABS_SCRIPT = `
document.querySelectorAll('[role="tablist"]').forEach((list) => {
	const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
	const select = (tab) => {
		tabs.forEach((t) => {
			const selected = t === tab;
			t.setAttribute('aria-selected', String(selected));
			const panel = document.getElementById(t.getAttribute('aria-controls'));
			if (panel) panel.hidden = !selected;
		});
	};
	tabs.forEach((tab) => tab.addEventListener('click', () => select(tab)));
});
`;

export interface PageOptions {
	title: string;
	description?: string;
	/** Already-escaped HTML for <main>. */
	body: string;
	/** Extra inline JS (not escaped; must not include user data unless via toJsString). */
	script?: string;
	/** Hide the top navigation (used on focused flows like OAuth approval). */
	minimalChrome?: boolean;
	footerExtra?: string;
	repoUrl?: string;
}

export const REPO_URL = "https://github.com/tomtorggler/hevy-mcp-server";

export function renderTopbar(repoUrl = REPO_URL): string {
	return `
	<header class="topbar">
		<div class="topbar-inner">
			<a class="brand" href="/"><span class="brand-mark" aria-hidden="true">H</span><span>Hevy MCP</span></a>
			<nav class="nav" aria-label="Primary">
				<a href="/setup">Setup</a>
				<a href="/health">Health</a>
				<a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener noreferrer">GitHub</a>
			</nav>
		</div>
	</header>`;
}

export function renderFooter(
	version: string,
	extra = "",
	repoUrl = REPO_URL,
): string {
	return `
	<footer>
		<div class="footer-inner">
			<span>Hevy MCP Server v${escapeHtml(version)} ${extra}</span>
			<span>
				Built on <a href="https://modelcontextprotocol.io/" target="_blank" rel="noopener noreferrer">Model Context Protocol</a>
				and <a href="https://developers.cloudflare.com/workers/" target="_blank" rel="noopener noreferrer">Cloudflare Workers</a>
				· <a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener noreferrer">Source</a>
				· Not affiliated with Hevy
			</span>
		</div>
	</footer>`;
}

export function renderPage(options: PageOptions, version: string): string {
	const {
		title,
		description,
		body,
		script,
		minimalChrome,
		footerExtra,
		repoUrl,
	} = options;
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta name="color-scheme" content="light dark">
	<title>${escapeHtml(title)}</title>
	${description ? `<meta name="description" content="${escapeHtml(description)}">` : ""}
	<style>${BASE_STYLES}</style>
</head>
<body>
	${minimalChrome ? "" : renderTopbar(repoUrl)}
	<main>${body}</main>
	${renderFooter(version, footerExtra, repoUrl)}
	<script>${COPY_SCRIPT}${TABS_SCRIPT}${script ?? ""}</script>
</body>
</html>`;
}
