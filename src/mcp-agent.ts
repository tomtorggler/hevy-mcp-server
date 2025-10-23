import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HevyClient } from "./lib/client.js";
import {
	CreateWorkoutSchema,
	UpdateWorkoutSchema,
	CreateRoutineSchema,
	UpdateRoutineSchema,
	CreateExerciseTemplateSchema,
	CreateRoutineFolderSchema,
	transformWorkoutToAPI,
	transformRoutineToAPI,
	transformExerciseTemplateToAPI,
	transformRoutineFolderToAPI,
} from "./lib/schemas.js";
import {
	ValidationError,
	validatePagination,
	validateISO8601Date,
	validateWorkoutData,
	validateRoutineData,
	validateExerciseTemplate,
	PAGINATION_LIMITS,
} from "./lib/transforms.js";
import { handleError } from "./lib/errors.js";
import type { Props } from "./utils.js";
import { getUserApiKey } from "./lib/key-storage.js";

// Environment interface for OAuth multi-user support
interface Env {
	MCP_OBJECT: DurableObjectNamespace;
	OAUTH_KV: KVNamespace;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	COOKIE_ENCRYPTION_KEY: string;
	// Legacy: HEVY_API_KEY is deprecated in favor of per-user keys in KV
	HEVY_API_KEY?: string;
}

