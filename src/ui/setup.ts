import { escapeHtml, renderPage } from "./layout.js";

export interface SetupPageOptions {
	baseUrl: string;
	version: string;
	userName: string;
	userLogin: string;
	hasApiKey: boolean;
	maskedKey?: string | null;
}

export function renderSetupPage(options: SetupPageOptions): string {
	const { baseUrl, version, userName, userLogin, hasApiKey, maskedKey } =
		options;
	const mcpUrl = `${baseUrl}/mcp`;
	const mcpUrlHtml = escapeHtml(mcpUrl);

	const statusBanner = hasApiKey
		? `<div class="alert alert-success" role="status">
				<span aria-hidden="true">✓</span>
				<div class="body"><strong>API key configured</strong>
				<span class="small">Stored encrypted${maskedKey ? ` · <code>${escapeHtml(maskedKey)}</code>` : ""}. Paste a new key below to replace it.</span></div>
			</div>`
		: `<div class="alert alert-warn" role="status">
				<span aria-hidden="true">!</span>
				<div class="body"><strong>No API key yet</strong>
				<span class="small">Add your Hevy API key to start using the server from your MCP client.</span></div>
			</div>`;

	const nextStep = hasApiKey
		? `<section class="card">
				<h2>Next: add the server to your client</h2>
				<p class="muted small">Use this URL as a custom connector in Claude, or with any MCP client that supports Streamable HTTP and OAuth.</p>
				<div class="copy-field">
					<code>${mcpUrlHtml}</code>
					<button class="btn btn-secondary" type="button" data-copy="${mcpUrlHtml}">Copy</button>
				</div>
				<p class="small" style="margin-top:0.75rem"><a href="/#connect">Step-by-step client instructions</a></p>
			</section>`
		: "";

	const body = `
	<div class="container narrow stack">
		<section>
			<h1>Account setup</h1>
			<p class="muted">Link your Hevy account to this MCP server.</p>
		</section>

		<section class="card stack">
			<div class="card-header" style="margin-bottom:0">
				<div>
					<div style="font-weight:600">${escapeHtml(userName)}</div>
					<div class="muted small">@${escapeHtml(userLogin)} · signed in with GitHub</div>
				</div>
				<a class="btn btn-secondary" href="/logout">Sign out</a>
			</div>

			${statusBanner}

			<div id="message" class="alert" role="alert" hidden></div>

			<form id="apiKeyForm" autocomplete="off">
				<label for="apiKey">Hevy API key</label>
				<div class="help">Create one at <a href="https://hevy.com/settings?developer" target="_blank" rel="noopener noreferrer">Hevy Settings → Developer</a> (requires Hevy Pro). The key is validated against the Hevy API before it is saved.</div>
				<div class="input-row">
					<input class="input" type="password" id="apiKey" name="apiKey" placeholder="Paste your API key" required spellcheck="false" autocapitalize="off">
					<button class="btn btn-secondary" type="button" id="toggleKey" aria-pressed="false" aria-label="Show API key">Show</button>
				</div>
				<div class="btn-group" style="margin-top:1rem">
					<button type="submit" class="btn btn-primary" id="saveBtn">${hasApiKey ? "Replace key" : "Save key"}</button>
					<button type="button" class="btn btn-secondary" id="testBtn">Test key</button>
					${hasApiKey ? `<button type="button" class="btn btn-danger" id="deleteBtn" style="margin-left:auto">Remove key</button>` : ""}
				</div>
			</form>
		</section>

		${nextStep}
	</div>`;

	const script = `
	const form = document.getElementById('apiKeyForm');
	const apiKeyInput = document.getElementById('apiKey');
	const testBtn = document.getElementById('testBtn');
	const saveBtn = document.getElementById('saveBtn');
	const deleteBtn = document.getElementById('deleteBtn');
	const toggleKey = document.getElementById('toggleKey');
	const message = document.getElementById('message');
	let messageTimer;

	function showMessage(text, type) {
		message.textContent = text;
		message.className = 'alert alert-' + type;
		message.hidden = false;
		clearTimeout(messageTimer);
		messageTimer = setTimeout(() => { message.hidden = true; }, 6000);
	}

	function busy(button, label) {
		button.disabled = true;
		button.dataset.label = button.textContent;
		button.innerHTML = '<span class="spinner" aria-hidden="true"></span> ' + label;
	}
	function idle(button) {
		button.disabled = false;
		button.textContent = button.dataset.label;
	}

	toggleKey.addEventListener('click', () => {
		const show = apiKeyInput.type === 'password';
		apiKeyInput.type = show ? 'text' : 'password';
		toggleKey.textContent = show ? 'Hide' : 'Show';
		toggleKey.setAttribute('aria-pressed', String(show));
		toggleKey.setAttribute('aria-label', show ? 'Hide API key' : 'Show API key');
	});

	async function request(url, options) {
		const response = await fetch(url, options);
		let data = {};
		try { data = await response.json(); } catch (e) {}
		return { ok: response.ok, data };
	}

	testBtn.addEventListener('click', async () => {
		const apiKey = apiKeyInput.value.trim();
		if (!apiKey) { showMessage('Enter an API key first.', 'warn'); return; }
		busy(testBtn, 'Testing');
		try {
			const { ok, data } = await request('/api/test-key', {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey })
			});
			showMessage(ok ? 'API key is valid.' : (data.error || 'Hevy rejected this key.'), ok ? 'success' : 'danger');
		} catch (error) {
			showMessage('Could not reach the server: ' + error.message, 'danger');
		} finally { idle(testBtn); }
	});

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		const apiKey = apiKeyInput.value.trim();
		if (!apiKey) { showMessage('Enter an API key first.', 'warn'); return; }
		busy(saveBtn, 'Saving');
		try {
			const { ok, data } = await request('/api/save-key', {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey })
			});
			if (ok) {
				showMessage('API key saved.', 'success');
				setTimeout(() => location.reload(), 900);
			} else {
				showMessage(data.error || 'Could not save the key.', 'danger');
				idle(saveBtn);
			}
		} catch (error) {
			showMessage('Could not reach the server: ' + error.message, 'danger');
			idle(saveBtn);
		}
	});

	if (deleteBtn) {
		deleteBtn.addEventListener('click', async () => {
			if (!confirm('Remove your Hevy API key? Connected clients will stop working until you add a key again.')) return;
			busy(deleteBtn, 'Removing');
			try {
				const { ok, data } = await request('/api/delete-key', { method: 'DELETE' });
				if (ok) {
					showMessage('API key removed.', 'success');
					setTimeout(() => location.reload(), 900);
				} else {
					showMessage(data.error || 'Could not remove the key.', 'danger');
					idle(deleteBtn);
				}
			} catch (error) {
				showMessage('Could not reach the server: ' + error.message, 'danger');
				idle(deleteBtn);
			}
		});
	}
	`;

	return renderPage(
		{
			title: "Account setup · Hevy MCP Server",
			body,
			script,
		},
		version,
	);
}
