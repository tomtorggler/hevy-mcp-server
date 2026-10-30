/**
 * PKCE (RFC 7636) helpers. OAuth 2.1 requires PKCE with the S256 method.
 */

export const SUPPORTED_CODE_CHALLENGE_METHODS = ["S256"] as const;
export type CodeChallengeMethod =
	(typeof SUPPORTED_CODE_CHALLENGE_METHODS)[number];

function base64UrlEncode(bytes: ArrayBuffer): string {
	let binary = "";
	for (const byte of new Uint8Array(bytes)) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/** Compute the S256 code challenge for a verifier. */
export async function computeCodeChallenge(
	codeVerifier: string,
): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(codeVerifier),
	);
	return base64UrlEncode(digest);
}

/** RFC 7636 §4.1: 43–128 characters from the unreserved set. */
export function isValidCodeVerifier(codeVerifier: string): boolean {
	return /^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier);
}

export function isSupportedCodeChallengeMethod(
	method: string | undefined,
): method is CodeChallengeMethod {
	return (
		method !== undefined &&
		(SUPPORTED_CODE_CHALLENGE_METHODS as readonly string[]).includes(method)
	);
}

/**
 * Verify a code_verifier against the stored code_challenge.
 * Returns false (never throws) on any mismatch or malformed input.
 */
export async function verifyPkce(
	codeVerifier: string | undefined | null,
	codeChallenge: string,
	method: string = "S256",
): Promise<boolean> {
	if (!codeVerifier || !isValidCodeVerifier(codeVerifier)) return false;
	if (!isSupportedCodeChallengeMethod(method)) return false;

	const expected = await computeCodeChallenge(codeVerifier);
	if (expected.length !== codeChallenge.length) return false;

	// Constant-time comparison
	let diff = 0;
	for (let i = 0; i < expected.length; i++) {
		diff |= expected.charCodeAt(i) ^ codeChallenge.charCodeAt(i);
	}
	return diff === 0;
}
