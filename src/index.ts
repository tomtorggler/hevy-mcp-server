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
import githubHandler from "./github-handler.js";
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
			throw new Error(
				"Authentication required. Please authenticate via OAuth to use the Hevy MCP server."
			);
		}

		// Load user's Hevy API key from encrypted KV storage
		const hevyApiKey = await getUserApiKey(
			this.env.OAUTH_KV,
			this.env.COOKIE_ENCRYPTION_KEY,
			this.props.login
		);

		if (!hevyApiKey) {
			// Note: Replace with your deployed worker URL
			const setupUrl = `https://${env.WORKER_URL || 'hevy-mcp-server.<your-account>.workers.dev'}/setup`;
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

/**
 * Helper function to extract user Props from Bearer token
 *
 * This function validates the OAuth Bearer token and retrieves the associated
 * user session data from KV storage. The Props are then passed to the Durable Object
 * through ExecutionContext (ctx.props), which the agents library uses to:
 * 1. Create a user-specific DO instance (via namespace.idFromName)
 * 2. Call updateProps() on the DO to store the props
 * 3. Make props available to MyMCP.init() via this.props
 */
async function getUserPropsFromToken(env: Env, request: Request): Promise<Props | null> {
	const authHeader = request.headers.get("Authorization");
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return null;
	}

	const token = authHeader.substring(7); // Remove "Bearer " prefix
	const sessionData = await env.OAUTH_KV.get(`session:${token}`, "json");

	if (!sessionData || typeof sessionData !== "object") {
		return null;
	}

	return sessionData as Props;
}

/**
 * Create MCP handlers with OAuth authentication
 *
 * HOW PROPS FLOW TO DURABLE OBJECTS:
 * 1. Client sends request with Authorization: Bearer <token>
 * 2. We validate token and get Props from KV (getUserPropsFromToken)
 * 3. We set ctx.props = props
 * 4. We call mcpHandlers.*.fetch(request, env, ctx)
 * 5. The agents library's serve() handler:
 *    - Reads ctx.props
 *    - Gets/creates DO with getAgentByName(namespace, id, { props: ctx.props })
 *    - Calls agent.updateProps(ctx.props) on the DO
 *    - Stores props in DO storage
 * 6. MyMCP.init() can now access this.props.login
 */
const mcpHandlers = {
	streamableHTTP: MyMCP.serve("/mcp", { binding: "MCP_OBJECT" }),
	sse: MyMCP.serveSSE("/sse", { binding: "MCP_OBJECT" }),
};

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// OAuth routes and API key management (handled by github-handler)
		if (
			url.pathname === "/authorize" ||
			url.pathname === "/callback" ||
			url.pathname === "/token" ||
			url.pathname === "/register" ||
			url.pathname === "/logout" ||
			url.pathname === "/setup" ||
			url.pathname === "/.well-known/oauth-authorization-server" ||
			url.pathname.startsWith("/api/")
		) {
			return githubHandler.fetch(request, env, ctx);
		}

		// MCP endpoints - require authentication via Bearer token
		if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
			const props = await getUserPropsFromToken(env, request);
			if (!props) {
				return new Response(
					JSON.stringify({
						error: "unauthorized",
						message: "Authentication required. Please provide a valid Bearer token.",
					}),
					{
						status: 401,
						headers: { "Content-Type": "application/json" },
					}
				);
			}

			// Pass props through ExecutionContext so the agents library can access them
			// The agents library's serve() handler will read ctx.props and pass it to the DO
			(ctx as any).props = props;

			// Forward request to MCP handler (which will create/get the DO with props)
			return mcpHandlers.streamableHTTP.fetch(request, env, ctx);
		}

		// Legacy SSE endpoint for backward compatibility
		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			const props = await getUserPropsFromToken(env, request);
			if (!props) {
				return new Response(
					JSON.stringify({
						error: "unauthorized",
						message: "Authentication required. Please provide a valid Bearer token.",
					}),
					{
						status: 401,
						headers: { "Content-Type": "application/json" },
					}
				);
			}

			// Pass props through ExecutionContext
			(ctx as any).props = props;

			// Forward request to SSE handler
			return mcpHandlers.sse.fetch(request, env, ctx);
		}

		// Health check endpoint
		if (url.pathname === "/health") {
			return new Response(
				JSON.stringify({
					status: "healthy",
					transport: "streamable-http",
					version: "3.0.0",
					oauth: "enabled",
				}),
				{
					headers: { "Content-Type": "application/json" },
				}
			);
		}

		// Root endpoint - show OAuth info
		if (url.pathname === "/") {
			return new Response(
				`<!DOCTYPE html>
<html>
<head>
	<title>Hevy MCP Server</title>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
			max-width: 800px;
			margin: 50px auto;
			padding: 20px;
			line-height: 1.6;
		}
		h1 { color: #667eea; }
		.endpoint { 
			background: #f5f5f5; 
			padding: 10px; 
			margin: 10px 0; 
			border-radius: 4px;
			font-family: monospace;
		}
		.status {
			display: inline-block;
			background: #10b981;
			color: white;
			padding: 4px 12px;
			border-radius: 12px;
			font-size: 12px;
			font-weight: 600;
		}
	</style>
</head>
<body>
	<h1>🏋️ Hevy MCP Server</h1>
	<p><span class="status">ONLINE</span> Multi-user OAuth enabled</p>
	
	<h2>Setup & Authentication</h2>
	<div class="endpoint">GET /setup - Configure your Hevy API key</div>
	<div class="endpoint">GET /authorize - Start OAuth flow</div>
	<div class="endpoint">POST /token - Exchange code for token</div>
	<div class="endpoint">POST /register - Register OAuth client</div>
	<div class="endpoint">GET /logout - Clear session</div>

	<h2>MCP Endpoints</h2>
	<div class="endpoint">GET /mcp - Streamable HTTP transport (requires Bearer token)</div>
	<div class="endpoint">GET /sse - Legacy SSE transport (requires Bearer token)</div>

	<h2>Version</h2>
	<p>v3.0.0 - Multi-user OAuth support with encrypted API key storage</p>
	
	<h2>Documentation</h2>
	<p>See <a href="https://github.com/tomtorggler/hevy-mcp-server">GitHub repository</a> for setup instructions.</p>
</body>
</html>`,
				{
					headers: { "Content-Type": "text/html" },
				}
			);
		}

		return new Response("Not found", { status: 404 });
	},
};
