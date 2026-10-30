import { describe, it, expect } from "vitest";
import {
	computeCodeChallenge,
	isValidCodeVerifier,
	isSupportedCodeChallengeMethod,
	verifyPkce,
} from "../../src/lib/pkce.js";

// RFC 7636 Appendix B test vector
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("PKCE", () => {
	it("computes the S256 challenge from the RFC 7636 test vector", async () => {
		expect(await computeCodeChallenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
	});

	it("verifies a matching verifier", async () => {
		expect(await verifyPkce(RFC_VERIFIER, RFC_CHALLENGE)).toBe(true);
		expect(await verifyPkce(RFC_VERIFIER, RFC_CHALLENGE, "S256")).toBe(true);
	});

	it("rejects a wrong verifier", async () => {
		expect(
			await verifyPkce(`${RFC_VERIFIER.slice(0, -1)}X`, RFC_CHALLENGE),
		).toBe(false);
	});

	it("rejects missing or malformed verifiers", async () => {
		expect(await verifyPkce(undefined, RFC_CHALLENGE)).toBe(false);
		expect(await verifyPkce(null, RFC_CHALLENGE)).toBe(false);
		expect(await verifyPkce("", RFC_CHALLENGE)).toBe(false);
		expect(await verifyPkce("too-short", RFC_CHALLENGE)).toBe(false);
		expect(await verifyPkce(`${RFC_VERIFIER}!`, RFC_CHALLENGE)).toBe(false);
	});

	it("rejects the plain method and unknown methods", async () => {
		expect(await verifyPkce(RFC_VERIFIER, RFC_VERIFIER, "plain")).toBe(false);
		expect(await verifyPkce(RFC_VERIFIER, RFC_CHALLENGE, "S512")).toBe(false);
	});

	it("validates verifier format per RFC 7636 §4.1", () => {
		expect(isValidCodeVerifier("a".repeat(43))).toBe(true);
		expect(isValidCodeVerifier("a".repeat(128))).toBe(true);
		expect(isValidCodeVerifier("a".repeat(42))).toBe(false);
		expect(isValidCodeVerifier("a".repeat(129))).toBe(false);
		expect(isValidCodeVerifier(`${"a".repeat(42)}/`)).toBe(false);
		expect(isValidCodeVerifier(`${"a".repeat(42)}-._~`)).toBe(true);
	});

	it("only supports S256", () => {
		expect(isSupportedCodeChallengeMethod("S256")).toBe(true);
		expect(isSupportedCodeChallengeMethod("plain")).toBe(false);
		expect(isSupportedCodeChallengeMethod(undefined)).toBe(false);
	});
});
