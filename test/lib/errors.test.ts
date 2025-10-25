import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
	formatHevyApiError,
	formatValidationError,
	formatValidationErrorMessage,
	handleError,
	type McpToolResponse,
} from "../../src/lib/errors.js";
import { HevyApiError } from "../../src/lib/client.js";
import { ValidationError } from "../../src/lib/transforms.js";

describe("Error Handling", () => {
	describe("formatHevyApiError", () => {
		it("should format 400 Bad Request errors", () => {
			const error = new HevyApiError(
				"Bad Request",
				400,
				{ error: "Invalid workout data" }
			);
			const result = formatHevyApiError(error);

			expect(result.content[0].text).toContain("❌ Invalid request parameters");
			expect(result.content[0].text).toContain("Invalid workout data");
			expect(result.content[0].text).toContain("Check that all required parameters are provided");
			expect(result.isError).toBe(true);
		});

		it("should format 401 Unauthorized errors", () => {
			const error = new HevyApiError("Unauthorized", 401);
			const result = formatHevyApiError(error);

		expect(result.content[0].text).toContain("❌ Unauthorized - Invalid API key");
		expect(result.content[0].text).toContain("Verify your Hevy API key is configured at /setup");
			expect(result.isError).toBe(true);
		});

		it("should format 403 Forbidden errors", () => {
			const error = new HevyApiError("Forbidden", 403);
			const result = formatHevyApiError(error);

			expect(result.content[0].text).toContain("❌ Limit exceeded or unauthorized");
			expect(result.content[0].text).toContain("You may have exceeded API rate limits");
			expect(result.isError).toBe(true);
		});

		it("should format 404 Not Found errors", () => {
			const error = new HevyApiError("Not Found", 404);
			const result = formatHevyApiError(error);

			expect(result.content[0].text).toContain("❌ Resource not found");
			expect(result.content[0].text).toContain("Verify the resource ID exists");
			expect(result.isError).toBe(true);
		});

		it("should format 429 Rate Limit errors", () => {
			const error = new HevyApiError("Too Many Requests", 429);
			const result = formatHevyApiError(error);

			expect(result.content[0].text).toContain("❌ Rate limit exceeded");
			expect(result.content[0].text).toContain("Wait before making more requests");
			expect(result.isError).toBe(true);
		});

		it("should format 500 Internal Server errors", () => {
			const error = new HevyApiError("Internal Server Error", 500);
			const result = formatHevyApiError(error);

			expect(result.content[0].text).toContain("❌ Hevy API error");
			expect(result.content[0].text).toContain("This is a temporary Hevy API issue");
			expect(result.isError).toBe(true);
		});

		it("should handle error data with validation errors array", () => {
			const error = new HevyApiError(
				"Validation Failed",
				400,
				{
					errors: [
						{ field: "startTime", message: "Invalid date format" },
						{ field: "exercises", message: "At least one exercise required" },
					],
				}
			);
			const result = formatHevyApiError(error);

			expect(result.content[0].text).toContain("**Validation Errors:**");
			expect(result.content[0].text).toContain("startTime: Invalid date format");
			expect(result.content[0].text).toContain("exercises: At least one exercise required");
			expect(result.isError).toBe(true);
		});

		it("should handle error data as plain string", () => {
			const error = new HevyApiError(
				"Server Error",
				500,
				"Database connection failed"
			);
			const result = formatHevyApiError(error);

			expect(result.content[0].text).toContain("Database connection failed");
			expect(result.isError).toBe(true);
		});

		it("should handle error data with error property", () => {
			const error = new HevyApiError(
				"Bad Request",
				400,
				{ error: "Missing required field: title" }
			);
			const result = formatHevyApiError(error);

			expect(result.content[0].text).toContain("Missing required field: title");
			expect(result.isError).toBe(true);
		});

		it("should handle error data with message property", () => {
			const error = new HevyApiError(
				"Bad Request",
				400,
				{ message: "Workout date must be in the past" }
			);
			const result = formatHevyApiError(error);

			expect(result.content[0].text).toContain("Workout date must be in the past");
			expect(result.isError).toBe(true);
		});

		it("should handle unknown status codes", () => {
			const error = new HevyApiError("Unknown Error", 418);
			const result = formatHevyApiError(error);

			expect(result.content[0].text).toContain("❌ Unexpected error (HTTP 418)");
			expect(result.content[0].text).toContain("Review the error details above");
			expect(result.isError).toBe(true);
		});
	});

	describe("formatValidationError", () => {
		it("should format Zod validation errors with field paths", () => {
			// Create a sample Zod schema and try to parse invalid data
			const error = new ZodError([
				{
					code: "invalid_type",
					expected: "string",
					received: "number",
					path: ["title"],
					message: "Expected string, received number",
				},
				{
					code: "invalid_type",
					expected: "array",
					received: "undefined",
					path: ["exercises"],
					message: "Required",
				},
			]);

			const result = formatValidationError(error);

			expect(result.content[0].text).toContain("❌ Schema Validation Error");
			expect(result.content[0].text).toContain("**title**:");
			expect(result.content[0].text).toContain("Expected string, received number");
			expect(result.content[0].text).toContain("**exercises**:");
			expect(result.content[0].text).toContain("Required");
			expect(result.isError).toBe(true);
		});

		it("should format nested field paths", () => {
			const error = new ZodError([
				{
					code: "too_small",
					minimum: 1,
					type: "array",
					inclusive: true,
					exact: false,
					path: ["exercises", 0, "sets"],
					message: "Array must contain at least 1 element(s)",
				},
			]);

			const result = formatValidationError(error);

			expect(result.content[0].text).toContain("**exercises.0.sets**:");
			expect(result.content[0].text).toContain("Array must contain at least 1 element(s)");
			expect(result.isError).toBe(true);
		});

		it("should group multiple errors for the same field", () => {
			const error = new ZodError([
				{
					code: "too_small",
					minimum: 1,
					type: "number",
					inclusive: true,
					exact: false,
					path: ["page"],
					message: "Number must be greater than or equal to 1",
				},
				{
					code: "invalid_type",
					expected: "number",
					received: "string",
					path: ["page"],
					message: "Expected number, received string",
				},
			]);

			const result = formatValidationError(error);

			expect(result.content[0].text).toContain("**page**:");
			expect(result.content[0].text).toContain("Number must be greater than or equal to 1");
			expect(result.content[0].text).toContain("Expected number, received string");
			expect(result.isError).toBe(true);
		});

		it("should handle root-level errors", () => {
			const error = new ZodError([
				{
					code: "invalid_type",
					expected: "object",
					received: "null",
					path: [],
					message: "Expected object, received null",
				},
			]);

			const result = formatValidationError(error);

			expect(result.content[0].text).toContain("Expected object, received null");
			expect(result.isError).toBe(true);
		});
	});

	describe("formatValidationErrorMessage", () => {
		it("should format pagination errors (page too small)", () => {
			const error = new ValidationError("Page must be 1 or greater, got 0");
			const result = formatValidationErrorMessage(error);

			expect(result.content[0].text).toContain("❌ Validation Error");
			expect(result.content[0].text).toContain("Page must be 1 or greater, got 0");
			expect(result.content[0].text).toContain("Page numbers start at 1");
			expect(result.isError).toBe(true);
		});

		it("should format pagination errors (page size too large)", () => {
			const error = new ValidationError("Page size cannot exceed 10, got 50");
			const result = formatValidationErrorMessage(error);

			expect(result.content[0].text).toContain("Page size cannot exceed 10, got 50");
			expect(result.content[0].text).toContain("Check the maximum page size for this endpoint");
			expect(result.isError).toBe(true);
		});

		it("should format ISO 8601 date errors", () => {
			const error = new ValidationError(
				"startTime must be in ISO 8601 format (e.g., 2024-01-15T10:00:00Z)"
			);
			const result = formatValidationErrorMessage(error);

			expect(result.content[0].text).toContain("Use ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ");
			expect(result.content[0].text).toContain("Example: 2024-01-15T10:00:00Z");
			expect(result.isError).toBe(true);
		});

		it("should format endTime validation errors", () => {
			const error = new ValidationError("endTime must be after startTime");
			const result = formatValidationErrorMessage(error);

			expect(result.content[0].text).toContain("Ensure endTime is later than startTime");
			expect(result.isError).toBe(true);
		});

		it("should format RPE validation errors", () => {
			const error = new ValidationError("RPE must be one of: 6, 7, 7.5, 8, 8.5, 9, 9.5, 10. Got 11");
			const result = formatValidationErrorMessage(error);

			expect(result.content[0].text).toContain("RPE must be one of: 6, 7, 7.5, 8, 8.5, 9, 9.5, 10");
			expect(result.content[0].text).toContain("Use half-step increments");
			expect(result.isError).toBe(true);
		});

		it("should format exercise validation errors", () => {
			const error = new ValidationError("At least one exercise is required");
			const result = formatValidationErrorMessage(error);

			expect(result.content[0].text).toContain("Include at least one exercise");
			expect(result.isError).toBe(true);
		});

		it("should format set validation errors", () => {
			const error = new ValidationError("Exercise at index 0 must have at least one set");
			const result = formatValidationErrorMessage(error);

			expect(result.content[0].text).toContain("Include at least one set for each exercise");
			expect(result.isError).toBe(true);
		});

		it("should format negative value errors", () => {
			const error = new ValidationError("Exercise 0, Set 1: weightKg cannot be negative");
			const result = formatValidationErrorMessage(error);

			expect(result.content[0].text).toContain("Ensure all numeric values are positive or zero");
			expect(result.isError).toBe(true);
		});

		it("should format rep range errors", () => {
			const error = new ValidationError(
				"Exercise 0, Set 0: repRange.start cannot be greater than repRange.end"
			);
			const result = formatValidationErrorMessage(error);

			expect(result.content[0].text).toContain("Ensure rep range start is less than or equal to end");
			expect(result.isError).toBe(true);
		});

		it("should format title validation errors", () => {
			const error = new ValidationError("Routine title is required and cannot be empty");
			const result = formatValidationErrorMessage(error);

			expect(result.content[0].text).toContain("Provide a non-empty title");
			expect(result.isError).toBe(true);
		});

		it("should provide generic advice for unknown errors", () => {
			const error = new ValidationError("Some unknown validation error");
			const result = formatValidationErrorMessage(error);

			expect(result.content[0].text).toContain("Review the error message for specific details");
			expect(result.isError).toBe(true);
		});
	});

	describe("handleError", () => {
		it("should route HevyApiError to formatHevyApiError", () => {
			const error = new HevyApiError("Not Found", 404);
			const result = handleError(error);

			expect(result.content[0].text).toContain("❌ Resource not found");
			expect(result.isError).toBe(true);
		});

		it("should route ZodError to formatValidationError", () => {
			const error = new ZodError([
				{
					code: "invalid_type",
					expected: "string",
					received: "number",
					path: ["title"],
					message: "Expected string, received number",
				},
			]);
			const result = handleError(error);

			expect(result.content[0].text).toContain("❌ Schema Validation Error");
			expect(result.isError).toBe(true);
		});

		it("should route ValidationError to formatValidationErrorMessage", () => {
			const error = new ValidationError("Page must be 1 or greater, got 0");
			const result = handleError(error);

			expect(result.content[0].text).toContain("❌ Validation Error");
			expect(result.isError).toBe(true);
		});

		it("should handle generic Error objects", () => {
			const error = new Error("Something unexpected happened");
			const result = handleError(error);

			expect(result.content[0].text).toContain("❌ Error: Something unexpected happened");
			expect(result.isError).toBe(true);
		});

		it("should handle unknown error types", () => {
			const error = "plain string error";
			const result = handleError(error);

			expect(result.content[0].text).toContain("❌ An unknown error occurred");
			expect(result.isError).toBe(true);
		});

		it("should handle null and undefined", () => {
			expect(handleError(null).content[0].text).toContain("❌ An unknown error occurred");
			expect(handleError(undefined).content[0].text).toContain("❌ An unknown error occurred");
		});
	});

	describe("McpToolResponse structure", () => {
		it("should have the correct structure", () => {
			const error = new HevyApiError("Test", 400);
			const result = formatHevyApiError(error);

			expect(result).toHaveProperty("content");
			expect(Array.isArray(result.content)).toBe(true);
			expect(result.content.length).toBeGreaterThan(0);
			expect(result.content[0]).toHaveProperty("type", "text");
			expect(result.content[0]).toHaveProperty("text");
			expect(typeof result.content[0].text).toBe("string");
			expect(result).toHaveProperty("isError", true);
		});

		it("should support index signature", () => {
			const error = new HevyApiError("Test", 400);
			const result: McpToolResponse = formatHevyApiError(error);

			// This should compile without errors due to index signature
			const dynamicProp: unknown = result["someProperty"];
			expect(dynamicProp).toBeUndefined();
		});
	});
});

