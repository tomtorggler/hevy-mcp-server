import { escapeHtml, renderPage } from "./layout.js";

export interface ApprovalDialogOptions {
	clientId: string;
	clientName: string;
	clientUri?: string;
	redirectUri: string;
	state: string;
	scope: string;
	codeChallenge: string;
	codeChallengeMethod: string;
	userLogin: string;
	userName: string;
	authorizeEndpoint: string;
	version: string;
}

/**
 * OAuth consent screen. All interpolated values are escaped; the client_id,
 * redirect_uri and state come from the (untrusted) authorization request.
 */
export function renderApprovalDialog(options: ApprovalDialogOptions): string {
	const {
		clientId,
		clientName,
		clientUri,
		redirectUri,
		state,
		scope,
		codeChallenge,
		codeChallengeMethod,
		userLogin,
		userName,
		authorizeEndpoint,
		version,
	} = options;

	let redirectHost = redirectUri;
	try {
		redirectHost = new URL(redirectUri).host || redirectUri;
	} catch {
		// leave as-is; it is escaped below
	}

	const clientLabel = clientUri
		? `<a href="${escapeHtml(clientUri)}" target="_blank" rel="noopener noreferrer">${escapeHtml(clientName)}</a>`
		: escapeHtml(clientName);

	const body = `
	<div class="container narrow stack">
		<section class="card stack">
			<div>
				<p class="muted small" style="margin-bottom:0.25rem">Authorization request</p>
				<h1 style="font-size:1.6rem">Allow ${clientLabel} to use your Hevy data?</h1>
				<p class="muted">Signed in as <strong>${escapeHtml(userName)}</strong> (@${escapeHtml(userLogin)}).
				<a href="/logout">Not you?</a></p>
			</div>

			<div>
				<h3>This client will be able to</h3>
				<ul class="muted small" style="margin:0; padding-left:1.2rem">
					<li>Read your workouts, routines, exercises and exercise history</li>
					<li>Log new workouts and create or update routines and custom exercises</li>
				</ul>
				<p class="muted small" style="margin:0.75rem 0 0">It never sees your Hevy API key or GitHub credentials. Access lasts 30 days and ends when you remove your key on the <a href="/setup">setup page</a>.</p>
			</div>

			<details>
				<summary>Client details</summary>
				<dl class="kv" style="margin-top:0.6rem">
					<dt>Client ID</dt><dd><code>${escapeHtml(clientId)}</code></dd>
					<dt>Redirects to</dt><dd><code title="${escapeHtml(redirectUri)}">${escapeHtml(redirectHost)}</code></dd>
					<dt>Scope</dt><dd><code>${escapeHtml(scope)}</code></dd>
				</dl>
			</details>

			<form method="POST" action="${escapeHtml(authorizeEndpoint)}">
				<input type="hidden" name="client_id" value="${escapeHtml(clientId)}">
				<input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
				<input type="hidden" name="state" value="${escapeHtml(state)}">
				<input type="hidden" name="scope" value="${escapeHtml(scope)}">
				<input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}">
				<input type="hidden" name="code_challenge_method" value="${escapeHtml(codeChallengeMethod)}">
				<div class="btn-group">
					<button type="submit" name="approve" value="true" class="btn btn-primary">Allow access</button>
					<button type="submit" name="approve" value="false" class="btn btn-secondary">Deny</button>
				</div>
			</form>
		</section>
	</div>`;

	return renderPage(
		{
			title: "Authorize · Hevy MCP Server",
			body,
			minimalChrome: true,
		},
		version,
	);
}
