import { z } from "zod";

/**
 * Validation errors with detailed messages
 */
export class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ValidationError";
	}
}

/**
 * Validates pagination parameters
 * @param page - Page number (must be >= 1)
 * @param pageSize - Page size (must be within valid range)
 * @param maxPageSize - Maximum allowed page size
 * @throws ValidationError if validation fails
 */
export function validatePagination(
	page: number,
	pageSize: number,
	maxPageSize: number
): void {
	if (page < 1) {
		throw new ValidationError(`Page must be 1 or greater, got ${page}`);
	}

	if (pageSize < 1) {
		throw new ValidationError(`Page size must be at least 1, got ${pageSize}`);
	}

	if (pageSize > maxPageSize) {
		throw new ValidationError(
			`Page size cannot exceed ${maxPageSize}, got ${pageSize}`
		);
	}
}

/**
 * Validates a UUID string
 * @param id - The UUID string to validate
 * @param fieldName - Name of the field (for error messages)
 * @throws ValidationError if the UUID format is invalid
 */
export function validateUUID(id: string, fieldName: string): void {
	const uuidPattern =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	if (!uuidPattern.test(id)) {
		throw new ValidationError(
			`${fieldName} must be a valid UUID (e.g., b459cba5-cd6d-463c-abd6-54f8eafcadcb), got ${id}`
		);
	}
}

/**
 * Validates an ISO 8601 date string
 * @param dateString - The date string to validate
 * @param fieldName - Name of the field (for error messages)
 * @throws ValidationError if the date format is invalid
 */
export function validateISO8601Date(
	dateString: string,
	fieldName: string
): void {
	// ISO 8601 regex pattern (supports various formats)
	const iso8601Pattern =
		/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/;

	if (!iso8601Pattern.test(dateString)) {
		throw new ValidationError(
			`${fieldName} must be in ISO 8601 format (e.g., 2024-01-15T10:00:00Z), got ${dateString}`
		);
	}

	// Validate that the date is actually valid
	const date = new Date(dateString);
	if (Number.isNaN(date.getTime())) {
		throw new ValidationError(
			`${fieldName} is not a valid date: ${dateString}`
		);
	}
}

/**
 * Validates RPE (Rating of Perceived Exertion) value
 * @param rpe - The RPE value to validate (6-10, with half steps allowed)
 * @throws ValidationError if RPE is invalid
 */
export function validateRPE(rpe: number): void {
	const validRPEValues = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];

	if (!validRPEValues.includes(rpe)) {
		throw new ValidationError(
			`RPE must be one of: ${validRPEValues.join(", ")}. Got ${rpe}`
		);
	}
}

/**
 * Validates workout exercise data before transformation
 * Ensures all required fields are present and valid
 * @param exercises - Array of workout exercises to validate
 * @throws ValidationError if validation fails
 */
export function validateWorkoutExercises(exercises: any[]): void {
	if (!Array.isArray(exercises)) {
		throw new ValidationError("Exercises must be an array");
	}

	if (exercises.length === 0) {
		throw new ValidationError("At least one exercise is required");
	}

	for (const [index, exercise] of exercises.entries()) {
		// Validate required fields
		if (!exercise.title) {
			throw new ValidationError(
				`Exercise at index ${index} is missing required field: title`
			);
		}

		if (!exercise.exercise_template_id) {
			throw new ValidationError(
				`Exercise at index ${index} is missing required field: exercise_template_id`
			);
		}

		// Validate sets
		if (!Array.isArray(exercise.sets)) {
			throw new ValidationError(
				`Exercise at index ${index} must have a sets array`
			);
		}

		if (exercise.sets.length === 0) {
			throw new ValidationError(
				`Exercise at index ${index} must have at least one set`
			);
		}

		// Validate each set
		for (const [setIndex, set] of exercise.sets.entries()) {
			// Validate set type is present
			if (!set.type) {
				throw new ValidationError(
					`Exercise ${index}, Set ${setIndex}: type is required`
				);
			}

			// Validate set type is valid
			const validSetTypes = ["warmup", "normal", "failure", "dropset"];
			if (!validSetTypes.includes(set.type)) {
				throw new ValidationError(
					`Exercise ${index}, Set ${setIndex}: Invalid set type "${set.type}". Must be one of: ${validSetTypes.join(", ")}`
				);
			}

			// Validate RPE if present
			if (set.rpe !== null && set.rpe !== undefined) {
				try {
					validateRPE(set.rpe);
				} catch (error) {
					throw new ValidationError(
						`Exercise ${index}, Set ${setIndex}: ${error instanceof Error ? error.message : "Invalid RPE"}`
					);
				}
			}

			// Validate numeric fields are not negative
			const numericFields = [
				"weight_kg",
				"reps",
				"distance_meters",
				"duration_seconds",
				"custom_metric",
			];
			for (const field of numericFields) {
				if (
					set[field] !== null &&
					set[field] !== undefined &&
					set[field] < 0
				) {
					throw new ValidationError(
						`Exercise ${index}, Set ${setIndex}: ${field} cannot be negative`
					);
				}
			}
		}
	}
}

/**
 * Validates routine exercise data before transformation
 * @param exercises - Array of routine exercises to validate
 * @throws ValidationError if validation fails
 */
