import { z } from "zod";

// ============================================
// ENUMS & CONSTANTS
// ============================================

/**
 * Set types available in Hevy
 */
export const SetTypeEnum = z.enum(["warmup", "normal", "failure", "dropset"]);
export type SetType = z.infer<typeof SetTypeEnum>;

/**
 * RPE (Rating of Perceived Exertion) values
 * Must be one of: 6, 7, 7.5, 8, 8.5, 9, 9.5, 10
 */
export const RPEEnum = z.union([
	z.literal(6),
	z.literal(7),
	z.literal(7.5),
	z.literal(8),
	z.literal(8.5),
	z.literal(9),
	z.literal(9.5),
	z.literal(10),
]);
export type RPE = z.infer<typeof RPEEnum>;

/**
 * Exercise types supported by Hevy
 */
export const ExerciseTypeEnum = z.enum([
	"weight_reps",
	"reps_only",
	"bodyweight_reps",
	"bodyweight_assisted_reps",
	"duration",
	"weight_duration",
	"distance_duration",
	"short_distance_weight",
]);
export type ExerciseType = z.infer<typeof ExerciseTypeEnum>;

/**
 * Equipment categories
 */
export const EquipmentCategoryEnum = z.enum([
	"none",
	"barbell",
	"dumbbell",
	"kettlebell",
	"machine",
	"plate",
	"resistance_band",
	"suspension",
	"other",
]);
export type EquipmentCategory = z.infer<typeof EquipmentCategoryEnum>;

/**
 * Muscle groups
 */
export const MuscleGroupEnum = z.enum([
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
	"other",
]);
export type MuscleGroup = z.infer<typeof MuscleGroupEnum>;

// ============================================
// WORKOUT SCHEMAS (snake_case for MCP interface)
// ============================================

/**
 * Schema for a workout set
 * All metric fields are nullable as different exercise types require different metrics
 * type is required, but metrics (weight, reps, etc.) are optional
 */
export const WorkoutSetSchema = z.object({
	type: SetTypeEnum.describe("Set type (required)"),
	weight_kg: z.number().optional().nullable().describe("Weight in kilograms"),
	reps: z.number().optional().nullable().describe("Number of repetitions"),
	distance_meters: z.number().optional().nullable().describe("Distance in meters"),
	duration_seconds: z.number().optional().nullable().describe("Duration in seconds"),
	custom_metric: z.number().optional().nullable().describe("Custom metric (for steps/floors)"),
	rpe: RPEEnum.optional().nullable().describe("Rating of Perceived Exertion (6-10)"),
});
export type WorkoutSet = z.infer<typeof WorkoutSetSchema>;

/**
 * Schema for a workout exercise
 * Includes index and title which are added by the client
 */
export const WorkoutExerciseSchema = z.object({
	title: z.string().describe("Exercise name (from exercise template)"),
	exercise_template_id: z.string().describe("Exercise template ID"),
	superset_id: z.number().optional().nullable().describe("Superset ID (null if not in a superset)"),
	notes: z.string().optional().nullable().describe("Notes for this exercise"),
	sets: z.array(WorkoutSetSchema).describe("Sets performed in this exercise"),
});
export type WorkoutExercise = z.infer<typeof WorkoutExerciseSchema>;

/**
 * Schema for creating a workout
 */
export const CreateWorkoutSchema = z.object({
	title: z.string().describe("Title of the workout"),
	description: z.string().optional().nullable().describe("Workout description"),
	start_time: z.string().describe("Start time (ISO 8601 format, e.g., 2024-01-15T10:00:00Z)"),
	end_time: z.string().describe("End time (ISO 8601 format, e.g., 2024-01-15T11:30:00Z)"),
	routine_id: z.string().optional().nullable().describe("Optional routine ID that this workout belongs to"),
	is_private: z.boolean().default(false).describe("Whether the workout is private (default: false)"),
	exercises: z.array(WorkoutExerciseSchema).describe("Exercises in the workout"),
});
export type CreateWorkout = z.infer<typeof CreateWorkoutSchema>;

/**
 * Schema for updating a workout (same as create)
 */
export const UpdateWorkoutSchema = CreateWorkoutSchema;
export type UpdateWorkout = z.infer<typeof UpdateWorkoutSchema>;

// ============================================
// ROUTINE SCHEMAS (snake_case for MCP interface)
// ============================================

/**
 * Rep range schema for routine sets
 */
export const RepRangeSchema = z.object({
	start: z.number().optional().nullable().describe("Starting rep count for the range"),
	end: z.number().optional().nullable().describe("Ending rep count for the range"),
});
export type RepRange = z.infer<typeof RepRangeSchema>;

