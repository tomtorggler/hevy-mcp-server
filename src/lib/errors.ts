import { ZodError } from "zod";
import { HevyApiError } from "./client.js";
import { ValidationError } from "./transforms.js";

/**
 * MCP Tool Response type
 */
export interface McpToolResponse {
	[x: string]: unknown;
	content: Array<{
		type: "text";
		text: string;
	}>;
	isError?: boolean;
}

/**
 * HTTP status code to user-friendly message mapping
 */
const STATUS_CODE_MESSAGES: Record<number, string> = {
	400: "Invalid request parameters",
	401: "Unauthorized - Invalid API key",
	403: "Limit exceeded or unauthorized",
	404: "Resource not found",
	429: "Rate limit exceeded",
	500: "Hevy API error",
	502: "Hevy API is temporarily unavailable",
	503: "Hevy API is temporarily unavailable",
};

/**
 * Get a user-friendly message for an HTTP status code
 */
function getStatusMessage(status: number): string {
	return STATUS_CODE_MESSAGES[status] || `Unexpected error (HTTP ${status})`;
}

/**
 * Format a Hevy API error into a user-friendly MCP tool response
 * 
 * @param error - The HevyApiError to format
 * @returns MCP tool response with actionable error information
 * 
 * @example
 * ```typescript
 * try {
 *   await client.getWorkout("invalid-id");
 * } catch (error) {
 *   if (error instanceof HevyApiError) {
 *     return formatHevyApiError(error);
 *   }
 * }
 * ```
 */
export function formatHevyApiError(error: HevyApiError): McpToolResponse {
	const statusMessage = getStatusMessage(error.status);
	const parts: string[] = [];

	// Add the main error message
	parts.push(`❌ ${statusMessage}`);
	parts.push("");

	// Add what went wrong
	parts.push("**What went wrong:**");
	parts.push(error.message);

	// Add API-specific details if available
	if (error.data) {
		if (typeof error.data === "string") {
			parts.push("");
			parts.push("**Details:**");
			parts.push(error.data);
		} else if (typeof error.data === "object") {
			// Try to extract useful information from the error data
			const errorData = error.data;

			if (errorData.error) {
				parts.push("");
				parts.push("**Details:**");
				parts.push(errorData.error);
			}

			if (errorData.message) {
				parts.push("");
				parts.push("**Details:**");
				parts.push(errorData.message);
			}

			if (errorData.errors && Array.isArray(errorData.errors)) {
				parts.push("");
				parts.push("**Validation Errors:**");
				for (const err of errorData.errors) {
					if (typeof err === "string") {
						parts.push(`  - ${err}`);
					} else if (err.field && err.message) {
						parts.push(`  - ${err.field}: ${err.message}`);
					}
				}
			}
		}
	}

	// Add actionable advice based on status code
	parts.push("");
	parts.push("**How to fix:**");

	switch (error.status) {
		case 400:
			parts.push("  - Check that all required parameters are provided");
			parts.push("  - Verify parameter formats (dates, IDs, numbers)");
			parts.push("  - Ensure all values are within valid ranges");
			break;

		case 401:
			parts.push("  - Verify your Hevy API key is configured at /setup");
			parts.push("  - Check that your API key is still valid");
			parts.push("  - Generate a new API key from Hevy if needed");
			break;

		case 403:
			parts.push("  - You may have exceeded API rate limits");
			parts.push("  - Try reducing the frequency of requests");
			parts.push("  - Contact Hevy support if limits are too restrictive");
			break;

		case 404:
			parts.push("  - Verify the resource ID exists");
			parts.push("  - Check for typos in the ID");
			parts.push("  - Use list endpoints (e.g., get_workouts) to find valid IDs");
			break;

		case 429:
			parts.push("  - Wait before making more requests");
			parts.push("  - Implement exponential backoff");
			parts.push("  - Reduce request frequency");
			break;

		case 500:
		case 502:
		case 503:
			parts.push("  - This is a temporary Hevy API issue");
			parts.push("  - Try again in a few moments");
			parts.push("  - If the problem persists, contact Hevy support");
			break;

		default:
			parts.push("  - Review the error details above");
			parts.push("  - Consult the Hevy API documentation");
			parts.push("  - Contact Hevy support if the issue persists");
	}

	return {
		content: [
			{
				type: "text",
				text: parts.join("\n"),
			},
		],
		isError: true,
	};
}

/**
 * Format a Zod validation error into a user-friendly MCP tool response
 * 
 * @param error - The ZodError to format
 * @returns MCP tool response with specific validation error details
 * 
 * @example
 * ```typescript
 * try {
 *   const result = WorkoutSchema.parse(data);
 * } catch (error) {
 *   if (error instanceof ZodError) {
 *     return formatValidationError(error);
 *   }
 * }
 * ```
 */