export function validateRoutineExercises(exercises: any[]): void {
	if (!Array.isArray(exercises)) {
		throw new ValidationError("Exercises must be an array");
	}

	if (exercises.length === 0) {
		throw new ValidationError("At least one exercise is required");
	}

	for (const [index, exercise] of exercises.entries()) {
		// Validate required fields
		if (!exercise.exercise_template_id) {
			throw new ValidationError(
				`Exercise at index ${index} is missing required field: exercise_template_id`
			);
		}

		// Validate rest_seconds if present
		if (
			exercise.rest_seconds !== null &&
			exercise.rest_seconds !== undefined
		) {
			if (exercise.rest_seconds < 0) {
				throw new ValidationError(
					`Exercise at index ${index}: rest_seconds cannot be negative`
				);
			}
		}

		// Validate sets
		if (!Array.isArray(exercise.sets)) {
			throw new ValidationError(
				`Exercise at index ${index} must have a sets array`
			);
		}

		if (exercise.sets.length === 0) {
			throw new ValidationError(
				`Exercise at index ${index} must have at least one set`
			);
		}

		// Validate each set
		for (const [setIndex, set] of exercise.sets.entries()) {
			// Validate set type is present
			if (!set.type) {
				throw new ValidationError(
					`Exercise ${index}, Set ${setIndex}: type is required`
				);
			}

			// Validate set type is valid
			const validSetTypes = ["warmup", "normal", "failure", "dropset"];
			if (!validSetTypes.includes(set.type)) {
				throw new ValidationError(
					`Exercise ${index}, Set ${setIndex}: Invalid set type "${set.type}". Must be one of: ${validSetTypes.join(", ")}`
				);
			}

			// Validate numeric fields are not negative
			const numericFields = [
				"weight_kg",
				"reps",
				"distance_meters",
				"duration_seconds",
				"custom_metric",
			];
			for (const field of numericFields) {
				if (
					set[field] !== null &&
					set[field] !== undefined &&
					set[field] < 0
				) {
					throw new ValidationError(
						`Exercise ${index}, Set ${setIndex}: ${field} cannot be negative`
					);
				}
			}

			// Validate rep_range if present
			if (set.rep_range) {
				if (
					set.rep_range.start !== null &&
					set.rep_range.start !== undefined &&
					set.rep_range.start < 0
				) {
					throw new ValidationError(
						`Exercise ${index}, Set ${setIndex}: rep_range.start cannot be negative`
					);
				}
				if (
					set.rep_range.end !== null &&
					set.rep_range.end !== undefined &&
					set.rep_range.end < 0
				) {
					throw new ValidationError(
						`Exercise ${index}, Set ${setIndex}: rep_range.end cannot be negative`
					);
				}
				if (
					set.rep_range.start !== null &&
					set.rep_range.end !== null &&
					set.rep_range.start !== undefined &&
					set.rep_range.end !== undefined &&
					set.rep_range.start > set.rep_range.end
				) {
					throw new ValidationError(
						`Exercise ${index}, Set ${setIndex}: rep_range.start cannot be greater than rep_range.end`
					);
				}
			}
		}
	}
}

/**
 * Validates workout data including dates
 * @param workout - Workout data to validate
 * @throws ValidationError if validation fails
 */
export function validateWorkoutData(workout: any): void {
	// Validate dates
	validateISO8601Date(workout.start_time, "start_time");
	validateISO8601Date(workout.end_time, "end_time");

	// Validate that end_time is after start_time
	const startDate = new Date(workout.start_time);
	const endDate = new Date(workout.end_time);

	if (endDate <= startDate) {
		throw new ValidationError(
			"end_time must be after start_time"
		);
	}

	// Validate exercises
	validateWorkoutExercises(workout.exercises);
}

/**
 * Validates routine data
 * @param routine - Routine data to validate
 * @throws ValidationError if validation fails
 */
export function validateRoutineData(routine: any): void {
	if (!routine.title || routine.title.trim() === "") {
		throw new ValidationError("Routine title is required and cannot be empty");
	}

	// Validate exercises
	validateRoutineExercises(routine.exercises);
}

/**
 * Validates exercise template data
 * @param template - Exercise template data to validate
 * @throws ValidationError if validation fails
 */
export function validateExerciseTemplate(template: any): void {
	if (!template.title || template.title.trim() === "") {
		throw new ValidationError(
			"Exercise template title is required and cannot be empty"
		);
	}

	if (!template.exercise_type) {
		throw new ValidationError("Exercise type is required");
	}

	if (!template.equipment_category) {
		throw new ValidationError("Equipment category is required");
	}

	if (!template.muscle_group) {
		throw new ValidationError("Muscle group is required");
	}
}

/**
 * Pagination limits for different endpoints
 */
export const PAGINATION_LIMITS = {
	WORKOUTS: 10,
	ROUTINES: 10,
	ROUTINE_FOLDERS: 10,
	WORKOUT_EVENTS: 10,
	EXERCISE_TEMPLATES: 100,
} as const;

/**
 * Creates validated pagination parameters with proper limits
 * @param page - Page number
 * @param pageSize - Page size
 * @param maxPageSize - Maximum allowed page size
 * @returns Validated pagination parameters
 * @throws ValidationError if validation fails
 */
export function createValidatedPagination(
	page: number,
	pageSize: number,
	maxPageSize: number
): { page: number; pageSize: number } {
	validatePagination(page, pageSize, maxPageSize);
	return { page, pageSize };
}