// Define our MCP agent with Hevy API tools and OAuth support
export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "Hevy API",
		version: "3.0.0",
		description: "Multi-user remote MCP server for Hevy fitness tracking API with OAuth authentication",
	});

	private client!: HevyClient;

	async init() {
		// Check if user is authenticated
		if (!this.props || !this.props.login) {
			const setupHint = this.props?.baseUrl
				? ` Visit ${this.props.baseUrl}/setup to get started.`
				: " Visit your server URL to authenticate.";
			throw new Error(
				"Authentication required. Please authenticate via OAuth to use the Hevy MCP server." +
					setupHint
			);
		}

		// Load user's Hevy API key from encrypted KV storage
		const hevyApiKey = await getUserApiKey(
			this.env.OAUTH_KV,
			this.env.COOKIE_ENCRYPTION_KEY,
			this.props.login
		);

		if (!hevyApiKey) {
			const setupUrl = this.props.baseUrl
				? `${this.props.baseUrl}/setup`
				: '/setup (visit your server URL)';
			throw new Error(
				`Hevy API key not configured for user ${this.props.login}. ` +
					`Please visit ${setupUrl} to configure your API key.`
			);
		}

		// Initialize Hevy API client with user-specific API key
		this.client = new HevyClient({
			apiKey: hevyApiKey,
		});

		// ============================================
		// WORKOUTS
		// ============================================

		this.server.tool(
			"get_workouts",
			{
				page: z.number().optional().describe("Page number (Must be 1 or greater)").default(1),
				page_size: z.number().optional().describe("Number of items per page (Max 10)").default(10),
			},
			async ({ page, page_size }) => {
				try {
					// Validate pagination parameters
					validatePagination(page, page_size, PAGINATION_LIMITS.WORKOUTS);

					const result = await this.client.getWorkouts({ page, pageSize: page_size });

					return {
						content: [
							{ type: "text", text: `Found ${result.count} workouts (page ${page} of ${Math.ceil(result.count / page_size)})` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		this.server.tool(
			"get_workout",
			{
				workout_id: z.string().describe("Workout ID to retrieve"),
			},
			async ({ workout_id }) => {
				try {
					const result = await this.client.getWorkout(workout_id);

					return {
						content: [
							{ type: "text", text: `Workout: ${result.title || 'Untitled'}` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		this.server.tool(
			"create_workout",
			CreateWorkoutSchema.shape,
			async (args) => {
				try {
					// Validate workout data
					validateWorkoutData(args);

					// Transform to API format
					const apiData = transformWorkoutToAPI(args);

					const result = await this.client.createWorkout(apiData);

					return {
						content: [
							{ type: "text", text: `Workout created successfully!` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		this.server.tool(
			"update_workout",
			{
				workout_id: z.string().describe("The ID of the workout to update"),
				...UpdateWorkoutSchema.shape,
			},
			async (args) => {
				try {
					const { workout_id, ...workoutData } = args;

					// Validate workout data
					validateWorkoutData(workoutData);

					// Transform to API format
					const apiData = transformWorkoutToAPI(workoutData);

					const result = await this.client.updateWorkout(workout_id, apiData);

					return {
						content: [
							{ type: "text", text: `Workout updated successfully!` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		this.server.tool(
			"get_workouts_count",
			{},
			async () => {
				try {
					const result = await this.client.getWorkoutsCount();

					return {
						content: [
							{ type: "text", text: `Total workouts: ${result.workout_count}` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		this.server.tool(
			"get_workout_events",
			{
				since: z.string().describe("ISO 8601 date string to get events since"),
			},
			async ({ since }) => {
				try {
					// Validate ISO 8601 date
					validateISO8601Date(since, "since");

					const result = await this.client.getWorkoutEvents({ since });

					return {
						content: [
							{ type: "text", text: `Found ${result.events.length} events since ${since}` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		// ============================================
		// ROUTINES
		// ============================================

		this.server.tool(
			"get_routines",
			{
				page: z.number().optional().describe("Page number (Must be 1 or greater)").default(1),
				page_size: z.number().optional().describe("Number of items per page (Max 10)").default(5),
			},
			async ({ page, page_size }) => {
				try {
					// Validate pagination parameters
					validatePagination(page, page_size, PAGINATION_LIMITS.ROUTINES);

					const result = await this.client.getRoutines({ page, pageSize: page_size });

					return {
						content: [
							{ type: "text", text: `Found ${result.count} routines (page ${page} of ${Math.ceil(result.count / page_size)})` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		this.server.tool(
			"get_routine",
			{
				routine_id: z.string().describe("Routine ID to retrieve"),
			},
			async ({ routine_id }) => {
				try {
					const result = await this.client.getRoutine(routine_id);

					return {
						content: [
							{ type: "text", text: `Routine: ${result.routine.title || 'Untitled'}` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		this.server.tool(
			"create_routine",
			CreateRoutineSchema.shape,
			async (args) => {
				try {
					// Validate routine data
					validateRoutineData(args);

					// Transform to API format
					const apiData = transformRoutineToAPI(args);

					const result = await this.client.createRoutine(apiData);

					return {
						content: [
							{ type: "text", text: `Routine created successfully!` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		this.server.tool(
			"update_routine",
			{
				routine_id: z.string().describe("The ID of the routine to update"),
				...UpdateRoutineSchema.shape,
			},
			async (args) => {
				try {
					const { routine_id, ...routineData } = args;

					// Validate routine data
					validateRoutineData(routineData);

					// Transform to API format
					const apiData = transformRoutineToAPI(routineData);

					const result = await this.client.updateRoutine(routine_id, apiData);

					return {
						content: [
							{ type: "text", text: `Routine updated successfully!` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		// ============================================
		// EXERCISE TEMPLATES
		// ============================================

		this.server.tool(
			"get_exercise_templates",
			{
				page: z.number().optional().describe("Page number (Must be 1 or greater)").default(1),
				page_size: z.number().optional().describe("Number of items per page (Max 100)").default(20),
			},
			async ({ page, page_size }) => {
				try {
					// Validate pagination parameters
					validatePagination(page, page_size, PAGINATION_LIMITS.EXERCISE_TEMPLATES);

					const result = await this.client.getExerciseTemplates({ page, pageSize: page_size });

					return {
						content: [
							{ type: "text", text: `Found ${result.count} exercise templates (page ${page} of ${Math.ceil(result.count / page_size)})` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		this.server.tool(
			"get_exercise_template",
			{
				exercise_template_id: z.string().describe("Exercise template ID to retrieve"),
			},
			async ({ exercise_template_id }) => {
				try {
					const result = await this.client.getExerciseTemplate(exercise_template_id);

					return {
						content: [
							{ type: "text", text: `Exercise Template: ${result.title || 'Untitled'}` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		this.server.tool(
			"create_exercise_template",
			CreateExerciseTemplateSchema.shape,
			async (args) => {
				try {
					// Validate exercise template data
					validateExerciseTemplate(args);

					// Transform to API format
					const apiData = transformExerciseTemplateToAPI(args);

					const result = await this.client.createExerciseTemplate(apiData);

					return {
						content: [
							{ type: "text", text: `Exercise template created successfully!` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		this.server.tool(
			"get_exercise_history",
			{
				exercise_template_id: z.string().describe("Exercise template ID to get history for"),
				start_date: z.string().describe("Start date in YYYY-MM-DD format"),
				end_date: z.string().describe("End date in YYYY-MM-DD format"),
			},
			async ({ exercise_template_id, start_date, end_date }) => {
				try {
					const result = await this.client.getExerciseHistory(exercise_template_id, {
						start_date,
						end_date,
					});

					return {
						content: [
							{ type: "text", text: `Exercise history for ${exercise_template_id} from ${start_date} to ${end_date}` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		// ============================================
		// ROUTINE FOLDERS
		// ============================================

		this.server.tool(
			"get_routine_folders",
			{
				page: z.number().optional().describe("Page number (Must be 1 or greater)").default(1),
				page_size: z.number().optional().describe("Number of items per page (Max 10)").default(10),
			},
			async ({ page, page_size }) => {
				try {
					// Validate pagination parameters
					validatePagination(page, page_size, PAGINATION_LIMITS.ROUTINE_FOLDERS);

					const result = await this.client.getRoutineFolders({ page, pageSize: page_size });

					return {
						content: [
							{ type: "text", text: `Found ${result.count} routine folders (page ${page} of ${Math.ceil(result.count / page_size)})` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		this.server.tool(
			"get_routine_folder",
			{
				routine_folder_id: z.string().describe("Routine folder ID to retrieve"),
			},
			async ({ routine_folder_id }) => {
				try {
					const result = await this.client.getRoutineFolder(routine_folder_id);

					return {
						content: [
							{ type: "text", text: `Routine Folder: ${result.title || 'Untitled'}` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);

		this.server.tool(
			"create_routine_folder",
			CreateRoutineFolderSchema.shape,
			async (args) => {
				try {
					// Transform to API format
					const apiData = transformRoutineFolderToAPI(args);

					const result = await this.client.createRoutineFolder(apiData);

					return {
						content: [
							{ type: "text", text: `Routine folder created successfully!` },
							{ type: "text", text: JSON.stringify(result, null, 2) }
						],
					};
				} catch (error) {
					return handleError(error);
				}
			}
		);
	}
}