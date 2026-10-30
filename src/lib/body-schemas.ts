/**
 * Schemas for Hevy body measurements (GET/POST /v1/body_measurements,
 * GET/PUT /v1/body_measurements/{date}).
 */
import { z } from "zod";

export const MeasurementDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
	.describe("Calendar date of the measurement (YYYY-MM-DD)");

const cm = (what: string) =>
	z
		.number()
		.nonnegative()
		.optional()
		.nullable()
		.describe(`${what} in centimetres`);

/** All measurement fields are optional; `null` clears a value on update. */
export const BodyMeasurementFieldsSchema = z.object({
	weight_kg: z
		.number()
		.nonnegative()
		.optional()
		.nullable()
		.describe("Body weight in kilograms"),
	lean_mass_kg: z
		.number()
		.nonnegative()
		.optional()
		.nullable()
		.describe("Lean body mass in kilograms"),
	fat_percent: z
		.number()
		.min(0)
		.max(100)
		.optional()
		.nullable()
		.describe("Body fat percentage (0-100)"),
	neck_cm: cm("Neck circumference"),
	shoulder_cm: cm("Shoulder circumference"),
	chest_cm: cm("Chest circumference"),
	left_bicep_cm: cm("Left bicep circumference"),
	right_bicep_cm: cm("Right bicep circumference"),
	left_forearm_cm: cm("Left forearm circumference"),
	right_forearm_cm: cm("Right forearm circumference"),
	abdomen: cm("Abdomen circumference"),
	waist: cm("Waist circumference"),
	hips: cm("Hip circumference"),
	left_thigh: cm("Left thigh circumference"),
	right_thigh: cm("Right thigh circumference"),
	left_calf: cm("Left calf circumference"),
	right_calf: cm("Right calf circumference"),
});
export type BodyMeasurementFields = z.infer<typeof BodyMeasurementFieldsSchema>;

/** Drop undefined keys so the API only receives values the caller set (explicit nulls are kept). */
export function toBodyMeasurementPayload(
	fields: BodyMeasurementFields,
): Record<string, number | null> {
	return Object.fromEntries(
		Object.entries(fields).filter(([, value]) => value !== undefined),
	) as Record<string, number | null>;
}

/** Fields that carry a value, as "label: value unit" lines for a summary. */
export function summarizeMeasurement(entry: Record<string, unknown>): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(entry)) {
		if (key === "date" || value === null || value === undefined) continue;
		const unit = key.endsWith("_kg")
			? " kg"
			: key === "fat_percent"
				? " %"
				: " cm";
		parts.push(
			`${key.replace(/_(kg|cm)$/, "").replace(/_/g, " ")}: ${value}${unit}`,
		);
	}
	return parts.length ? parts.join(", ") : "no values recorded";
}
