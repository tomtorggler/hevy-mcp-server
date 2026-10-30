/**
 * Minimal in-memory stand-in for a Cloudflare KVNamespace, covering the
 * subset of the API this project uses.
 */
export interface MemoryKV {
	get(key: string, type?: "text" | "json"): Promise<any>;
	put(
		key: string,
		value: string,
		options?: { expirationTtl?: number },
	): Promise<void>;
	delete(key: string): Promise<void>;
	list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
	/** Test-only access to the raw store. */
	store: Map<string, string>;
}

export function createMemoryKV(): MemoryKV {
	const store = new Map<string, string>();
	return {
		store,
		async get(key, type) {
			const value = store.get(key);
			if (value === undefined) return null;
			if (type === "json") {
				try {
					return JSON.parse(value);
				} catch {
					return null;
				}
			}
			return value;
		},
		async put(key, value) {
			store.set(key, value);
		},
		async delete(key) {
			store.delete(key);
		},
		async list(options) {
			const prefix = options?.prefix ?? "";
			return {
				keys: Array.from(store.keys())
					.filter((name) => name.startsWith(prefix))
					.map((name) => ({ name })),
			};
		},
	};
}