export function formatValidationError(error: ZodError): McpToolResponse {
	const parts: string[] = [];

	parts.push("❌ Schema Validation Error");
	parts.push("");
	parts.push("**What went wrong:**");
	parts.push("The provided data does not match the expected format.");
	parts.push("");

	// Group errors by path for better readability
	const errorsByPath = new Map<string, string[]>();

	for (const issue of error.errors) {
		const path = issue.path.length > 0 ? issue.path.join(".") : "root";
		const messages = errorsByPath.get(path) || [];
		messages.push(issue.message);
		errorsByPath.set(path, messages);
	}

	parts.push("**Validation Issues:**");
	for (const [path, messages] of errorsByPath.entries()) {
		if (path === "root") {
			for (const message of messages) {
				parts.push(`  - ${message}`);
			}
		} else {
			parts.push(`  - **${path}**:`);
			for (const message of messages) {
				parts.push(`    ${message}`);
			}
		}
	}

	parts.push("");
	parts.push("**How to fix:**");
	parts.push("  - Review the validation issues listed above");
	parts.push("  - Ensure all required fields are provided");
	parts.push("  - Check that field types match expected types (string, number, etc.)");
	parts.push("  - Verify that enum values are from the allowed set");

	return {
		content: [
			{
				type: "text",
				text: parts.join("\n"),
			},
		],
		isError: true,
	};
}

/**
 * Format a custom validation error into a user-friendly MCP tool response
 * 
 * @param error - The ValidationError to format
 * @returns MCP tool response with specific validation error details
 * 
 * @example
 * ```typescript
 * try {
 *   validateWorkoutData(workout);
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     return formatValidationErrorMessage(error);
 *   }
 * }
 * ```
 */
export function formatValidationErrorMessage(error: ValidationError): McpToolResponse {
	const parts: string[] = [];

	parts.push("❌ Validation Error");
	parts.push("");
	parts.push("**What went wrong:**");
	parts.push(error.message);
	parts.push("");

	// Parse the error message to provide specific advice
	const message = error.message.toLowerCase();

	parts.push("**How to fix:**");

	// Pagination errors
	if (message.includes("page") && message.includes("greater")) {
		parts.push("  - Page numbers start at 1");
		parts.push("  - Provide a valid page number (1 or greater)");
	} else if (message.includes("page size")) {
		parts.push("  - Check the maximum page size for this endpoint");
		parts.push("  - Reduce the pageSize parameter");
		parts.push("  - Use pagination to retrieve data in smaller chunks");
	}
	// Date errors
	else if (message.includes("iso 8601")) {
		parts.push("  - Use ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ");
		parts.push("  - Example: 2024-01-15T10:00:00Z");
		parts.push("  - Include timezone (Z for UTC or ±HH:mm)");
	} else if (message.includes("endtime") && message.includes("after")) {
		parts.push("  - Ensure endTime is later than startTime");
		parts.push("  - Check for typos in date/time values");
		parts.push("  - Verify timezone offsets are correct");
	}
	// RPE errors
	else if (message.includes("rpe")) {
		parts.push("  - RPE must be one of: 6, 7, 7.5, 8, 8.5, 9, 9.5, 10");
		parts.push("  - Use half-step increments (e.g., 7.5, 8.5)");
		parts.push("  - Leave RPE null/undefined if not tracking it");
	}
	// Exercise errors
	else if (message.includes("exercise") && message.includes("required")) {
		parts.push("  - Include at least one exercise in your workout/routine");
		parts.push("  - Verify the exercises array is not empty");
	} else if (message.includes("exercise") && message.includes("missing")) {
		parts.push("  - Check that all required exercise fields are present");
		parts.push("  - Verify exercise template IDs are valid");
	}
	// Set errors
	else if (message.includes("set") && (message.includes("required") || message.includes("at least one"))) {
		parts.push("  - Include at least one set for each exercise");
		parts.push("  - Verify the sets array is not empty");
	} else if (message.includes("cannot be negative")) {
		parts.push("  - Ensure all numeric values are positive or zero");
		parts.push("  - Check weight, reps, distance, and duration values");
	}
	// Rep range errors
	else if (message.includes("reprange")) {
		parts.push("  - Ensure rep range start is less than or equal to end");
		parts.push("  - Both start and end should be positive numbers");
		parts.push("  - Example: { start: 8, end: 12 }");
	}
	// Title errors
	else if (message.includes("title") && message.includes("required")) {
		parts.push("  - Provide a non-empty title");
		parts.push("  - Title cannot be just whitespace");
	}
	// Generic advice
	else {
		parts.push("  - Review the error message for specific details");
		parts.push("  - Check that all values match expected types and formats");
		parts.push("  - Verify required fields are present");
	}

	return {
		content: [
			{
				type: "text",
				text: parts.join("\n"),
			},
		],
		isError: true,
	};
}

/**
 * Central error handler that routes errors to appropriate formatters
 * 
 * @param error - Any error object
 * @returns MCP tool response with formatted error information
 * 
 * @example
 * ```typescript
 * try {
 *   // ... some operation
 * } catch (error) {
 *   return handleError(error);
 * }
 * ```
 */
export function handleError(error: unknown): McpToolResponse {
	// Handle Hevy API errors
	if (error instanceof HevyApiError) {
		return formatHevyApiError(error);
	}

	// Handle Zod validation errors
	if (error instanceof ZodError) {
		return formatValidationError(error);
	}

	// Handle custom validation errors
	if (error instanceof ValidationError) {
		return formatValidationErrorMessage(error);
	}

	// Handle generic errors
	if (error instanceof Error) {
		return {
			content: [
				{
					type: "text",
					text: `❌ Error: ${error.message}`,
				},
			],
			isError: true,
		};
	}

	// Handle unknown error types
	return {
		content: [
			{
				type: "text",
				text: "❌ An unknown error occurred",
			},
		],
		isError: true,
	};
}