/**
 * Schema for a routine set
 * Includes rep_range which is not present in workout sets
 * type is required, but metrics are optional
 */
export const RoutineSetSchema = z.object({
	type: SetTypeEnum.describe("Set type (required)"),
	weight_kg: z.number().optional().nullable().describe("Weight in kilograms"),
	reps: z.number().optional().nullable().describe("Number of repetitions"),
	distance_meters: z.number().optional().nullable().describe("Distance in meters"),
	duration_seconds: z.number().optional().nullable().describe("Duration in seconds"),
	custom_metric: z.number().optional().nullable().describe("Custom metric (for steps/floors)"),
	rep_range: RepRangeSchema.optional().nullable().describe("Range of reps for the set (e.g., 8-12 reps)"),
});
export type RoutineSet = z.infer<typeof RoutineSetSchema>;

/**
 * Schema for a routine exercise
 * Does NOT include index or title in the request (those are added by the server)
 * DOES include rest_seconds which is not present in workout exercises
 */
export const RoutineExerciseSchema = z.object({
	exercise_template_id: z.string().describe("Exercise template ID"),
	superset_id: z.number().optional().nullable().describe("Superset ID (null if not in a superset)"),
	rest_seconds: z.number().optional().nullable().describe("Rest time in seconds between sets"),
	notes: z.string().optional().nullable().describe("Notes for this exercise"),
	sets: z.array(RoutineSetSchema).describe("Sets for this exercise"),
});
export type RoutineExercise = z.infer<typeof RoutineExerciseSchema>;

/**
 * Schema for creating a routine
 */
export const CreateRoutineSchema = z.object({
	title: z.string().describe("Title of the routine"),
	folder_id: z.number().optional().nullable().describe("Folder ID (null for default 'My Routines' folder)"),
	notes: z.string().optional().describe("Notes for the routine"),
	exercises: z.array(RoutineExerciseSchema).describe("Exercises in the routine"),
});
export type CreateRoutine = z.infer<typeof CreateRoutineSchema>;

/**
 * Schema for updating a routine (no folder_id in updates)
 */
export const UpdateRoutineSchema = z.object({
	title: z.string().describe("Title of the routine"),
	notes: z.string().optional().nullable().describe("Notes for the routine"),
	exercises: z.array(RoutineExerciseSchema).describe("Exercises in the routine"),
});
export type UpdateRoutine = z.infer<typeof UpdateRoutineSchema>;

// ============================================
// EXERCISE TEMPLATE SCHEMAS (snake_case for MCP interface)
// ============================================

/**
 * Schema for creating a custom exercise template
 */
export const CreateExerciseTemplateSchema = z.object({
	title: z.string().describe("Title of the exercise"),
	exercise_type: ExerciseTypeEnum.describe("The exercise type"),
	equipment_category: EquipmentCategoryEnum.describe("Equipment category"),
	muscle_group: MuscleGroupEnum.describe("Primary muscle group"),
	other_muscles: z.array(MuscleGroupEnum).optional().describe("Secondary muscle groups"),
});
export type CreateExerciseTemplate = z.infer<typeof CreateExerciseTemplateSchema>;

// ============================================
// ROUTINE FOLDER SCHEMAS (snake_case for MCP interface)
// ============================================

/**
 * Schema for creating a routine folder
 */
export const CreateRoutineFolderSchema = z.object({
	title: z.string().describe("Title of the routine folder"),
});
export type CreateRoutineFolder = z.infer<typeof CreateRoutineFolderSchema>;

// ============================================
// API REQUEST BODY SCHEMAS (for wrapping in API-specific format)
// ============================================

/**
 * Schema for workout set (for API requests)
 * NOTE: Sets do NOT have an index field - only exercises do
 */
export const WorkoutSetAPISchema = z.object({
	type: SetTypeEnum,
	weight_kg: z.number().optional().nullable(),
	reps: z.number().optional().nullable(),
	distance_meters: z.number().optional().nullable(),
	duration_seconds: z.number().optional().nullable(),
	custom_metric: z.number().optional().nullable(),
	rpe: RPEEnum.optional().nullable(),
});

/**
 * Schema for workout exercise (for API requests)
 * NOTE: The API does NOT accept 'index' or 'title' fields
 * - Order is determined by array position (no index needed)
 * - Title is derived from exercise_template_id (no title needed)
 */
export const WorkoutExerciseAPISchema = z.object({
	exercise_template_id: z.string(),
	superset_id: z.number().optional().nullable(),
	notes: z.string().optional().nullable(),
	sets: z.array(WorkoutSetAPISchema),
});

