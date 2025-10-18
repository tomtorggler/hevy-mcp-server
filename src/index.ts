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

// Define our MCP agent with Hevy API tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Hevy API",
		version: "2.1.2",
		description: "Remote MCP server for Hevy fitness tracking API with streamable-http transport",
	});

	private client!: HevyClient;

	async init() {
		// Initialize Hevy API client with environment API key
		this.client = new HevyClient({
			apiKey: (this.env as any).HEVY_API_KEY,
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

					const workouts = await this.client.getWorkouts({ page, pageSize: page_size });

					const workoutDetails = workouts.workouts?.map((workout: any, index: number) => {
						return `Workout ${index + 1}: ${workout.title || 'Untitled'}\n  ID: ${workout.id}\n  Date: ${workout.start_time}`;
					}).join('\n') || 'No workouts found';

					return {
						content: [
							{
								type: "text",
								text: `Retrieved ${workouts.workouts?.length || 0} workouts (page ${workouts.page} of ${workouts.page_count})`,
							},
							{
								type: "text",
								text: workoutDetails,
							},
							{
								type: "text",
								text: `\n\nFull data:\n${JSON.stringify(workouts.workouts, null, 2)}`,
							},
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
				workout_id: z.string().describe("The ID of the workout to retrieve"),
			},
			async ({ workout_id }) => {
				try {
					const workout = await this.client.getWorkout(workout_id);

					return {
						content: [
							{
								type: "text",
								text: `Workout: ${workout.title || 'Untitled'}\nID: ${workout.id}\nExercises: ${workout.exercises?.length || 0}`,
							},
							{
								type: "text",
								text: JSON.stringify(workout, null, 2),
							},
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
					// Validate workout data including dates, exercises, and RPE values
					validateWorkoutData(args);
					
					const workout = await this.client.createWorkout(transformWorkoutToAPI(args));

					return {
						content: [
							{
								type: "text",
								text: `✓ Successfully logged workout: ${workout.title}`,
							},
							{
								type: "text",
								text: `Workout ID: ${workout.id}\nExercises: ${workout.exercises?.length || 0}\nStarted: ${args.start_time}`,
							},
							{
								type: "text",
								text: `\n\nWorkout data:\n${JSON.stringify(workout, null, 2)}`,
							},
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
							{
								type: "text",
								text: `Total workouts: ${result.workout_count}`,
							},
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

					// Validate workout data including dates, exercises, and RPE values
					validateWorkoutData(workoutData);

					const workout = await this.client.updateWorkout(workout_id, transformWorkoutToAPI(workoutData));

					return {
						content: [
							{
								type: "text",
								text: `✓ Successfully updated workout: ${workout.title}`,
							},
							{
								type: "text",
								text: `Workout ID: ${workout.id}\nExercises: ${workout.exercises?.length || 0}`,
							},
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
				page: z.number().optional().describe("Page number (Must be 1 or greater)").default(1),
				page_size: z.number().optional().describe("Number of items per page (Max 10)").default(5),
				since: z.string().optional().describe("Get events since this date (ISO 8601 format, e.g., 2024-01-01T00:00:00Z)"),
			},
			async (args) => {
				try {
					// Validate pagination parameters
					validatePagination(args.page, args.page_size, PAGINATION_LIMITS.WORKOUT_EVENTS);

					// Validate date format if provided
					if (args.since) {
						validateISO8601Date(args.since, "since");
					}

					const params: any = { page: args.page, pageSize: args.page_size };
					if (args.since) params.since = args.since;

					const events = await this.client.getWorkoutEvents(params);

					const eventDetails = events.events?.map((event: any, index: number) => {
						if (event.type === 'deleted') {
							return `${index + 1}. DELETED - Workout ID: ${event.id}\n   Deleted at: ${event.deleted_at}`;
						} else {
							return `${index + 1}. UPDATED - ${event.workout?.title || 'Untitled'}\n   Workout ID: ${event.workout?.id}\n   Updated: ${event.workout?.updated_at}`;
						}
					}).join('\n') || 'No events found';

					return {
						content: [
							{
								type: "text",
								text: `Retrieved ${events.events?.length || 0} workout events (page ${events.page} of ${events.page_count})`,
							},
							{
								type: "text",
								text: eventDetails,
							},
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

					const routines = await this.client.getRoutines({ page, pageSize: page_size });

					const routineDetails = routines.routines?.map((routine: any, index: number) => {
						const exerciseCount = routine.exercises?.length || 0;
						return `Routine ${index + 1}: ${routine.title}\n  Exercises: ${exerciseCount}\n  ID: ${routine.id}`;
					}).join('\n') || 'No routines found';

					return {
						content: [
							{
								type: "text",
								text: `Retrieved ${routines.routines?.length || 0} routines (page ${routines.page} of ${routines.page_count})`,
							},
							{
								type: "text",
								text: routineDetails,
							},
							{
								type: "text",
								text: `\n\nFull data:\n${JSON.stringify(routines.routines, null, 2)}`,
							},
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
				routine_id: z.string().describe("The ID of the routine to retrieve"),
			},
			async ({ routine_id }) => {
				try {
					const result = await this.client.getRoutine(routine_id);
					const routine = result.routine;

					return {
						content: [
							{
								type: "text",
								text: `Routine: ${routine.title}\nID: ${routine.id}\nExercises: ${routine.exercises?.length || 0}`,
							},
							{
								type: "text",
								text: JSON.stringify(routine, null, 2),
							},
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
					// Validate routine data including exercises and sets
					validateRoutineData(args);
					
					const routine = await this.client.createRoutine(transformRoutineToAPI(args));

					return {
						content: [
							{
								type: "text",
								text: `✓ Successfully created routine: ${routine.title}`,
							},
							{
								type: "text",
								text: `Routine ID: ${routine.id}\nExercises: ${routine.exercises?.length || 0}`,
							},
							{
								type: "text",
								text: `\n\nFull routine data:\n${JSON.stringify(routine, null, 2)}`,
							},
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

					// Validate routine data including exercises and sets
					validateRoutineData(routineData);

					const routine = await this.client.updateRoutine(routine_id, transformRoutineToAPI(routineData));

					return {
						content: [
							{
								type: "text",
								text: `✓ Successfully updated routine: ${routine.title}`,
							},
							{
								type: "text",
								text: `Routine ID: ${routine.id}\nExercises: ${routine.exercises?.length || 0}`,
							},
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
					// Validate pagination parameters with higher limit for templates
					validatePagination(page, page_size, PAGINATION_LIMITS.EXERCISE_TEMPLATES);

					const templates = await this.client.getExerciseTemplates({ page, pageSize: page_size });

					const templateDetails = templates.exercise_templates?.map((template: any, index: number) => {
						return `${index + 1}. ${template.title} (${template.type})\n   ID: ${template.id}\n   Primary: ${template.primary_muscle_group}\n   Custom: ${template.is_custom ? 'Yes' : 'No'}`;
					}).join('\n') || 'No exercise templates found';

					return {
						content: [
							{
								type: "text",
								text: `Retrieved ${templates.exercise_templates?.length || 0} exercise templates (page ${templates.page} of ${templates.page_count})`,
							},
							{
								type: "text",
								text: templateDetails,
							},
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
				exercise_template_id: z.string().describe("The ID of the exercise template"),
			},
			async ({ exercise_template_id }) => {
				try {
					const template = await this.client.getExerciseTemplate(exercise_template_id);

					return {
						content: [
							{
								type: "text",
								text: `Exercise: ${template.title}\nType: ${template.type}\nPrimary Muscle: ${template.primary_muscle_group}\nCustom: ${template.is_custom ? 'Yes' : 'No'}`,
							},
							{
								type: "text",
								text: JSON.stringify(template, null, 2),
							},
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
					
					const result = await this.client.createExerciseTemplate(transformExerciseTemplateToAPI(args));

					return {
						content: [
							{
								type: "text",
								text: `✓ Successfully created custom exercise template: ${args.title}`,
							},
							{
								type: "text",
								text: `Exercise Template ID: ${result.id}`,
							},
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
				exercise_template_id: z.string().describe("The ID of the exercise template"),
				start_date: z.string().optional().describe("Optional start date (ISO 8601 format, e.g., 2024-01-01T00:00:00Z)"),
				end_date: z.string().optional().describe("Optional end date (ISO 8601 format, e.g., 2024-12-31T23:59:59Z)"),
			},
			async (args) => {
				try {
					// Validate date formats if provided
					if (args.start_date) {
						validateISO8601Date(args.start_date, "start_date");
					}
					if (args.end_date) {
						validateISO8601Date(args.end_date, "end_date");
					}

					// Validate that end_date is after start_date if both are provided
					if (args.start_date && args.end_date) {
						const start = new Date(args.start_date);
						const end = new Date(args.end_date);
						if (end <= start) {
							throw new ValidationError("end_date must be after start_date");
						}
					}

					const params: any = {};
					if (args.start_date) params.start_date = args.start_date;
					if (args.end_date) params.end_date = args.end_date;

					const history = await this.client.getExerciseHistory(args.exercise_template_id, params);

					const historyDetails = history.exercise_history?.map((entry: any, index: number) => {
						return `${index + 1}. ${entry.workout_title} (${entry.workout_start_time})\n   Weight: ${entry.weight_kg}kg, Reps: ${entry.reps}, RPE: ${entry.rpe || 'N/A'}\n   Set Type: ${entry.set_type}`;
					}).join('\n') || 'No exercise history found';

					return {
						content: [
							{
								type: "text",
								text: `Retrieved ${history.exercise_history?.length || 0} exercise history entries`,
							},
							{
								type: "text",
								text: historyDetails,
							},
							{
								type: "text",
								text: `\n\nFull data:\n${JSON.stringify(history.exercise_history, null, 2)}`,
							},
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

					const folders = await this.client.getRoutineFolders({ page, pageSize: page_size });

					const folderDetails = folders.routine_folders?.map((folder: any, index: number) => {
						return `${index + 1}. ${folder.title}\n   ID: ${folder.id}\n   Index: ${folder.index}`;
					}).join('\n') || 'No routine folders found';

					return {
						content: [
							{
								type: "text",
								text: `Retrieved ${folders.routine_folders?.length || 0} routine folders (page ${folders.page} of ${folders.page_count})`,
							},
							{
								type: "text",
								text: folderDetails,
							},
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
				folder_id: z.string().describe("The ID of the routine folder"),
			},
			async ({ folder_id }) => {
				try {
					const folder = await this.client.getRoutineFolder(folder_id);

					return {
						content: [
							{
								type: "text",
								text: `Folder: ${folder.title}\nID: ${folder.id}\nIndex: ${folder.index}`,
							},
							{
								type: "text",
								text: JSON.stringify(folder, null, 2),
							},
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
					const folder = await this.client.createRoutineFolder(transformRoutineFolderToAPI(args));

					return {
						content: [
							{
								type: "text",
								text: `✓ Successfully created routine folder: ${folder.title}`,
							},
							{
								type: "text",
								text: `Folder ID: ${folder.id}\nIndex: ${folder.index}`,
							},
						],
					};
			} catch (error) {
				return handleError(error);
			}
			}
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Streamable HTTP transport (primary endpoint)
		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		// Legacy SSE endpoint for backward compatibility
		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		// Health check endpoint
		if (url.pathname === "/health") {
			return new Response(JSON.stringify({
				status: "healthy",
				transport: "streamable-http",
				version: "2.1.2"
			}), {
				headers: { "Content-Type": "application/json" }
			});
		}

		return new Response("Not found", { status: 404 });
	},
};
