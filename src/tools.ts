/**
 * Hevy MCP tool definitions.
 *
 * Kept independent of the Durable Object / transport layer so the tool surface
 * can be exercised with an in-memory MCP client in tests, and so it can move to
 * a stateless handler without changes.
 */

import {
	McpServer,
	type ToolAnnotations,
	type ToolCallback,
} from "@modelcontextprotocol/server";
import { z, type ZodRawShape } from "zod";
import type { HevyClient } from "./lib/client.js";
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
	validateISO8601Date,
	validateWorkoutData,
	validateRoutineData,
	validateExerciseTemplate,
	PAGINATION_LIMITS,
} from "./lib/transforms.js";
import { handleError, type McpToolResponse } from "./lib/errors.js";
import { TOOL_NAMES } from "./tool-catalog.js";
import { VERSION } from "./version.js";

export { TOOL_NAMES };

/** Resolves the Hevy client for the current user, or throws a user-facing error. */
export type ClientProvider = () => Promise<HevyClient>;

export const SERVER_INFO = {
	name: "hevy-mcp-server",
	title: "Hevy",
	version: VERSION,
};

export const SERVER_INSTRUCTIONS = `Tools for the signed-in user's Hevy fitness account.
- Exercise IDs: look up exercise_template_id values with get_exercise_templates / get_exercise_template before creating or updating workouts and routines. Never guess IDs.
- Times are ISO 8601 with timezone (e.g. 2025-01-15T10:00:00Z). Weights are kilograms, distances meters, durations seconds.
- Page sizes are capped: 10 for workouts, routines and folders; 100 for exercise templates. Page numbers start at 1.
- update_workout and update_routine replace the whole record. Fetch it first, change what is needed, and send back all exercises and sets.
- Workouts record what happened; routines are templates (they support rep ranges and rest times, not RPE).`;

const READ_ONLY: ToolAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
};
const CREATES: ToolAnnotations = {
	readOnlyHint: false,
	destructiveHint: false,
	idempotentHint: false,
	openWorldHint: false,
};
const REPLACES: ToolAnnotations = {
	readOnlyHint: false,
	destructiveHint: true,
	idempotentHint: true,
	openWorldHint: false,
};

// Pagination limits are enforced by the schema (min/max), so handlers need no
// second check; the SDK rejects out-of-range arguments before they run.
const pageParam = z
	.number()
	.int()
	.min(1)
	.optional()
	.default(1)
	.describe("Page number, starting at 1");
const pageSizeParam = (max: number, fallback: number) =>
	z
		.number()
		.int()
		.min(1)
		.max(max)
		.optional()
		.default(fallback)
		.describe(`Items per page (1-${max})`);

type ToolHandler<Args extends ZodRawShape> = (
	args: z.output<z.ZodObject<Args>>,
	client: HevyClient,
) => Promise<McpToolResponse>;

interface ToolConfig<Args extends ZodRawShape> {
	title: string;
	description: string;
	inputSchema: Args;
	annotations: ToolAnnotations;
}

function text(value: string): { type: "text"; text: string } {
	return { type: "text", text: value };
}

function json(value: unknown): { type: "text"; text: string } {
	return text(JSON.stringify(value, null, 2));
}

/** Create a fully configured Hevy MCP server. */
export function createHevyServer(getClient: ClientProvider): McpServer {
	const server = new McpServer(SERVER_INFO, {
		instructions: SERVER_INSTRUCTIONS,
	});
	registerHevyTools(server, getClient);
	return server;
}

