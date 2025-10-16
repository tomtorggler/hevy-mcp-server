import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HevyClient } from "./lib/client.js";

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
				pageSize: z.number().optional().describe("Number of items per page (Max 10)").default(10),
			},
			async ({ page, pageSize }) => {
				try {
					const workouts = await this.client.getWorkouts({ page, pageSize });

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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
				}
			}
		);

		this.server.tool(
			"get_workout",
			{
				workoutId: z.string().describe("The ID of the workout to retrieve"),
			},
			async ({ workoutId }) => {
				try {
					const workout = await this.client.getWorkout(workoutId);

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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
				}
			}
		);

		this.server.tool(
			"create_workout",
			{
				title: z.string().describe("Title of the workout"),
				description: z.string().optional().nullable().describe("Workout description"),
				startTime: z.string().describe("Start time (ISO 8601 format, e.g., 2024-01-15T10:00:00Z)"),
				endTime: z.string().describe("End time (ISO 8601 format, e.g., 2024-01-15T11:30:00Z)"),
				routineId: z.string().optional().nullable().describe("Optional routine ID that this workout belongs to"),
				isPrivate: z.boolean().optional().describe("Whether the workout is private (default: false)"),
				exercises: z.array(z.object({
					title: z.string().describe("Exercise name (from exercise template)"),
					exerciseTemplateId: z.string().describe("Exercise template ID"),
					supersetId: z.number().optional().nullable().describe("Superset ID (null if not in a superset)"),
					notes: z.string().optional().nullable().describe("Notes for this exercise"),
					sets: z.array(z.object({
						type: z.enum(["warmup", "normal", "failure", "dropset"]).optional().describe("Set type"),
						weightKg: z.number().optional().nullable().describe("Weight in kilograms"),
						reps: z.number().optional().nullable().describe("Number of repetitions"),
						distanceMeters: z.number().optional().nullable().describe("Distance in meters"),
						durationSeconds: z.number().optional().nullable().describe("Duration in seconds"),
						customMetric: z.number().optional().nullable().describe("Custom metric (for steps/floors)"),
						rpe: z.number().optional().nullable().describe("Rating of Perceived Exertion (6-10)")
					})).describe("Sets performed in this exercise")
				})).describe("Exercises in the workout")
			},
			async (args) => {
				try {
					// Transform camelCase to snake_case for API
					const exercises = args.exercises.map((ex: any, exerciseIndex: number) => ({
						index: exerciseIndex,
						title: ex.title,
						exercise_template_id: ex.exerciseTemplateId,
						superset_id: ex.supersetId,
						notes: ex.notes,
						sets: ex.sets.map((set: any, setIndex: number) => ({
							index: setIndex,
							type: set.type,
							weight_kg: set.weightKg,
							reps: set.reps,
							distance_meters: set.distanceMeters,
							duration_seconds: set.durationSeconds,
							custom_metric: set.customMetric,
							rpe: set.rpe
						}))
					}));

					const workout = await this.client.createWorkout({
						workout: {
							title: args.title,
							description: args.description,
							start_time: args.startTime,
							end_time: args.endTime,
							routine_id: args.routineId,
							is_private: args.isPrivate,
							exercises: exercises
						}
					});

					return {
						content: [
							{
								type: "text",
								text: `✓ Successfully logged workout: ${workout.title}`,
							},
							{
								type: "text",
								text: `Workout ID: ${workout.id}\nExercises: ${workout.exercises?.length || 0}\nStarted: ${args.startTime}`,
							},
							{
								type: "text",
								text: `\n\nWorkout data:\n${JSON.stringify(workout, null, 2)}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
				}
			}
		);

		this.server.tool(
			"update_workout",
			{
				workoutId: z.string().describe("The ID of the workout to update"),
				title: z.string().describe("Title of the workout"),
				description: z.string().optional().nullable().describe("Workout description"),
				startTime: z.string().describe("Start time (ISO 8601 format, e.g., 2024-01-15T10:00:00Z)"),
				endTime: z.string().describe("End time (ISO 8601 format, e.g., 2024-01-15T11:30:00Z)"),
				routineId: z.string().optional().nullable().describe("Optional routine ID that this workout belongs to"),
				isPrivate: z.boolean().optional().describe("Whether the workout is private (default: false)"),
				exercises: z.array(z.object({
					title: z.string().describe("Exercise name (from exercise template)"),
					exerciseTemplateId: z.string().describe("Exercise template ID"),
					supersetId: z.number().optional().nullable().describe("Superset ID (null if not in a superset)"),
					notes: z.string().optional().nullable().describe("Notes for this exercise"),
					sets: z.array(z.object({
						type: z.enum(["warmup", "normal", "failure", "dropset"]).optional().describe("Set type"),
						weightKg: z.number().optional().nullable().describe("Weight in kilograms"),
						reps: z.number().optional().nullable().describe("Number of repetitions"),
						distanceMeters: z.number().optional().nullable().describe("Distance in meters"),
						durationSeconds: z.number().optional().nullable().describe("Duration in seconds"),
						customMetric: z.number().optional().nullable().describe("Custom metric (for steps/floors)"),
						rpe: z.number().optional().nullable().describe("Rating of Perceived Exertion (6-10)")
					})).describe("Sets performed in this exercise")
				})).describe("Exercises in the workout")
			},
			async (args) => {
				try {
					// Transform camelCase to snake_case for API
					const exercises = args.exercises.map((ex: any, exerciseIndex: number) => ({
						index: exerciseIndex,
						title: ex.title,
						exercise_template_id: ex.exerciseTemplateId,
						superset_id: ex.supersetId,
						notes: ex.notes,
						sets: ex.sets.map((set: any, setIndex: number) => ({
							index: setIndex,
							type: set.type,
							weight_kg: set.weightKg,
							reps: set.reps,
							distance_meters: set.distanceMeters,
							duration_seconds: set.durationSeconds,
							custom_metric: set.customMetric,
							rpe: set.rpe
						}))
					}));

					const workout = await this.client.updateWorkout(args.workoutId, {
						workout: {
							title: args.title,
							description: args.description,
							start_time: args.startTime,
							end_time: args.endTime,
							routine_id: args.routineId,
							is_private: args.isPrivate,
							exercises: exercises
						}
					});

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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
				}
			}
		);

		this.server.tool(
			"get_workout_events",
			{
				page: z.number().optional().describe("Page number (Must be 1 or greater)").default(1),
				pageSize: z.number().optional().describe("Number of items per page (Max 10)").default(5),
				since: z.string().optional().describe("Get events since this date (ISO 8601 format, e.g., 2024-01-01T00:00:00Z)"),
			},
			async (args) => {
				try {
					const params: any = { page: args.page, pageSize: args.pageSize };
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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
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
				pageSize: z.number().optional().describe("Number of items per page (Max 10)").default(5),
			},
			async ({ page, pageSize }) => {
				try {
					const routines = await this.client.getRoutines({ page, pageSize });

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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
				}
			}
		);

		this.server.tool(
			"get_routine",
			{
				routineId: z.string().describe("The ID of the routine to retrieve"),
			},
			async ({ routineId }) => {
				try {
					const result = await this.client.getRoutine(routineId);
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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
				}
			}
		);

		this.server.tool(
			"create_routine",
			{
				title: z.string().describe("Title of the routine"),
				folderId: z.number().optional().nullable().describe("Folder ID (null for default 'My Routines' folder)"),
				notes: z.string().optional().describe("Notes for the routine"),
				exercises: z.array(z.object({
					exerciseTemplateId: z.string().describe("Exercise template ID"),
					supersetId: z.number().optional().nullable().describe("Superset ID (null if not in a superset)"),
					restSeconds: z.number().optional().nullable().describe("Rest time in seconds between sets"),
					notes: z.string().optional().nullable().describe("Notes for this exercise"),
					sets: z.array(z.object({
						type: z.enum(["warmup", "normal", "failure", "dropset"]).optional().describe("Set type"),
						weightKg: z.number().optional().nullable().describe("Weight in kilograms"),
						reps: z.number().optional().nullable().describe("Number of repetitions"),
						distanceMeters: z.number().optional().nullable().describe("Distance in meters"),
						durationSeconds: z.number().optional().nullable().describe("Duration in seconds"),
						customMetric: z.number().optional().nullable().describe("Custom metric (for steps/floors)"),
						repRange: z.object({
							start: z.number().optional().nullable().describe("Starting rep count for the range"),
							end: z.number().optional().nullable().describe("Ending rep count for the range")
						}).optional().nullable().describe("Range of reps for the set (e.g., 8-12 reps)")
					})).describe("Sets for this exercise")
				})).describe("Exercises in the routine")
			},
			async (args) => {
				try {
					// Transform camelCase to snake_case for API
					// NOTE: Unlike workouts, routines don't use index or title fields in the request
					const exercises = args.exercises.map((ex: any) => ({
						exercise_template_id: ex.exerciseTemplateId,
						superset_id: ex.supersetId,
						rest_seconds: ex.restSeconds,
						notes: ex.notes,
						sets: ex.sets.map((set: any) => ({
							type: set.type,
							weight_kg: set.weightKg,
							reps: set.reps,
							distance_meters: set.distanceMeters,
							duration_seconds: set.durationSeconds,
							custom_metric: set.customMetric,
							rep_range: set.repRange ? {
								start: set.repRange.start,
								end: set.repRange.end
							} : undefined
						}))
					}));

					const routine = await this.client.createRoutine({
						routine: {
							title: args.title,
							folder_id: args.folderId,
							notes: args.notes,
							exercises
						}
					});

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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
				}
			}
		);

		this.server.tool(
			"update_routine",
			{
				routineId: z.string().describe("The ID of the routine to update"),
				title: z.string().describe("Title of the routine"),
				notes: z.string().optional().nullable().describe("Notes for the routine"),
				exercises: z.array(z.object({
					exerciseTemplateId: z.string().describe("Exercise template ID"),
					supersetId: z.number().optional().nullable().describe("Superset ID (null if not in a superset)"),
					restSeconds: z.number().optional().nullable().describe("Rest time in seconds between sets"),
					notes: z.string().optional().nullable().describe("Notes for this exercise"),
					sets: z.array(z.object({
						type: z.enum(["warmup", "normal", "failure", "dropset"]).optional().describe("Set type"),
						weightKg: z.number().optional().nullable().describe("Weight in kilograms"),
						reps: z.number().optional().nullable().describe("Number of repetitions"),
						distanceMeters: z.number().optional().nullable().describe("Distance in meters"),
						durationSeconds: z.number().optional().nullable().describe("Duration in seconds"),
						customMetric: z.number().optional().nullable().describe("Custom metric (for steps/floors)"),
						repRange: z.object({
							start: z.number().optional().nullable().describe("Starting rep count for the range"),
							end: z.number().optional().nullable().describe("Ending rep count for the range")
						}).optional().nullable().describe("Range of reps for the set (e.g., 8-12 reps)")
					})).describe("Sets for this exercise")
				})).describe("Exercises in the routine")
			},
			async (args) => {
				try {
					// Transform camelCase to snake_case for API
					// NOTE: Unlike workouts, routines don't use index fields in the request
					const exercises = args.exercises.map((ex: any) => ({
						exercise_template_id: ex.exerciseTemplateId,
						superset_id: ex.supersetId,
						rest_seconds: ex.restSeconds,
						notes: ex.notes,
						sets: ex.sets.map((set: any) => ({
							type: set.type,
							weight_kg: set.weightKg,
							reps: set.reps,
							distance_meters: set.distanceMeters,
							duration_seconds: set.durationSeconds,
							custom_metric: set.customMetric,
							rep_range: set.repRange ? {
								start: set.repRange.start,
								end: set.repRange.end
							} : undefined
						}))
					}));

					const routine = await this.client.updateRoutine(args.routineId, {
						routine: {
							title: args.title,
							notes: args.notes,
							exercises
						}
					});

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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
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
				pageSize: z.number().optional().describe("Number of items per page (Max 100)").default(20),
			},
			async ({ page, pageSize }) => {
				try {
					const templates = await this.client.getExerciseTemplates({ page, pageSize });

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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
				}
			}
		);

		this.server.tool(
			"get_exercise_template",
			{
				exerciseTemplateId: z.string().describe("The ID of the exercise template"),
			},
			async ({ exerciseTemplateId }) => {
				try {
					const template = await this.client.getExerciseTemplate(exerciseTemplateId);

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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
				}
			}
		);

		this.server.tool(
			"create_exercise_template",
			{
				title: z.string().describe("Title of the exercise"),
				exerciseType: z.enum([
					"weight_reps",
					"reps_only",
					"bodyweight_reps",
					"bodyweight_assisted_reps",
					"duration",
					"weight_duration",
					"distance_duration",
					"short_distance_weight"
				]).describe("The exercise type"),
				equipmentCategory: z.enum([
					"none",
					"barbell",
					"dumbbell",
					"kettlebell",
					"machine",
					"plate",
					"resistance_band",
					"suspension",
					"other"
				]).describe("Equipment category"),
				muscleGroup: z.enum([
					"abdominals",
					"shoulders",
					"biceps",
					"triceps",
					"forearms",
					"quadriceps",
					"hamstrings",
					"calves",
					"glutes",
					"abductors",
					"adductors",
					"lats",
					"upper_back",
					"traps",
					"lower_back",
					"chest",
					"cardio",
					"neck",
					"full_body",
					"other"
				]).describe("Primary muscle group"),
				otherMuscles: z.array(z.enum([
					"abdominals",
					"shoulders",
					"biceps",
					"triceps",
					"forearms",
					"quadriceps",
					"hamstrings",
					"calves",
					"glutes",
					"abductors",
					"adductors",
					"lats",
					"upper_back",
					"traps",
					"lower_back",
					"chest",
					"cardio",
					"neck",
					"full_body",
					"other"
				])).optional().describe("Secondary muscle groups"),
			},
			async (args) => {
				try {
					const result = await this.client.createExerciseTemplate({
						exercise: {
							title: args.title,
							exercise_type: args.exerciseType,
							equipment_category: args.equipmentCategory,
							muscle_group: args.muscleGroup,
							other_muscles: args.otherMuscles
						}
					});

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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
				}
			}
		);

		this.server.tool(
			"get_exercise_history",
			{
				exerciseTemplateId: z.string().describe("The ID of the exercise template"),
				startDate: z.string().optional().describe("Optional start date (ISO 8601 format, e.g., 2024-01-01T00:00:00Z)"),
				endDate: z.string().optional().describe("Optional end date (ISO 8601 format, e.g., 2024-12-31T23:59:59Z)"),
			},
			async (args) => {
				try {
					const params: any = {};
					if (args.startDate) params.start_date = args.startDate;
					if (args.endDate) params.end_date = args.endDate;

					const history = await this.client.getExerciseHistory(args.exerciseTemplateId, params);

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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
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
				pageSize: z.number().optional().describe("Number of items per page (Max 10)").default(10),
			},
			async ({ page, pageSize }) => {
				try {
					const folders = await this.client.getRoutineFolders({ page, pageSize });

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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
				}
			}
		);

		this.server.tool(
			"get_routine_folder",
			{
				folderId: z.string().describe("The ID of the routine folder"),
			},
			async ({ folderId }) => {
				try {
					const folder = await this.client.getRoutineFolder(folderId);

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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
				}
			}
		);

		this.server.tool(
			"create_routine_folder",
			{
				title: z.string().describe("Title of the routine folder"),
			},
			async ({ title }) => {
				try {
					const folder = await this.client.createRoutineFolder({
						routine_folder: {
							title
						}
					});

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
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
							},
						],
					};
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
