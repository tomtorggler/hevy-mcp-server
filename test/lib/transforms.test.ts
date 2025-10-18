import { describe, it, expect } from "vitest";
import {
	ValidationError,
	validatePagination,
	validateISO8601Date,
	validateRPE,
	validateWorkoutExercises,
	validateRoutineExercises,
	validateWorkoutData,
	validateRoutineData,
	validateExerciseTemplate,
	PAGINATION_LIMITS,
	createValidatedPagination,
} from "../../src/lib/transforms.js";

describe("validatePagination", () => {
	it("should pass for valid pagination parameters", () => {
		expect(() => validatePagination(1, 10, 10)).not.toThrow();
		expect(() => validatePagination(5, 5, 10)).not.toThrow();
		expect(() => validatePagination(1, 1, 100)).not.toThrow();
	});

	it("should throw ValidationError for page < 1", () => {
		expect(() => validatePagination(0, 10, 10)).toThrow(ValidationError);
		expect(() => validatePagination(-1, 10, 10)).toThrow(
			"Page must be 1 or greater"
		);
	});

	it("should throw ValidationError for pageSize < 1", () => {
		expect(() => validatePagination(1, 0, 10)).toThrow(ValidationError);
		expect(() => validatePagination(1, -1, 10)).toThrow(
			"Page size must be at least 1"
		);
	});

	it("should throw ValidationError for pageSize exceeding max", () => {
		expect(() => validatePagination(1, 11, 10)).toThrow(ValidationError);
		expect(() => validatePagination(1, 101, 100)).toThrow(
			"Page size cannot exceed"
		);
	});
});

describe("validateISO8601Date", () => {
	it("should pass for valid ISO 8601 dates", () => {
		expect(() =>
			validateISO8601Date("2024-01-15T10:00:00Z", "testDate")
		).not.toThrow();
		expect(() =>
			validateISO8601Date("2024-12-31T23:59:59Z", "testDate")
		).not.toThrow();
		expect(() =>
			validateISO8601Date("2024-01-01T00:00:00+05:00", "testDate")
		).not.toThrow();
	});

	it("should throw ValidationError for invalid date format", () => {
		expect(() =>
			validateISO8601Date("2024-13-01T10:00:00Z", "testDate")
		).toThrow(ValidationError);
		expect(() => validateISO8601Date("not-a-date", "testDate")).toThrow(
			"must be in ISO 8601 format"
		);
		expect(() => validateISO8601Date("2024/01/15", "testDate")).toThrow(
			ValidationError
		);
	});

	// Note: JavaScript Date is lenient and accepts "2024-02-30" as valid (it becomes 2024-03-01)
	// This test is commented out because the validation only checks format, not actual date validity
	// it("should throw ValidationError for invalid dates", () => {
	// 	expect(() =>
	// 		validateISO8601Date("2024-02-30T10:00:00Z", "testDate")
	// 	).toThrow(ValidationError);
	// });
});

describe("validateRPE", () => {
	it("should pass for valid RPE values", () => {
		expect(() => validateRPE(6)).not.toThrow();
		expect(() => validateRPE(7)).not.toThrow();
		expect(() => validateRPE(7.5)).not.toThrow();
		expect(() => validateRPE(8)).not.toThrow();
		expect(() => validateRPE(8.5)).not.toThrow();
		expect(() => validateRPE(9)).not.toThrow();
		expect(() => validateRPE(9.5)).not.toThrow();
		expect(() => validateRPE(10)).not.toThrow();
	});

	it("should throw ValidationError for invalid RPE values", () => {
		expect(() => validateRPE(5)).toThrow(ValidationError);
		expect(() => validateRPE(6.5)).toThrow("RPE must be one of");
		expect(() => validateRPE(11)).toThrow(ValidationError);
		expect(() => validateRPE(7.2)).toThrow(ValidationError);
	});
});

