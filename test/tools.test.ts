import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
	createHevyServer,
	SERVER_INSTRUCTIONS,
	TOOL_NAMES,
} from "../src/tools.js";
import { HevyClient, HevyApiError } from "../src/lib/client.js";
import { VERSION } from "../src/version.js";
import { mockFetchPlainText } from "./setup.js";

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
			getUserInfo: vi.fn(),
			createBodyMeasurement: vi.fn(),
			updateBodyMeasurement: vi.fn(),
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

	it("exposes every catalogued tool with title, description and annotations", async () => {
		const { tools } = await client.listTools();

		expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());

		for (const tool of tools) {
			expect(tool.description, tool.name).toBeTruthy();
			expect(tool.title, tool.name).toBeTruthy();
			expect(tool.annotations, tool.name).toBeDefined();
			expect(tool.annotations?.openWorldHint, tool.name).toBe(false);

			const isRead =
				tool.name.startsWith("get_") || tool.name.startsWith("search_");
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

		const templatesTool = tools.find(
			(t) => t.name === "get_exercise_templates",
		)!;
		expect(
			(templatesTool.inputSchema as any).properties.page_size.maximum,
		).toBe(100);
		expect(templatesTool.description).not.toMatch(/there is no search/i);

		const search = tools.find((t) => t.name === "search_exercise_templates")!;
		expect((search.inputSchema as any).required).toContain("query");
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
		const result = (await client.callTool({
			name: "get_workouts",
			arguments: { page_size: 50 },
		})) as any;

		// SDK v2 reports input validation failures as a tool error result
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toMatch(
			/Invalid arguments for tool get_workouts/,
		);
		expect(result.content[0].text).toContain("page_size");
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

	it("summarises the user's profile and units", async () => {
		hevy.getUserInfo.mockResolvedValue({
			data: {
				username: "jhon",
				name: "John Doe",
				weight_unit: "lbs",
				distance_unit: "miles",
				is_pro: true,
			},
		});
		const result = (await client.callTool({
			name: "get_user_info",
			arguments: {},
		})) as any;
		expect(result.isError).toBeFalsy();
		expect(result.content[0].text).toContain("John Doe (@jhon)");
		expect(result.content[0].text).toContain("lbs, miles");
	});

	it("logs a body measurement with only the provided fields", async () => {
		hevy.createBodyMeasurement.mockResolvedValue("");
		const result = (await client.callTool({
			name: "log_body_measurement",
			arguments: { date: "2025-01-02", weight_kg: 80.5, waist: 82 },
		})) as any;
		expect(result.isError).toBeFalsy();
		expect(hevy.createBodyMeasurement).toHaveBeenCalledWith({
			date: "2025-01-02",
			weight_kg: 80.5,
			waist: 82,
		});
		expect(result.content[1].text).toBe("weight: 80.5 kg, waist: 82 cm");
	});

	it("refuses to log an empty body measurement or a malformed date", async () => {
		const empty = (await client.callTool({
			name: "log_body_measurement",
			arguments: { date: "2025-01-02" },
		})) as any;
		expect(empty.isError).toBe(true);
		expect(empty.content[0].text).toContain("at least one measurement value");

		const badDate = (await client.callTool({
			name: "log_body_measurement",
			arguments: { date: "02/01/2025", weight_kg: 80 },
		})) as any;
		expect(badDate.isError).toBe(true);
		expect(hevy.createBodyMeasurement).not.toHaveBeenCalled();
	});

	it("passes explicit nulls through on update so values can be cleared", async () => {
		hevy.updateBodyMeasurement.mockResolvedValue({});
		await client.callTool({
			name: "update_body_measurement",
			arguments: { date: "2025-01-02", weight_kg: 81, waist: null },
		});
		expect(hevy.updateBodyMeasurement).toHaveBeenCalledWith("2025-01-02", {
			weight_kg: 81,
			waist: null,
		});
	});

	it("searches exercise titles case-insensitively across catalog pages", async () => {
		hevy.getExerciseTemplates = vi
			.fn()
			.mockResolvedValueOnce({
				page: 1,
				page_count: 2,
				exercise_templates: [
					{
						id: "1",
						title: "Bench Press (Barbell)",
						type: "weight_reps",
						primary_muscle_group: "chest",
						is_custom: false,
					},
					{
						id: "2",
						title: "Pallof Press",
						type: "weight_reps",
						primary_muscle_group: "abdominals",
						is_custom: false,
					},
				],
			})
			.mockResolvedValueOnce({
				page: 2,
				page_count: 2,
				exercise_templates: [
					{
						id: "3",
						title: "My Custom Pallof",
						type: "weight_reps",
						primary_muscle_group: "abdominals",
						is_custom: true,
					},
					{
						id: "4",
						title: "Squat",
						type: "weight_reps",
						primary_muscle_group: "quadriceps",
						is_custom: false,
					},
				],
			});

		const result = (await client.callTool({
			name: "search_exercise_templates",
			arguments: { query: "pallof" },
		})) as any;

		expect(result.isError).toBeFalsy();
		expect(hevy.getExerciseTemplates).toHaveBeenCalledTimes(2);
		expect(hevy.getExerciseTemplates).toHaveBeenNthCalledWith(1, {
			page: 1,
			pageSize: 100,
		});
		const output = result.content
			.map((part: { text: string }) => part.text)
			.join("\n");
		expect(output).toContain('Found 2 exercise templates matching "pallof"');
		expect(output).toContain("Pallof Press");
		expect(output).toContain("My Custom Pallof");
		expect(output).toContain("ID: 2");
		expect(output).toContain("ID: 3");
		expect(output).toContain("Custom: Yes");
		expect(output).not.toContain("Bench Press");
		expect(output).not.toContain("Squat");
	});

	it("paginates search matches independently of the Hevy catalog pages", async () => {
		hevy.getExerciseTemplates = vi.fn().mockResolvedValue({
			page: 1,
			page_count: 1,
			exercise_templates: [
				{
					id: "1",
					title: "Curl A",
					type: "weight_reps",
					primary_muscle_group: "biceps",
					is_custom: false,
				},
				{
					id: "2",
					title: "Curl B",
					type: "weight_reps",
					primary_muscle_group: "biceps",
					is_custom: false,
				},
				{
					id: "3",
					title: "Press",
					type: "weight_reps",
					primary_muscle_group: "chest",
					is_custom: false,
				},
			],
		});

		const result = (await client.callTool({
			name: "search_exercise_templates",
			arguments: { query: "curl", page: 2, page_size: 1 },
		})) as any;

		const output = result.content
			.map((part: { text: string }) => part.text)
			.join("\n");
		expect(output).toContain(
			'Found 2 exercise templates matching "curl" (page 2 of 2)',
		);
		expect(output).toContain("Curl B");
		expect(output).not.toContain("Curl A");
		expect(output).not.toContain("Press");
	});

	it("returns an empty search page when nothing matches", async () => {
		hevy.getExerciseTemplates = vi.fn().mockResolvedValue({
			page: 1,
			page_count: 1,
			exercise_templates: [
				{
					id: "1",
					title: "Squat",
					type: "weight_reps",
					primary_muscle_group: "quadriceps",
					is_custom: false,
				},
			],
		});

		const result = (await client.callTool({
			name: "search_exercise_templates",
			arguments: { query: "pallof" },
		})) as any;

		const output = result.content
			.map((part: { text: string }) => part.text)
			.join("\n");
		expect(output).toContain('Found 0 exercise templates matching "pallof"');
		expect(output).toContain('No exercise templates matched "pallof"');
	});

	it("reports the new exercise template id after create", async () => {
		hevy.createExerciseTemplate = vi.fn().mockResolvedValue({
			id: "d0778813-ce6b-4f40-a3ec-a9c0f254e3d3",
		});

		const result = (await client.callTool({
			name: "create_exercise_template",
			arguments: {
				title: "Larsen Bench Press",
				exercise_type: "weight_reps",
				equipment_category: "barbell",
				muscle_group: "chest",
			},
		})) as any;

		expect(result.isError).toBeFalsy();
		expect(result.content[0].text).toContain("Larsen Bench Press");
		expect(result.content[1].text).toBe(
			"Exercise Template ID: d0778813-ce6b-4f40-a3ec-a9c0f254e3d3",
		);
	});

	it("reports the id when Hevy returns a plain-text POST body", async () => {
		await cleanup();
		await connect(async () => new HevyClient({ apiKey: "test-api-key" }));
		const id = "d0778813-ce6b-4f40-a3ec-a9c0f254e3d3";
		mockFetchPlainText(id);

		const result = (await client.callTool({
			name: "create_exercise_template",
			arguments: {
				title: "Larsen Bench Press",
				exercise_type: "weight_reps",
				equipment_category: "barbell",
				muscle_group: "chest",
			},
		})) as any;

		const output = result.content
			.map((part: { text: string }) => part.text)
			.join("\n");
		expect(result.isError).toBeFalsy();
		expect(output).toContain(`Exercise Template ID: ${id}`);
		expect(output).not.toContain("undefined");
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