/** Register all Hevy tools on an existing server. */
export function registerHevyTools(
	server: McpServer,
	getClient: ClientProvider,
): void {
	function tool<Args extends ZodRawShape>(
		name: string,
		config: ToolConfig<Args>,
		handler: ToolHandler<Args>,
	) {
		const callback = async (
			args: z.output<z.ZodObject<Args>>,
		): Promise<McpToolResponse> => {
			try {
				const client = await getClient();
				return await handler(args, client);
			} catch (error) {
				return handleError(error);
			}
		};
		const { inputSchema, ...rest } = config;
		server.registerTool(
			name,
			{ ...rest, inputSchema: z.object(inputSchema) },
			callback as unknown as ToolCallback<z.ZodObject<Args>>,
		);
	}

	// ============================================
	// WORKOUTS
	// ============================================

	tool(
		"get_workouts",
		{
			title: "List workouts",
			description:
				"List the user's logged workouts, newest first, with full exercise and set details. Paginated (max 10 per page). Use get_workouts_count to know how many pages exist.",
			inputSchema: {
				page: pageParam,
				page_size: pageSizeParam(PAGINATION_LIMITS.WORKOUTS, 10),
			},
			annotations: READ_ONLY,
		},
		async ({ page, page_size }, client) => {
			const workouts = await client.getWorkouts({ page, pageSize: page_size });

			const summary =
				workouts.workouts
					?.map(
						(workout: any, index: number) =>
							`Workout ${index + 1}: ${workout.title || "Untitled"}\n  ID: ${workout.id}\n  Date: ${workout.start_time}`,
					)
					.join("\n") || "No workouts found";

			return {
				content: [
					text(
						`Retrieved ${workouts.workouts?.length || 0} workouts (page ${workouts.page} of ${workouts.page_count})`,
					),
					text(summary),
					text(`\n\nFull data:\n${JSON.stringify(workouts.workouts, null, 2)}`),
				],
			};
		},
	);

	tool(
		"get_workout",
		{
			title: "Get workout",
			description: "Get one workout by ID, including every exercise and set.",
			inputSchema: {
				workout_id: z.string().describe("The ID of the workout to retrieve"),
			},
			annotations: READ_ONLY,
		},
		async ({ workout_id }, client) => {
			const workout = await client.getWorkout(workout_id);
			return {
				content: [
					text(
						`Workout: ${workout.title || "Untitled"}\nID: ${workout.id}\nExercises: ${workout.exercises?.length || 0}`,
					),
					json(workout),
				],
			};
		},
	);

	tool(
		"create_workout",
		{
			title: "Log workout",
			description:
				"Log a completed workout. Each exercise needs an exercise_template_id (look it up first) and a title for display; order follows the array. Sets need a type and the metrics that apply (weight_kg/reps, distance_meters, duration_seconds). Returns the created workout with its ID.",
			inputSchema: CreateWorkoutSchema.shape,
			annotations: CREATES,
		},
		async (args, client) => {
			validateWorkoutData(args);
			const workout = await client.createWorkout(transformWorkoutToAPI(args));
			return {
				content: [
					text(`✓ Successfully logged workout: ${workout.title}`),
					text(
						`Workout ID: ${workout.id}\nExercises: ${workout.exercises?.length || 0}\nStarted: ${args.start_time}`,
					),
					text(`\n\nWorkout data:\n${JSON.stringify(workout, null, 2)}`),
				],
			};
		},
	);

	tool(
		"update_workout",
		{
			title: "Update workout",
			description:
				"Replace an existing workout. This overwrites the whole workout: call get_workout first and send back all exercises and sets, including unchanged ones.",
			inputSchema: {
				workout_id: z.string().describe("The ID of the workout to update"),
				...UpdateWorkoutSchema.shape,
			},
			annotations: REPLACES,
		},
		async (args, client) => {
			const { workout_id, ...workoutData } = args;
			validateWorkoutData(workoutData);
			const workout = await client.updateWorkout(
				workout_id,
				transformWorkoutToAPI(workoutData),
			);
			return {
				content: [
					text(`✓ Successfully updated workout: ${workout.title}`),
					text(
						`Workout ID: ${workout.id}\nExercises: ${workout.exercises?.length || 0}`,
					),
				],
			};
		},
	);

	tool(
		"get_workouts_count",
		{
			title: "Count workouts",
			description: "Get the total number of workouts in the user's account.",
			inputSchema: {},
			annotations: READ_ONLY,
		},
		async (_args, client) => {
			const result = await client.getWorkoutsCount();
			return { content: [text(`Total workouts: ${result.workout_count}`)] };
		},
	);

	tool(
		"get_workout_events",
		{
			title: "List workout changes",
			description:
				"List workouts that were updated or deleted since a given time. Intended for syncing; use get_workouts for browsing.",
			inputSchema: {
				page: pageParam,
				page_size: pageSizeParam(PAGINATION_LIMITS.WORKOUT_EVENTS, 5),
				since: z
					.string()
					.optional()
					.describe(
						"Only events after this time (ISO 8601, e.g. 2024-01-01T00:00:00Z)",
					),
			},
			annotations: READ_ONLY,
		},
		async (args, client) => {
			if (args.since) validateISO8601Date(args.since, "since");

			const params: { page: number; pageSize: number; since?: string } = {
				page: args.page,
				pageSize: args.page_size,
			};
			if (args.since) params.since = args.since;

			const events = await client.getWorkoutEvents(params);

			const summary =
				events.events
					?.map((event: any, index: number) =>
						event.type === "deleted"
							? `${index + 1}. DELETED - Workout ID: ${event.id}\n   Deleted at: ${event.deleted_at}`
							: `${index + 1}. UPDATED - ${event.workout?.title || "Untitled"}\n   Workout ID: ${event.workout?.id}\n   Updated: ${event.workout?.updated_at}`,
					)
					.join("\n") || "No events found";

			return {
				content: [
					text(
						`Retrieved ${events.events?.length || 0} workout events (page ${events.page} of ${events.page_count})`,
					),
					text(summary),
				],
			};
		},
	);

	// ============================================
	// ROUTINES
	// ============================================

	tool(
		"get_routines",
		{
			title: "List routines",
			description:
				"List the user's workout routines (templates) with their exercises. Paginated (max 10 per page).",
			inputSchema: {
				page: pageParam,
				page_size: pageSizeParam(PAGINATION_LIMITS.ROUTINES, 5),
			},
			annotations: READ_ONLY,
		},
		async ({ page, page_size }, client) => {
			const routines = await client.getRoutines({ page, pageSize: page_size });

			const summary =
				routines.routines
					?.map(
						(routine: any, index: number) =>
							`Routine ${index + 1}: ${routine.title}\n  Exercises: ${routine.exercises?.length || 0}\n  ID: ${routine.id}`,
					)
					.join("\n") || "No routines found";

			return {
				content: [
					text(
						`Retrieved ${routines.routines?.length || 0} routines (page ${routines.page} of ${routines.page_count})`,
					),
					text(summary),
					text(`\n\nFull data:\n${JSON.stringify(routines.routines, null, 2)}`),
				],
			};
		},
	);

	tool(
		"get_routine",
		{
			title: "Get routine",
			description:
				"Get one routine by ID, including every exercise, set and rep range.",
			inputSchema: {
				routine_id: z.string().describe("The ID of the routine to retrieve"),
			},
			annotations: READ_ONLY,
		},
		async ({ routine_id }, client) => {
			const result = await client.getRoutine(routine_id);
			const routine = result.routine;
			return {
				content: [
					text(
						`Routine: ${routine.title}\nID: ${routine.id}\nExercises: ${routine.exercises?.length || 0}`,
					),
					json(routine),
				],
			};
		},
	);

	tool(
		"create_routine",
		{
			title: "Create routine",
			description:
				"Create a workout routine (template). Exercises reference an exercise_template_id and may set rest_seconds; sets may use rep_range (e.g. 8-12) instead of fixed reps. Optionally place it in a folder via folder_id.",
			inputSchema: CreateRoutineSchema.shape,
			annotations: CREATES,
		},
		async (args, client) => {
			validateRoutineData(args);
			const routine = await client.createRoutine(transformRoutineToAPI(args));
			return {
				content: [
					text(`✓ Successfully created routine: ${routine.title}`),
					text(
						`Routine ID: ${routine.id}\nExercises: ${routine.exercises?.length || 0}`,
					),
					text(`\n\nFull routine data:\n${JSON.stringify(routine, null, 2)}`),
				],
			};
		},
	);

	tool(
		"update_routine",
		{
			title: "Update routine",
			description:
				"Replace an existing routine. This overwrites the whole routine: call get_routine first and send back all exercises and sets, including unchanged ones. The folder cannot be changed here.",
			inputSchema: {
				routine_id: z.string().describe("The ID of the routine to update"),
				...UpdateRoutineSchema.shape,
			},
			annotations: REPLACES,
		},
		async (args, client) => {
			const { routine_id, ...routineData } = args;
			validateRoutineData(routineData);
			const routine = await client.updateRoutine(
				routine_id,
				transformRoutineToAPI(routineData),
			);
			return {
				content: [
					text(`✓ Successfully updated routine: ${routine.title}`),
					text(
						`Routine ID: ${routine.id}\nExercises: ${routine.exercises?.length || 0}`,
					),
				],
			};
		},
	);

	// ============================================
	// EXERCISE TEMPLATES
	// ============================================

	tool(
		"get_exercise_templates",
		{
			title: "List exercises",
			description:
				"Browse the exercise library (Hevy's built-in exercises plus the user's custom ones) to find exercise_template_id values. Paginated (max 100 per page); there is no search, so page through and match titles.",
			inputSchema: {
				page: pageParam,
				page_size: pageSizeParam(PAGINATION_LIMITS.EXERCISE_TEMPLATES, 20),
			},
			annotations: READ_ONLY,
		},
		async ({ page, page_size }, client) => {
			const templates = await client.getExerciseTemplates({
				page,
				pageSize: page_size,
			});

			const summary =
				templates.exercise_templates
					?.map(
						(template: any, index: number) =>
							`${index + 1}. ${template.title} (${template.type})\n   ID: ${template.id}\n   Primary: ${template.primary_muscle_group}\n   Custom: ${template.is_custom ? "Yes" : "No"}`,
					)
					.join("\n") || "No exercise templates found";

			return {
				content: [
					text(
						`Retrieved ${templates.exercise_templates?.length || 0} exercise templates (page ${templates.page} of ${templates.page_count})`,
					),
					text(summary),
				],
			};
		},
	);

	tool(
		"get_exercise_template",
		{
			title: "Get exercise",
			description:
				"Get one exercise template by ID: type, equipment and muscle groups.",
			inputSchema: {
				exercise_template_id: z
					.string()
					.describe("The ID of the exercise template"),
			},
			annotations: READ_ONLY,
		},
		async ({ exercise_template_id }, client) => {
			const template = await client.getExerciseTemplate(exercise_template_id);
			return {
				content: [
					text(
						`Exercise: ${template.title}\nType: ${template.type}\nPrimary Muscle: ${template.primary_muscle_group}\nCustom: ${template.is_custom ? "Yes" : "No"}`,
					),
					json(template),
				],
			};
		},
	);

	tool(
		"create_exercise_template",
		{
			title: "Create custom exercise",
			description:
				"Create a custom exercise in the user's library. Check get_exercise_templates first to avoid duplicating a built-in exercise.",
			inputSchema: CreateExerciseTemplateSchema.shape,
			annotations: CREATES,
		},
		async (args, client) => {
			validateExerciseTemplate(args);
			const result = await client.createExerciseTemplate(
				transformExerciseTemplateToAPI(args),
			);
			return {
				content: [
					text(
						`✓ Successfully created custom exercise template: ${args.title}`,
					),
					text(`Exercise Template ID: ${result.id}`),
				],
			};
		},
	);

	tool(
		"get_exercise_history",
		{
			title: "Exercise history",
			description:
				"Every set the user has logged for one exercise, optionally within a date range. Use it for progress and personal-record questions.",
			inputSchema: {
				exercise_template_id: z
					.string()
					.describe("The ID of the exercise template"),
				start_date: z
					.string()
					.optional()
					.describe(
						"Optional start date (ISO 8601, e.g. 2024-01-01T00:00:00Z)",
					),
				end_date: z
					.string()
					.optional()
					.describe("Optional end date (ISO 8601, e.g. 2024-12-31T23:59:59Z)"),
			},
			annotations: READ_ONLY,
		},
		async (args, client) => {
			if (args.start_date) validateISO8601Date(args.start_date, "start_date");
			if (args.end_date) validateISO8601Date(args.end_date, "end_date");
			if (
				args.start_date &&
				args.end_date &&
				new Date(args.end_date) <= new Date(args.start_date)
			) {
				throw new ValidationError("end_date must be after start_date");
			}

			const params: { start_date?: string; end_date?: string } = {};
			if (args.start_date) params.start_date = args.start_date;
			if (args.end_date) params.end_date = args.end_date;

			const history = await client.getExerciseHistory(
				args.exercise_template_id,
				params,
			);

			const summary =
				history.exercise_history
					?.map(
						(entry: any, index: number) =>
							`${index + 1}. ${entry.workout_title} (${entry.workout_start_time})\n   Weight: ${entry.weight_kg}kg, Reps: ${entry.reps}, RPE: ${entry.rpe || "N/A"}\n   Set Type: ${entry.set_type}`,
					)
					.join("\n") || "No exercise history found";

			return {
				content: [
					text(
						`Retrieved ${history.exercise_history?.length || 0} exercise history entries`,
					),
					text(summary),
					text(
						`\n\nFull data:\n${JSON.stringify(history.exercise_history, null, 2)}`,
					),
				],
			};
		},
	);

	// ============================================
	// ROUTINE FOLDERS
	// ============================================

	tool(
		"get_routine_folders",
		{
			title: "List routine folders",
			description:
				"List the folders used to organise routines. Paginated (max 10 per page).",
			inputSchema: {
				page: pageParam,
				page_size: pageSizeParam(PAGINATION_LIMITS.ROUTINE_FOLDERS, 10),
			},
			annotations: READ_ONLY,
		},
		async ({ page, page_size }, client) => {
			const folders = await client.getRoutineFolders({
				page,
				pageSize: page_size,
			});

			const summary =
				folders.routine_folders
					?.map(
						(folder: any, index: number) =>
							`${index + 1}. ${folder.title}\n   ID: ${folder.id}\n   Index: ${folder.index}`,
					)
					.join("\n") || "No routine folders found";

			return {
				content: [
					text(
						`Retrieved ${folders.routine_folders?.length || 0} routine folders (page ${folders.page} of ${folders.page_count})`,
					),
					text(summary),
				],
			};
		},
	);

	tool(
		"get_routine_folder",
		{
			title: "Get routine folder",
			description: "Get one routine folder by ID.",
			inputSchema: {
				folder_id: z.string().describe("The ID of the routine folder"),
			},
			annotations: READ_ONLY,
		},
		async ({ folder_id }, client) => {
			const folder = await client.getRoutineFolder(folder_id);
			return {
				content: [
					text(
						`Folder: ${folder.title}\nID: ${folder.id}\nIndex: ${folder.index}`,
					),
					json(folder),
				],
			};
		},
	);

	tool(
		"create_routine_folder",
		{
			title: "Create routine folder",
			description:
				"Create a folder for organising routines. Returns the folder ID to use as folder_id in create_routine.",
			inputSchema: CreateRoutineFolderSchema.shape,
			annotations: CREATES,
		},
		async (args, client) => {
			const folder = await client.createRoutineFolder(
				transformRoutineFolderToAPI(args),
			);
			return {
				content: [
					text(`✓ Successfully created routine folder: ${folder.title}`),
					text(`Folder ID: ${folder.id}\nIndex: ${folder.index}`),
				],
			};
		},
	);
}
