import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	isClientIdMetadataUrl,
	isRedirectUriAllowed,
	resolveClient,
	validateRedirectUris,
} from "../../src/lib/oauth-clients.js";
import { createMemoryKV } from "../helpers/memory-kv.js";

describe("isRedirectUriAllowed", () => {
	const allowed = [
		"https://app.example.com/callback",
		"http://localhost:3000/callback",
	];

	it("accepts exact matches", () => {
		expect(
			isRedirectUriAllowed("https://app.example.com/callback", allowed),
		).toBe(true);
	});

	it("rejects unregistered URIs, including subtle variations", () => {
		expect(
			isRedirectUriAllowed("https://evil.example.com/callback", allowed),
		).toBe(false);
		expect(
			isRedirectUriAllowed("https://app.example.com/callback/evil", allowed),
		).toBe(false);
		expect(
			isRedirectUriAllowed("https://app.example.com/callback?x=1", allowed),
		).toBe(false);
		expect(
			isRedirectUriAllowed("http://app.example.com/callback", allowed),
		).toBe(false);
		expect(isRedirectUriAllowed("not a url", allowed)).toBe(false);
	});

	it("allows any port for loopback redirect URIs (RFC 8252 §7.3)", () => {
		expect(
			isRedirectUriAllowed("http://localhost:51234/callback", allowed),
		).toBe(true);
		expect(isRedirectUriAllowed("http://localhost/callback", allowed)).toBe(
			true,
		);
	});

	it("does not relax loopback matching beyond the port", () => {
		expect(isRedirectUriAllowed("http://localhost:3000/other", allowed)).toBe(
			false,
		);
		expect(
			isRedirectUriAllowed("http://127.0.0.1:3000/callback", allowed),
		).toBe(false);
		expect(
			isRedirectUriAllowed("https://localhost:3000/callback", allowed),
		).toBe(false);
	});
});

describe("isClientIdMetadataUrl", () => {
	it("accepts https URLs with a path", () => {
		expect(isClientIdMetadataUrl("https://claude.ai/oauth/client.json")).toBe(
			true,
		);
	});

	it("rejects anything else", () => {
		expect(isClientIdMetadataUrl("https://claude.ai")).toBe(false);
		expect(isClientIdMetadataUrl("https://claude.ai/")).toBe(false);
		expect(isClientIdMetadataUrl("http://claude.ai/client.json")).toBe(false);
		expect(isClientIdMetadataUrl("https://claude.ai/client.json#frag")).toBe(
			false,
		);
		expect(isClientIdMetadataUrl("https://user@claude.ai/client.json")).toBe(
			false,
		);
		expect(isClientIdMetadataUrl("abc123")).toBe(false);
	});
});

describe("validateRedirectUris", () => {
	it("accepts a non-empty array of absolute URLs", () => {
		expect(
			validateRedirectUris([
				"https://a.example/cb",
				"http://localhost:1234/cb",
			]),
		).toEqual(["https://a.example/cb", "http://localhost:1234/cb"]);
	});

	it("rejects empty, non-array, non-string and relative values", () => {
		expect(validateRedirectUris([])).toBeNull();
		expect(validateRedirectUris("https://a.example/cb")).toBeNull();
		expect(validateRedirectUris([42])).toBeNull();
		expect(validateRedirectUris(["/callback"])).toBeNull();
		expect(validateRedirectUris(undefined)).toBeNull();
	});
});

describe("resolveClient", () => {
	let kv: ReturnType<typeof createMemoryKV>;
	const fetchFn = vi.fn();

	beforeEach(() => {
		kv = createMemoryKV();
		fetchFn.mockReset();
	});

	it("resolves a dynamically registered client from KV", async () => {
		await kv.put(
			"client:abc",
			JSON.stringify({
				client_id: "abc",
				client_name: "Test Client",
				redirect_uris: ["https://a.example/cb"],
				created_at: "2025-01-01T00:00:00Z",
			}),
		);

		const client = await resolveClient(kv as any, "abc", fetchFn);
		expect(client).toEqual({
			clientId: "abc",
			clientName: "Test Client",
			clientUri: undefined,
			redirectUris: ["https://a.example/cb"],
			source: "registered",
		});
	});

	it("returns null for unknown opaque client IDs, including the old setup pseudo-client", async () => {
		expect(await resolveClient(kv as any, "nope", fetchFn)).toBeNull();
		expect(await resolveClient(kv as any, "setup", fetchFn)).toBeNull();
		expect(fetchFn).not.toHaveBeenCalled();
	});

	describe("Client ID Metadata Documents", () => {
		const clientId = "https://client.example/oauth/client.json";
		const document = {
			client_id: clientId,
			client_name: "Example Client",
			client_uri: "https://client.example",
			redirect_uris: ["https://client.example/callback"],
		};

		function respondWith(body: unknown, status = 200) {
			fetchFn.mockResolvedValue(
				new Response(typeof body === "string" ? body : JSON.stringify(body), {
					status,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}

		it("fetches, validates and caches the document", async () => {
			respondWith(document);

			const client = await resolveClient(kv as any, clientId, fetchFn);
			expect(client).toEqual({
				clientId,
				clientName: "Example Client",
				clientUri: "https://client.example",
				redirectUris: ["https://client.example/callback"],
				source: "metadata_document",
			});
			expect(fetchFn).toHaveBeenCalledTimes(1);
			expect(fetchFn.mock.calls[0][0]).toBe(clientId);
			expect(fetchFn.mock.calls[0][1]).toMatchObject({ redirect: "error" });

			// Second resolution is served from the KV cache
			await resolveClient(kv as any, clientId, fetchFn);
			expect(fetchFn).toHaveBeenCalledTimes(1);
		});

		it("rejects a document whose client_id does not match the URL", async () => {
			respondWith({
				...document,
				client_id: "https://other.example/client.json",
			});
			expect(await resolveClient(kv as any, clientId, fetchFn)).toBeNull();
		});

		it("rejects a document without redirect_uris", async () => {
			respondWith({ client_id: clientId, client_name: "x" });
			expect(await resolveClient(kv as any, clientId, fetchFn)).toBeNull();
		});

		it("rejects non-JSON and non-2xx responses", async () => {
			respondWith("<html>nope</html>");
			expect(await resolveClient(kv as any, clientId, fetchFn)).toBeNull();

			respondWith(document, 404);
			expect(await resolveClient(kv as any, clientId, fetchFn)).toBeNull();
		});

		it("falls back to the hostname when client_name is missing", async () => {
			respondWith({
				client_id: clientId,
				redirect_uris: document.redirect_uris,
			});
			const client = await resolveClient(kv as any, clientId, fetchFn);
			expect(client?.clientName).toBe("client.example");
		});

		it("does not fetch for non-https or path-less URLs", async () => {
			expect(
				await resolveClient(
					kv as any,
					"http://client.example/client.json",
					fetchFn,
				),
			).toBeNull();
			expect(
				await resolveClient(kv as any, "https://client.example", fetchFn),
			).toBeNull();
			expect(fetchFn).not.toHaveBeenCalled();
		});
	});
});
