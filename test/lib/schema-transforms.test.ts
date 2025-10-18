import { describe, it, expect } from "vitest";
import {
	transformWorkoutToAPI,
	transformRoutineToAPI,
	transformExerciseTemplateToAPI,
	transformRoutineFolderToAPI,
	PostWorkoutsRequestBodySchema,
	PostRoutinesRequestBodySchema,
	PostExerciseTemplateRequestBodySchema,
	PostRoutineFolderRequestBodySchema,
} from "../../src/lib/schemas.js";

/**
 * Schema Transform Tests
 *
 * These tests validate that our transform functions produce output
 * that exactly matches what the Hevy API expects.
 *
 * This catches issues where the transform adds fields the API doesn't accept,
 * or where the output structure doesn't match the API schema.
 */
describe("Schema Transforms - API Output Validation", () => {
	// ============================================
	// WORKOUT TRANSFORMS
	// ============================================
	describe("transformWorkoutToAPI()", () => {
		it("should wrap workout in { workout: {...} } structure", () => {
			const input = {
				title: "Test Workout",
				start_time: "2024-01-15T10:00:00Z",
				end_time: "2024-01-15T11:00:00Z",
				exercises: [],
			};

			const output = transformWorkoutToAPI(input);

			expect(output).toHaveProperty("workout");
			expect(output.workout).toHaveProperty("title");
		});

		it("should NOT add index or title fields to exercises", () => {
			const input = {
				title: "Test Workout",
				start_time: "2024-01-15T10:00:00Z",
				end_time: "2024-01-15T11:00:00Z",
				exercises: [
					{
						title: "Bench Press",
						exercise_template_id: "123",
						sets: [],
					},
				],
			};

			const output = transformWorkoutToAPI(input);

			// Verify exercise does NOT have index or title fields (API doesn't accept them)
			expect(output.workout.exercises[0]).not.toHaveProperty("index");
			expect(output.workout.exercises[0]).not.toHaveProperty("title");
			expect(output.workout.exercises[0]).toHaveProperty(
				"exercise_template_id"
			);
		});

		it("should NOT add index field to sets", () => {
			const input = {
				title: "Test Workout",
				start_time: "2024-01-15T10:00:00Z",
				end_time: "2024-01-15T11:00:00Z",
				exercises: [
					{
						title: "Bench Press",
						exercise_template_id: "123",
						sets: [
							{
								type: "normal",
								weight_kg: 100,
								reps: 10,
							},
						],
					},
				],
			};

			const output = transformWorkoutToAPI(input);

			// Verify set does NOT have index field
			expect(output.workout.exercises[0].sets[0]).not.toHaveProperty("index");
			expect(output.workout.exercises[0].sets[0]).toHaveProperty("type");
			expect(output.workout.exercises[0].sets[0]).toHaveProperty("weight_kg");
		});

		it("should preserve all workout fields in snake_case", () => {
			const input = {
				title: "Test Workout",
				description: "Test description",
				start_time: "2024-01-15T10:00:00Z",
				end_time: "2024-01-15T11:00:00Z",
				routine_id: "routine-123",
				is_private: true,
				exercises: [],
			};

			const output = transformWorkoutToAPI(input);

			expect(output.workout.title).toBe("Test Workout");
			expect(output.workout.description).toBe("Test description");
			expect(output.workout.start_time).toBe("2024-01-15T10:00:00Z");
			expect(output.workout.end_time).toBe("2024-01-15T11:00:00Z");
			expect(output.workout.routine_id).toBe("routine-123");
			expect(output.workout.is_private).toBe(true);
		});

		it("should preserve exercise fields (except title which is not sent to API)", () => {
			const input = {
				title: "Test Workout",
				start_time: "2024-01-15T10:00:00Z",
				end_time: "2024-01-15T11:00:00Z",
				exercises: [
					{
						title: "Bench Press",
						exercise_template_id: "123",
						superset_id: 1,
						notes: "Felt good",
						sets: [],
					},
				],
			};

			const output = transformWorkoutToAPI(input);
			const exercise = output.workout.exercises[0];

			// Title is NOT sent to API (API derives it from exercise_template_id)
			expect(exercise).not.toHaveProperty("title");
			expect(exercise.exercise_template_id).toBe("123");
			expect(exercise.superset_id).toBe(1);
			expect(exercise.notes).toBe("Felt good");
		});

		it("should preserve all set fields", () => {
			const input = {
				title: "Test Workout",
				start_time: "2024-01-15T10:00:00Z",
				end_time: "2024-01-15T11:00:00Z",
				exercises: [
					{
						title: "Bench Press",
						exercise_template_id: "123",
						sets: [
							{
								type: "normal",
								weight_kg: 100,
								reps: 10,
								distance_meters: null,
								duration_seconds: null,
								custom_metric: null,
								rpe: 8,
							},
						],
					},
				],
			};

			const output = transformWorkoutToAPI(input);
			const set = output.workout.exercises[0].sets[0];

			expect(set.type).toBe("normal");
			expect(set.weight_kg).toBe(100);
			expect(set.reps).toBe(10);
			// null values are cleaned and removed (v2.2.0+)
			expect(set.distance_meters).toBeUndefined();
			expect(set.duration_seconds).toBeUndefined();
			expect(set.custom_metric).toBeUndefined();
			expect(set.rpe).toBe(8);
		});

		it("should match PostWorkoutsRequestBodySchema", () => {
			const input = {
				title: "Test Workout",
				start_time: "2024-01-15T10:00:00Z",
				end_time: "2024-01-15T11:00:00Z",
				is_private: false,  // Required by API
				exercises: [
					{
						title: "Bench Press",
						exercise_template_id: "123",
						sets: [
							{
								type: "normal" as const,
								weight_kg: 100,
								reps: 10,
							},
						],
					},
				],
			};

			const output = transformWorkoutToAPI(input);

			// Validate against the API schema
			const result = PostWorkoutsRequestBodySchema.safeParse(output);

			if (!result.success) {
				console.error("Schema validation failed:", result.error.errors);
			}

			expect(result.success).toBe(true);
		});

		it("should handle multiple exercises and sets", () => {
			const input = {
				title: "Test Workout",
				start_time: "2024-01-15T10:00:00Z",
				end_time: "2024-01-15T11:00:00Z",
				is_private: false,  // Required by API
				exercises: [
					{
						title: "Bench Press",
						exercise_template_id: "123",
						sets: [
							{ type: "warmup" as const, weight_kg: 60, reps: 10 },
							{ type: "normal" as const, weight_kg: 100, reps: 10 },
						],
					},
					{
						title: "Squat",
						exercise_template_id: "456",
						sets: [
							{ type: "normal" as const, weight_kg: 140, reps: 8 },
						],
					},
				],
			};

			const output = transformWorkoutToAPI(input);

			// Verify structure
			expect(output.workout.exercises).toHaveLength(2);
			expect(output.workout.exercises[0].sets).toHaveLength(2);
			expect(output.workout.exercises[1].sets).toHaveLength(1);

			// Verify no index or title fields on exercises
			expect(output.workout.exercises[0]).not.toHaveProperty("index");
			expect(output.workout.exercises[0]).not.toHaveProperty("title");
			expect(output.workout.exercises[1]).not.toHaveProperty("index");
			expect(output.workout.exercises[1]).not.toHaveProperty("title");

			// Verify no index fields on sets
			expect(output.workout.exercises[0].sets[0]).not.toHaveProperty("index");
			expect(output.workout.exercises[0].sets[1]).not.toHaveProperty("index");
			expect(output.workout.exercises[1].sets[0]).not.toHaveProperty("index");

			// Validate against schema
			const result = PostWorkoutsRequestBodySchema.safeParse(output);
			expect(result.success).toBe(true);
		});
	});

	// ============================================
	// ROUTINE TRANSFORMS
	// ============================================
	describe("transformRoutineToAPI()", () => {
		it("should wrap routine in { routine: {...} } structure", () => {
			const input = {
				title: "Test Routine",
				exercises: [],
			};

			const output = transformRoutineToAPI(input);

			expect(output).toHaveProperty("routine");
			expect(output.routine).toHaveProperty("title");
		});

		it("should include folder_id when creating routine", () => {
			const input = {
				title: "Test Routine",
				folder_id: 123,
				exercises: [],
			};

			const output = transformRoutineToAPI(input);

			expect(output.routine.folder_id).toBe(123);
		});

		it("should NOT include index fields on exercises or sets", () => {
			const input = {
				title: "Test Routine",
				exercises: [
					{
						exercise_template_id: "123",
						sets: [
							{
								type: "normal" as const,
								weight_kg: 100,
							},
						],
					},
				],
			};

			const output = transformRoutineToAPI(input);

			// Verify no index on exercise
			expect(output.routine.exercises[0]).not.toHaveProperty("index");
			// Verify no index on set
			expect(output.routine.exercises[0].sets[0]).not.toHaveProperty("index");
		});

		it("should preserve rep_range for routine sets", () => {
			const input = {
				title: "Test Routine",
				exercises: [
					{
						exercise_template_id: "123",
						sets: [
							{
								type: "normal" as const,
								weight_kg: 100,
								rep_range: { start: 8, end: 12 },
							},
						],
					},
				],
			};

			const output = transformRoutineToAPI(input);
			const set = output.routine.exercises[0].sets[0];

			expect(set.rep_range).toEqual({ start: 8, end: 12 });
		});

		it("should match PostRoutinesRequestBodySchema", () => {
			const input = {
				title: "Test Routine",
				folder_id: 1,
				notes: "Test notes",
				exercises: [
					{
						exercise_template_id: "123",
						rest_seconds: 90,
						sets: [
							{
								type: "normal" as const,
								weight_kg: 100,
								reps: 10,
							},
						],
					},
				],
			};

			const output = transformRoutineToAPI(input);

			// Validate against the API schema
			const result = PostRoutinesRequestBodySchema.safeParse(output);

			if (!result.success) {
				console.error("Schema validation failed:", result.error.errors);
			}

			expect(result.success).toBe(true);
		});
	});

	// ============================================
	// EXERCISE TEMPLATE TRANSFORMS
	// ============================================
	describe("transformExerciseTemplateToAPI()", () => {
		it("should wrap template in { exercise: {...} } structure", () => {
			const input = {
				title: "Custom Exercise",
				exercise_type: "weight_reps" as const,
				equipment_category: "dumbbell" as const,
				muscle_group: "chest" as const,
			};

			const output = transformExerciseTemplateToAPI(input);

			expect(output).toHaveProperty("exercise");
			expect(output.exercise).toHaveProperty("title");
		});

		it("should preserve all template fields", () => {
			const input = {
				title: "Custom Exercise",
				exercise_type: "weight_reps" as const,
				equipment_category: "dumbbell" as const,
				muscle_group: "chest" as const,
				other_muscles: ["triceps" as const, "shoulders" as const],
			};

			const output = transformExerciseTemplateToAPI(input);

			expect(output.exercise.title).toBe("Custom Exercise");
			expect(output.exercise.exercise_type).toBe("weight_reps");
			expect(output.exercise.equipment_category).toBe("dumbbell");
			expect(output.exercise.muscle_group).toBe("chest");
			expect(output.exercise.other_muscles).toEqual(["triceps", "shoulders"]);
		});

		it("should match PostExerciseTemplateRequestBodySchema", () => {
			const input = {
				title: "Custom Exercise",
				exercise_type: "weight_reps" as const,
				equipment_category: "dumbbell" as const,
				muscle_group: "chest" as const,
			};

			const output = transformExerciseTemplateToAPI(input);

			// Validate against the API schema
			const result = PostExerciseTemplateRequestBodySchema.safeParse(output);

			if (!result.success) {
				console.error("Schema validation failed:", result.error.errors);
			}

			expect(result.success).toBe(true);
		});
	});

	// ============================================
	// ROUTINE FOLDER TRANSFORMS
	// ============================================
	describe("transformRoutineFolderToAPI()", () => {
		it("should wrap folder in { routine_folder: {...} } structure", () => {
			const input = {
				title: "My Folder",
			};

			const output = transformRoutineFolderToAPI(input);

			expect(output).toHaveProperty("routine_folder");
			expect(output.routine_folder).toHaveProperty("title");
		});

		it("should match PostRoutineFolderRequestBodySchema", () => {
			const input = {
				title: "My Folder",
			};

			const output = transformRoutineFolderToAPI(input);

			// Validate against the API schema
			const result = PostRoutineFolderRequestBodySchema.safeParse(output);

			if (!result.success) {
				console.error("Schema validation failed:", result.error.errors);
			}

			expect(result.success).toBe(true);
		});
	});

	// ============================================
	// EDGE CASES
	// ============================================
	describe("Edge Cases", () => {
		it("should handle optional/nullable fields correctly", () => {
			const input = {
				title: "Test Workout",
				description: null,
				start_time: "2024-01-15T10:00:00Z",
				end_time: "2024-01-15T11:00:00Z",
				routine_id: null,
				is_private: false,  // Required by API
				exercises: [
					{
						title: "Bench Press",
						exercise_template_id: "123",
						superset_id: null,
						notes: null,
						sets: [
							{
								type: "normal" as const,
								weight_kg: null,
								reps: null,
								distance_meters: null,
								duration_seconds: null,
								custom_metric: null,
								rpe: null,
							},
						],
					},
				],
			};

			const output = transformWorkoutToAPI(input);

			// Should still validate against schema
			const result = PostWorkoutsRequestBodySchema.safeParse(output);
			expect(result.success).toBe(true);
		});

		it("should handle empty arrays", () => {
			const input = {
				title: "Empty Workout",
				start_time: "2024-01-15T10:00:00Z",
				end_time: "2024-01-15T11:00:00Z",
				is_private: false,  // Required by API
				exercises: [],
			};

			const output = transformWorkoutToAPI(input);

			expect(output.workout.exercises).toEqual([]);

			// Should still validate
			const result = PostWorkoutsRequestBodySchema.safeParse(output);
			expect(result.success).toBe(true);
		});

		it("should remove empty string notes (v2.2.0+)", () => {
			const input = {
				title: "Test Workout",
				description: "",  // Empty string
				start_time: "2024-01-15T10:00:00Z",
				end_time: "2024-01-15T11:00:00Z",
				is_private: false,
				exercises: [
					{
						title: "Bench Press",
						exercise_template_id: "123",
						notes: "",  // Empty string - should be removed
						sets: [
							{
								type: "normal" as const,
								weight_kg: 100,
								reps: 10,
							},
						],
					},
				],
			};

			const output = transformWorkoutToAPI(input);

			// Empty strings should be cleaned to undefined and removed
			expect(output.workout.description).toBeUndefined();
			expect(output.workout.exercises[0].notes).toBeUndefined();

			// Should still validate (API won't reject empty notes anymore)
			const result = PostWorkoutsRequestBodySchema.safeParse(output);
			expect(result.success).toBe(true);
		});

		it("should handle GET->modify->PUT workflow", () => {
			// Simulate a workout from GET (with extra fields)
			const getResponse = {
				id: "workout-123",
				title: "Morning Workout",
				description: null,
				start_time: "2024-01-15T10:00:00Z",
				end_time: "2024-01-15T11:00:00Z",
				routine_id: null,
				is_private: false,
				exercises: [
					{
						index: 0,  // Extra field from GET
						id: "exercise-456",  // Extra field from GET
						title: "Bench Press",
						exercise_template_id: "123",
						notes: "",  // Empty notes
						sets: [
							{
								index: 0,  // Extra field from GET
								type: "normal" as const,
								weight_kg: 100,
								reps: 10,
							},
						],
					},
				],
			};

			// User modifies the workout
			const modified = { ...getResponse };
			modified.title = "Updated Workout";
			modified.exercises[0].sets[0].weight_kg = 110;

			// Transform for PUT (should clean extra fields and empty notes)
			const output = transformWorkoutToAPI(modified);

			// Extra fields should not be present
			expect(output.workout).not.toHaveProperty("id");
			expect(output.workout.exercises[0]).not.toHaveProperty("index");
			expect(output.workout.exercises[0]).not.toHaveProperty("id");
			expect(output.workout.exercises[0].sets[0]).not.toHaveProperty("index");

			// Empty notes should be removed
			expect(output.workout.exercises[0].notes).toBeUndefined();

			// Modified values should be present
			expect(output.workout.title).toBe("Updated Workout");
			expect(output.workout.exercises[0].sets[0].weight_kg).toBe(110);

			// Should validate
			const result = PostWorkoutsRequestBodySchema.safeParse(output);
			expect(result.success).toBe(true);
		});
	});
});