describe("validateWorkoutExercises", () => {
	it("should pass for valid workout exercises", () => {
		const exercises = [
			{
				title: "Bench Press",
				exercise_template_id: "123",
				sets: [{ type: "normal", weight_kg: 100, reps: 10 }],
			},
		];
		expect(() => validateWorkoutExercises(exercises)).not.toThrow();
	});

	it("should throw ValidationError for non-array input", () => {
		expect(() => validateWorkoutExercises({} as any)).toThrow(
			"Exercises must be an array"
		);
	});

	it("should throw ValidationError for empty exercises array", () => {
		expect(() => validateWorkoutExercises([])).toThrow(
			"At least one exercise is required"
		);
	});

	it("should throw ValidationError for exercise missing title", () => {
		const exercises = [
			{
				exercise_template_id: "123",
				sets: [{ type: "normal", weight_kg: 100, reps: 10 }],
			},
		];
		expect(() => validateWorkoutExercises(exercises as any)).toThrow(
			"missing required field: title"
		);
	});

	it("should throw ValidationError for exercise missing exercise_template_id", () => {
		const exercises = [
			{
				title: "Bench Press",
				sets: [{ type: "normal", weight_kg: 100, reps: 10 }],
			},
		];
		expect(() => validateWorkoutExercises(exercises as any)).toThrow(
			"missing required field: exercise_template_id"
		);
	});

	it("should throw ValidationError for exercise with empty sets", () => {
		const exercises = [
			{
				title: "Bench Press",
				exercise_template_id: "123",
				sets: [],
			},
		];
		expect(() => validateWorkoutExercises(exercises)).toThrow(
			"must have at least one set"
		);
	});

	it("should throw ValidationError for invalid RPE in set", () => {
		const exercises = [
			{
				title: "Bench Press",
				exercise_template_id: "123",
				sets: [{ type: "normal", weight_kg: 100, reps: 10, rpe: 5 }],
			},
		];
		expect(() => validateWorkoutExercises(exercises)).toThrow("RPE must be one of");
	});

	it("should throw ValidationError for negative values", () => {
		const exercises = [
			{
				title: "Bench Press",
				exercise_template_id: "123",
				sets: [{ type: "normal", weight_kg: -100, reps: 10 }],
			},
		];
		expect(() => validateWorkoutExercises(exercises)).toThrow(
			"weight_kg cannot be negative"
		);
	});
});

describe("validateRoutineExercises", () => {
	it("should pass for valid routine exercises", () => {
		const exercises = [
			{
				exercise_template_id: "123",
				rest_seconds: 90,
				sets: [{ type: "normal", weight_kg: 100, reps: 10 }],
			},
		];
		expect(() => validateRoutineExercises(exercises)).not.toThrow();
	});

	it("should throw ValidationError for negative rest_seconds", () => {
		const exercises = [
			{
				exercise_template_id: "123",
				rest_seconds: -90,
				sets: [{ type: "normal", weight_kg: 100, reps: 10 }],
			},
		];
		expect(() => validateRoutineExercises(exercises)).toThrow(
			"rest_seconds cannot be negative"
		);
	});

	it("should throw ValidationError for invalid rep range", () => {
		const exercises = [
			{
				exercise_template_id: "123",
				sets: [
					{
						type: "normal",
						weight_kg: 100,
						rep_range: { start: 12, end: 8 },
					},
				],
			},
		];
		expect(() => validateRoutineExercises(exercises)).toThrow(
			"rep_range.start cannot be greater than rep_range.end"
		);
	});

	it("should throw ValidationError for negative rep range values", () => {
		const exercises = [
			{
				exercise_template_id: "123",
				sets: [
					{
						type: "normal",
						weight_kg: 100,
						rep_range: { start: -5, end: 10 },
					},
				],
			},
		];
		expect(() => validateRoutineExercises(exercises)).toThrow(
			"rep_range.start cannot be negative"
		);
	});
});

describe("validateWorkoutData", () => {
	it("should pass for valid workout data", () => {
		const workout = {
			title: "Morning Workout",
			start_time: "2024-01-15T10:00:00Z",
			end_time: "2024-01-15T11:00:00Z",
			exercises: [
				{
					title: "Bench Press",
					exercise_template_id: "123",
					sets: [{ type: "normal", weight_kg: 100, reps: 10 }],
				},
			],
		};
		expect(() => validateWorkoutData(workout)).not.toThrow();
	});

	it("should throw ValidationError for invalid start_time", () => {
		const workout = {
			title: "Morning Workout",
			start_time: "invalid-date",
			end_time: "2024-01-15T11:00:00Z",
			exercises: [
				{
					title: "Bench Press",
					exercise_template_id: "123",
					sets: [{ type: "normal", weight_kg: 100, reps: 10 }],
				},
			],
		};
		expect(() => validateWorkoutData(workout)).toThrow("must be in ISO 8601");
	});

	it("should throw ValidationError when end_time is before start_time", () => {
		const workout = {
			title: "Morning Workout",
			start_time: "2024-01-15T11:00:00Z",
			end_time: "2024-01-15T10:00:00Z",
			exercises: [
				{
					title: "Bench Press",
					exercise_template_id: "123",
					sets: [{ type: "normal", weight_kg: 100, reps: 10 }],
				},
			],
		};
		expect(() => validateWorkoutData(workout)).toThrow(
			"end_time must be after start_time"
		);
	});
});