/**
 * POST /v1/workouts request body schema
 * NOTE: Based on actual API behavior, not just the OpenAPI spec
 * - is_private is REQUIRED by the API (discovered through testing)
 * - exercises do NOT have 'index' or 'title' fields
 */
export const PostWorkoutsRequestBodySchema = z.object({
	workout: z.object({
		title: z.string(),
		description: z.string().optional().nullable(),
		start_time: z.string(),
		end_time: z.string(),
		routine_id: z.string().optional().nullable(),
		is_private: z.boolean(),  // REQUIRED by actual API
		exercises: z.array(WorkoutExerciseAPISchema),
	}),
});

/**
 * PUT /v1/workouts/{workoutId} request body schema
 */
export const PutWorkoutsRequestBodySchema = PostWorkoutsRequestBodySchema;

/**
 * Schema for routine set (no index needed)
 */
export const RoutineSetAPISchema = z.object({
	type: SetTypeEnum,
	weight_kg: z.number().optional().nullable(),
	reps: z.number().optional().nullable(),
	distance_meters: z.number().optional().nullable(),
	duration_seconds: z.number().optional().nullable(),
	custom_metric: z.number().optional().nullable(),
	rep_range: z.object({
		start: z.number().optional().nullable(),
		end: z.number().optional().nullable(),
	}).optional().nullable(),
});

/**
 * Schema for routine exercise (no index needed)
 */
export const RoutineExerciseAPISchema = z.object({
	exercise_template_id: z.string(),
	superset_id: z.number().optional().nullable(),
	rest_seconds: z.number().optional().nullable(),
	notes: z.string().optional().nullable(),
	sets: z.array(RoutineSetAPISchema),
});

/**
 * POST /v1/routines request body schema
 */
export const PostRoutinesRequestBodySchema = z.object({
	routine: z.object({
		title: z.string(),
		folder_id: z.number().optional().nullable(),
		notes: z.string().optional(),
		exercises: z.array(RoutineExerciseAPISchema),
	}),
});

/**
 * PUT /v1/routines/{routineId} request body schema
 */
export const PutRoutinesRequestBodySchema = z.object({
	routine: z.object({
		title: z.string(),
		notes: z.string().optional().nullable(),
		exercises: z.array(RoutineExerciseAPISchema),
	}),
});

/**
 * POST /v1/exercise_templates request body schema
 */
export const PostExerciseTemplateRequestBodySchema = z.object({
	exercise: z.object({
		title: z.string(),
		exercise_type: ExerciseTypeEnum,
		equipment_category: EquipmentCategoryEnum,
		muscle_group: MuscleGroupEnum,
		other_muscles: z.array(MuscleGroupEnum).optional(),
	}),
});

/**
 * POST /v1/routine_folders request body schema
 */
export const PostRoutineFolderRequestBodySchema = z.object({
	routine_folder: z.object({
		title: z.string(),
	}),
});

// ============================================
// HELPER FUNCTIONS - Transform to API format
// ============================================

/**
 * Clean a value for API submission
 * - Converts empty strings to undefined (API rejects empty strings)
 * - Preserves null and undefined
 * - Returns the value as-is if it's not empty
 */
function cleanValue<T>(value: T | null | undefined): T | undefined {
	if (value === null) return undefined;
	if (typeof value === 'string' && value.trim() === '') return undefined;
	return value as T | undefined;
}

/**
 * Remove undefined values from an object (for cleaner API requests)
 */
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
	const cleaned: any = {};
	for (const [key, value] of Object.entries(obj)) {
		if (value !== undefined) {
			cleaned[key] = value;
		}
	}
	return cleaned;
}

/**
 * Transform workout data to API format (wraps in workout object and cleans data)
 *
 * This function:
 * - Strips fields that the API doesn't accept (index, title from GET responses)
 * - Converts empty strings to undefined (API rejects empty notes)
 * - Removes undefined values for cleaner requests
 *
 * @param workout - Workout data in snake_case format
 * @returns Workout data formatted for the Hevy API
 *
 * @example
 * ```typescript
 * const workout = {
 *   title: "Morning Workout",
 *   start_time: "2024-01-15T10:00:00Z",
 *   end_time: "2024-01-15T11:00:00Z",
 *   exercises: [
 *     {
 *       title: "Bench Press",
 *       exercise_template_id: "123",
 *       notes: "", // Empty notes will be removed
 *       sets: [{ type: "normal", weight_kg: 100, reps: 10 }]
 *     }
 *   ]
 * };
 * const apiWorkout = transformWorkoutToAPI(workout);
 * // Results in: { workout: { title: "...", exercises: [{ exercise_template_id: "123", sets: [...] }] } }
 * ```
 */
