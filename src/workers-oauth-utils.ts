/**
 * OAuth consent bookkeeping: parsing the approval form and remembering which
 * clients a user has already approved.
 */

export interface ApprovalSubmission {
	approved: boolean;
	clientId: string;
	redirectUri: string;
	state: string;
	scope: string;
	codeChallenge: string;
	codeChallengeMethod: string;
}

function formString(form: FormData, key: string): string {
	const value = form.get(key);
	return typeof value === "string" ? value : "";
}

/** Parses the approval form submission. */
export async function parseRedirectApproval(
	request: Request,
): Promise<ApprovalSubmission> {
	const form = await request.formData();

	return {
		approved: formString(form, "approve") === "true",
		clientId: formString(form, "client_id"),
		redirectUri: formString(form, "redirect_uri"),
		state: formString(form, "state"),
		scope: formString(form, "scope"),
		codeChallenge: formString(form, "code_challenge"),
		codeChallengeMethod: formString(form, "code_challenge_method"),
	};
}

/**
 * Checks if a client has already been approved by the user.
 * Stored in KV with key: `approval:{username}:{clientId}`
 */
export async function clientIdAlreadyApproved(
	kv: KVNamespace,
	username: string,
	clientId: string,
): Promise<boolean> {
	const approval = await kv.get(`approval:${username}:${clientId}`);
	return approval === "true";
}

/** Stores client approval in KV for one year. */
export async function storeClientApproval(
	kv: KVNamespace,
	username: string,
	clientId: string,
): Promise<void> {
	await kv.put(`approval:${username}:${clientId}`, "true", {
		expirationTtl: 365 * 24 * 60 * 60,
	});
}