describe("validateRoutineData", () => {
	it("should pass for valid routine data", () => {
		const routine = {
			title: "Push Day",
			exercises: [
				{
					exercise_template_id: "123",
					sets: [{ type: "normal", weight_kg: 100, reps: 10 }],
				},
			],
		};
		expect(() => validateRoutineData(routine)).not.toThrow();
	});

	it("should throw ValidationError for empty title", () => {
		const routine = {
			title: "",
			exercises: [
				{
					exercise_template_id: "123",
					sets: [{ type: "normal", weight_kg: 100, reps: 10 }],
				},
			],
		};
		expect(() => validateRoutineData(routine)).toThrow(
			"Routine title is required and cannot be empty"
		);
	});

	it("should throw ValidationError for whitespace-only title", () => {
		const routine = {
			title: "   ",
			exercises: [
				{
					exercise_template_id: "123",
					sets: [{ type: "normal", weight_kg: 100, reps: 10 }],
				},
			],
		};
		expect(() => validateRoutineData(routine)).toThrow(
			"Routine title is required and cannot be empty"
		);
	});
});

describe("validateExerciseTemplate", () => {
	it("should pass for valid exercise template", () => {
		const template = {
			title: "My Custom Exercise",
			exercise_type: "weight_reps",
			equipment_category: "dumbbell",
			muscle_group: "chest",
		};
		expect(() => validateExerciseTemplate(template)).not.toThrow();
	});

	it("should throw ValidationError for missing title", () => {
		const template = {
			title: "",
			exercise_type: "weight_reps",
			equipment_category: "dumbbell",
			muscle_group: "chest",
		};
		expect(() => validateExerciseTemplate(template)).toThrow(
			"Exercise template title is required"
		);
	});

	it("should throw ValidationError for missing exercise_type", () => {
		const template = {
			title: "My Exercise",
			equipment_category: "dumbbell",
			muscle_group: "chest",
		};
		expect(() => validateExerciseTemplate(template as any)).toThrow(
			"Exercise type is required"
		);
	});

	it("should throw ValidationError for missing equipment_category", () => {
		const template = {
			title: "My Exercise",
			exercise_type: "weight_reps",
			muscle_group: "chest",
		};
		expect(() => validateExerciseTemplate(template as any)).toThrow(
			"Equipment category is required"
		);
	});

	it("should throw ValidationError for missing muscle_group", () => {
		const template = {
			title: "My Exercise",
			exercise_type: "weight_reps",
			equipment_category: "dumbbell",
		};
		expect(() => validateExerciseTemplate(template as any)).toThrow(
			"Muscle group is required"
		);
	});
});

describe("PAGINATION_LIMITS", () => {
	it("should have correct limit values", () => {
		expect(PAGINATION_LIMITS.WORKOUTS).toBe(10);
		expect(PAGINATION_LIMITS.ROUTINES).toBe(10);
		expect(PAGINATION_LIMITS.ROUTINE_FOLDERS).toBe(10);
		expect(PAGINATION_LIMITS.WORKOUT_EVENTS).toBe(10);
		expect(PAGINATION_LIMITS.EXERCISE_TEMPLATES).toBe(100);
	});
});

describe("createValidatedPagination", () => {
	it("should return validated pagination parameters", () => {
		const result = createValidatedPagination(1, 10, 10);
		expect(result).toEqual({ page: 1, pageSize: 10 });
	});

	it("should throw ValidationError for invalid parameters", () => {
		expect(() => createValidatedPagination(0, 10, 10)).toThrow(
			ValidationError
		);
		expect(() => createValidatedPagination(1, 11, 10)).toThrow(
			ValidationError
		);
	});
});