export function transformWorkoutToAPI(workout: CreateWorkout) {
	return {
		workout: removeUndefined({
			title: workout.title,
			description: cleanValue(workout.description),
			start_time: workout.start_time,
			end_time: workout.end_time,
			routine_id: cleanValue(workout.routine_id),
			is_private: workout.is_private,
			exercises: workout.exercises.map((ex) => removeUndefined({
				exercise_template_id: ex.exercise_template_id,
				superset_id: cleanValue(ex.superset_id),
				notes: cleanValue(ex.notes),
				sets: ex.sets.map((set) => removeUndefined({
					type: set.type,
					weight_kg: cleanValue(set.weight_kg),
					reps: cleanValue(set.reps),
					distance_meters: cleanValue(set.distance_meters),
					duration_seconds: cleanValue(set.duration_seconds),
					custom_metric: cleanValue(set.custom_metric),
					rpe: cleanValue(set.rpe),
				})),
			})),
		}),
	};
}

/**
 * Transform routine data to API format (wraps in routine object and cleans data)
 *
 * This function:
 * - Strips fields that the API doesn't accept (index from GET responses)
 * - Converts empty strings to undefined (API may reject empty notes)
 * - Removes undefined values for cleaner requests
 *
 * @param routine - Routine data in snake_case format
 * @returns Routine data formatted for the Hevy API
 *
 * @example
 * ```typescript
 * const routine = {
 *   title: "Push Day",
 *   folder_id: 1,
 *   notes: "", // Empty notes will be removed
 *   exercises: [
 *     {
 *       exercise_template_id: "123",
 *       rest_seconds: 90,
 *       sets: [{ type: "normal", weight_kg: 100, rep_range: { start: 8, end: 12 } }]
 *     }
 *   ]
 * };
 * const apiRoutine = transformRoutineToAPI(routine);
 * ```
 */
export function transformRoutineToAPI(routine: CreateRoutine | UpdateRoutine) {
	const baseRoutine = removeUndefined({
		title: routine.title,
		notes: cleanValue(routine.notes),
		exercises: routine.exercises.map((ex) => removeUndefined({
			exercise_template_id: ex.exercise_template_id,
			superset_id: cleanValue(ex.superset_id),
			rest_seconds: cleanValue(ex.rest_seconds),
			notes: cleanValue(ex.notes),
			sets: ex.sets.map((set) => removeUndefined({
				type: set.type,
				weight_kg: cleanValue(set.weight_kg),
				reps: cleanValue(set.reps),
				distance_meters: cleanValue(set.distance_meters),
				duration_seconds: cleanValue(set.duration_seconds),
				custom_metric: cleanValue(set.custom_metric),
				rep_range: set.rep_range ? removeUndefined({
					start: cleanValue(set.rep_range.start),
					end: cleanValue(set.rep_range.end),
				}) : undefined,
			})),
		})),
	});

	// Add folder_id only for CreateRoutine
	if ('folder_id' in routine) {
		return {
			routine: removeUndefined({
				...baseRoutine,
				folder_id: cleanValue(routine.folder_id),
			}),
		};
	}

	return { routine: baseRoutine };
}

/**
 * Transform exercise template data to API format (wraps in exercise object)
 * 
 * @param template - Exercise template data in snake_case format
 * @returns Exercise template data formatted for the Hevy API
 * 
 * @example
 * ```typescript
 * const template = {
 *   title: "My Custom Exercise",
 *   exercise_type: "weight_reps",
 *   equipment_category: "dumbbell",
 *   muscle_group: "chest",
 *   other_muscles: ["triceps", "shoulders"]
 * };
 * const apiTemplate = transformExerciseTemplateToAPI(template);
 * // Results in: { exercise: { title: "...", exercise_type: "...", ... } }
 * ```
 */
export function transformExerciseTemplateToAPI(template: CreateExerciseTemplate) {
	return {
		exercise: {
			title: template.title,
			exercise_type: template.exercise_type,
			equipment_category: template.equipment_category,
			muscle_group: template.muscle_group,
			other_muscles: template.other_muscles,
		},
	};
}

/**
 * Transform routine folder data to API format (wraps in routine_folder object)
 * 
 * @param folder - Routine folder data in snake_case format
 * @returns Routine folder data formatted for the Hevy API
 * 
 * @example
 * ```typescript
 * const folder = {
 *   title: "My Workout Routines"
 * };
 * const apiFolder = transformRoutineFolderToAPI(folder);
 * // Results in: { routine_folder: { title: "My Workout Routines" } }
 * ```
 */
export function transformRoutineFolderToAPI(folder: CreateRoutineFolder) {
	return {
		routine_folder: {
			title: folder.title,
		},
	};
}
