import { z } from "zod";

/**
 * Hevy's OpenAPI snapshot claims POST /v1/exercise_templates returns `{ id: integer }`.
 * The live API returns the new template id as a text/plain UUID string instead.
 * JSON `{ id }` is accepted so a spec-shaped response still works.
 */
const CreatedExerciseTemplateIdSchema = z.union([
	z.string().trim().min(1),
	z
		.object({
			id: z.union([z.string().trim().min(1), z.number()]),
		})
		.transform((value) => String(value.id)),
]);

export type CreatedExerciseTemplate = { id: string };

export function parseCreatedExerciseTemplate(
	data: unknown,
): CreatedExerciseTemplate {
	const parsed = CreatedExerciseTemplateIdSchema.safeParse(data);
	if (!parsed.success) {
		throw new Error(
			"Hevy did not return an exercise template id from POST /v1/exercise_templates",
		);
	}
	return { id: parsed.data };
}

export type ExerciseTemplateListItem = {
	id?: string;
	title?: string;
	type?: string;
	primary_muscle_group?: string;
	is_custom?: boolean;
};

export function filterExerciseTemplatesByTitle<
	T extends { title?: string | null },
>(templates: T[], query: string): T[] {
	const needle = query.trim().toLowerCase();
	if (needle.length === 0) {
		return [];
	}
	return templates.filter(
		(template) =>
			typeof template.title === "string" &&
			template.title.toLowerCase().includes(needle),
	);
}

export function paginateItems<T>(
	items: T[],
	page: number,
	pageSize: number,
): { page: number; page_count: number; items: T[] } {
	const page_count = Math.max(1, Math.ceil(items.length / pageSize));
	const start = (page - 1) * pageSize;
	return {
		page,
		page_count,
		items: items.slice(start, start + pageSize),
	};
}
