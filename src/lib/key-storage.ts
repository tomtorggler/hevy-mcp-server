/**
 * API Key Storage Module
 * 
 * Provides secure storage and retrieval of user Hevy API keys in Cloudflare KV.
 * All keys are encrypted at rest using AES-GCM encryption.
 */

/**
 * Converts a hex string to a Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
	}
	return bytes;
}

/**
 * Converts a Uint8Array to a hex string
 */
function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Encrypts an API key using AES-GCM
 * 
 * @param apiKey - The plaintext API key to encrypt
 * @param encryptionKeyHex - The encryption key as a hex string (64 chars / 32 bytes)
 * @returns Base64-encoded encrypted data with IV prepended
 */
export async function encryptApiKey(
	apiKey: string,
	encryptionKeyHex: string,
): Promise<string> {
	// Convert hex key to bytes
	const keyBytes = hexToBytes(encryptionKeyHex);

	// Import the encryption key
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		keyBytes,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt"],
	);

	// Generate a random IV (12 bytes is recommended for AES-GCM)
	const iv = crypto.getRandomValues(new Uint8Array(12));

	// Encode the API key as bytes
	const encoder = new TextEncoder();
	const data = encoder.encode(apiKey);

	// Encrypt the data
	const encrypted = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		cryptoKey,
		data,
	);

	// Combine IV + encrypted data
	const combined = new Uint8Array(iv.length + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.length);

	// Convert to base64 for storage
	return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts an encrypted API key
 * 
 * @param encryptedBase64 - The encrypted API key (base64-encoded, IV prepended)
 * @param encryptionKeyHex - The encryption key as a hex string (64 chars / 32 bytes)
 * @returns The decrypted plaintext API key
 */
export async function decryptApiKey(
	encryptedBase64: string,
	encryptionKeyHex: string,
): Promise<string> {
	// Convert hex key to bytes
	const keyBytes = hexToBytes(encryptionKeyHex);

	// Import the encryption key
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		keyBytes,
		{ name: "AES-GCM", length: 256 },
		false,
		["decrypt"],
	);

	// Decode base64 to bytes
	const combined = Uint8Array.from(atob(encryptedBase64), (c) =>
		c.charCodeAt(0),
	);

	// Extract IV (first 12 bytes) and encrypted data (rest)
	const iv = combined.slice(0, 12);
	const encrypted = combined.slice(12);

	// Decrypt the data
	const decrypted = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv },
		cryptoKey,
		encrypted,
	);

	// Decode bytes to string
	const decoder = new TextDecoder();
	return decoder.decode(decrypted);
}

/**
 * Store a user's Hevy API key in KV (encrypted)
 * 
 * @param kv - Cloudflare KV namespace
 * @param encryptionKey - Encryption key (hex string)
 * @param username - GitHub username
 * @param apiKey - Plaintext Hevy API key
 */
export async function setUserApiKey(
	kv: KVNamespace,
	encryptionKey: string,
	username: string,
	apiKey: string,
): Promise<void> {
	const encrypted = await encryptApiKey(apiKey, encryptionKey);
	const kvKey = `hevy_key:${username}`;
	await kv.put(kvKey, encrypted);
}

/**
 * Retrieve a user's Hevy API key from KV (decrypted)
 * 
 * @param kv - Cloudflare KV namespace
 * @param encryptionKey - Encryption key (hex string)
 * @param username - GitHub username
 * @returns The decrypted API key, or null if not found
 */
export async function getUserApiKey(
	kv: KVNamespace,
	encryptionKey: string,
	username: string,
): Promise<string | null> {
	const kvKey = `hevy_key:${username}`;
	const encrypted = await kv.get(kvKey);

	if (!encrypted) {
		return null;
	}

	try {
		return await decryptApiKey(encrypted, encryptionKey);
	} catch (error) {
		console.error(`Failed to decrypt API key for user ${username}:`, error);
		return null;
	}
}

/**
 * Delete a user's API key from KV
 * 
 * @param kv - Cloudflare KV namespace
 * @param username - GitHub username
 */
export async function deleteUserApiKey(
	kv: KVNamespace,
	username: string,
): Promise<void> {
	const kvKey = `hevy_key:${username}`;
	await kv.delete(kvKey);
}

/**
 * Get a masked version of the API key (for display purposes)
 * 
 * @param apiKey - The full API key
 * @returns Masked version showing only last 4 characters
 */
export function maskApiKey(apiKey: string): string {
	if (apiKey.length <= 4) {
		return "****";
	}
	return `${"*".repeat(apiKey.length - 4)}${apiKey.slice(-4)}`;
}

