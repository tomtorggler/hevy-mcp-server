import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
	createHevyServer,
	SERVER_INSTRUCTIONS,
	TOOL_NAMES,
} from "../src/tools.js";
import type { HevyClient } from "../src/lib/client.js";
import { HevyApiError } from "../src/lib/client.js";
import { VERSION } from "../src/version.js";

/**
 * Drives the real tool surface through the MCP protocol with an in-memory
 * transport, the same way a connected client would.
 */
describe("Hevy MCP tool surface", () => {
	let hevy: Record<string, ReturnType<typeof vi.fn>>;
	let getClient: ReturnType<typeof vi.fn>;
	let client: Client;
	let cleanup: () => Promise<void>;

	async function connect(provider: () => Promise<HevyClient>) {
		const server = createHevyServer(provider);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);

		client = new Client({ name: "test-client", version: "1.0.0" });
		await client.connect(clientTransport);

		cleanup = async () => {
			await client.close();
			await server.close();
		};
	}

	beforeEach(async () => {
		hevy = {
			getWorkouts: vi.fn(),
			getWorkout: vi.fn(),
			getWorkoutsCount: vi.fn(),
			getRoutine: vi.fn(),
			createRoutineFolder: vi.fn(),
		};
		getClient = vi.fn().mockResolvedValue(hevy as unknown as HevyClient);
		await connect(getClient);
	});

	afterEach(async () => {
		await cleanup();
	});

	it("identifies itself and publishes usage instructions", () => {
		expect(client.getServerVersion()).toMatchObject({
			name: "hevy-mcp-server",
			version: VERSION,
		});
		expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
	});

	it("exposes all 17 tools with titles, descriptions and annotations", async () => {
		const { tools } = await client.listTools();

		expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());

		for (const tool of tools) {
			expect(tool.description, tool.name).toBeTruthy();
			expect(tool.title, tool.name).toBeTruthy();
			expect(tool.annotations, tool.name).toBeDefined();
			expect(tool.annotations?.openWorldHint, tool.name).toBe(false);

			const isRead = tool.name.startsWith("get_");
			expect(tool.annotations?.readOnlyHint, tool.name).toBe(isRead);
			if (tool.name.startsWith("update_")) {
				expect(tool.annotations?.destructiveHint, tool.name).toBe(true);
			}
		}
	});

	it("documents pagination limits in the input schema", async () => {
		const { tools } = await client.listTools();
		const schema = tools.find((t) => t.name === "get_workouts")!
			.inputSchema as any;
		expect(schema.properties.page_size.maximum).toBe(10);
		expect(schema.properties.page.minimum).toBe(1);

		const templates = tools.find((t) => t.name === "get_exercise_templates")!
			.inputSchema as any;
		expect(templates.properties.page_size.maximum).toBe(100);
	});

	it("calls through to the Hevy client", async () => {
		hevy.getWorkoutsCount.mockResolvedValue({ workout_count: 42 });

		const result = (await client.callTool({
			name: "get_workouts_count",
			arguments: {},
		})) as any;

		expect(result.isError).toBeFalsy();
		expect(result.content[0].text).toBe("Total workouts: 42");
		expect(getClient).toHaveBeenCalled();
	});

	it("applies default pagination and passes it to the client", async () => {
		hevy.getWorkouts.mockResolvedValue({
			page: 1,
			page_count: 1,
			workouts: [],
		});

		const result = (await client.callTool({
			name: "get_workouts",
			arguments: {},
		})) as any;

		expect(hevy.getWorkouts).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
		expect(result.content[0].text).toContain("Retrieved 0 workouts");
	});

	it("rejects arguments that violate the schema before calling Hevy", async () => {
		await expect(
			client.callTool({ name: "get_workouts", arguments: { page_size: 50 } }),
		).rejects.toThrow(/Invalid arguments/);
		expect(hevy.getWorkouts).not.toHaveBeenCalled();
	});

	it("turns Hevy API failures into readable tool errors", async () => {
		hevy.getWorkout.mockRejectedValue(
			new HevyApiError("Hevy API request failed: 404 Not Found", 404),
		);

		const result = (await client.callTool({
			name: "get_workout",
			arguments: { workout_id: "nope" },
		})) as any;

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("Resource not found");
		expect(result.content[0].text).toContain("How to fix");
	});

	it("explains how to configure a missing API key instead of failing the session", async () => {
		await cleanup();
		await connect(async () => {
			throw new Error(
				"No Hevy API key is configured for @octocat. Ask the user to add one at https://x/setup",
			);
		});

		const { tools } = await client.listTools();
		expect(tools).toHaveLength(TOOL_NAMES.length);

		const result = (await client.callTool({
			name: "get_workouts_count",
			arguments: {},
		})) as any;
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("No Hevy API key is configured");
		expect(result.content[0].text).toContain("https://x/setup");
	});
});
