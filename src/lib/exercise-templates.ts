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

const ExerciseTemplateListItemSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
	type: z.string().optional(),
	primary_muscle_group: z.string().optional(),
	is_custom: z.boolean().optional(),
});
export type ExerciseTemplateListItem = z.infer<
	typeof ExerciseTemplateListItemSchema
>;

const ExerciseTemplatesPageSchema = z.object({
	page: z.number().int().positive().optional().default(1),
	page_count: z.number().int().nonnegative(),
	exercise_templates: z
		.array(ExerciseTemplateListItemSchema)
		.optional()
		.default([]),
});
export type ExerciseTemplatesPage = z.infer<typeof ExerciseTemplatesPageSchema>;

export function parseExerciseTemplatesPage(data: unknown): ExerciseTemplatesPage {
	const parsed = ExerciseTemplatesPageSchema.safeParse(data);
	if (!parsed.success) {
		throw new Error(
			"Hevy did not return a paginated exercise template list from GET /v1/exercise_templates",
		);
	}
	return parsed.data;
}

export async function collectExerciseTemplates(
	fetchPage: (page: number, pageSize: number) => Promise<unknown>,
	pageSize: number,
): Promise<ExerciseTemplateListItem[]> {
	const templates: ExerciseTemplateListItem[] = [];
	let page = 1;
	let pageCount = 1;
	do {
		const parsed = parseExerciseTemplatesPage(await fetchPage(page, pageSize));
		templates.push(...parsed.exercise_templates);
		pageCount = parsed.page_count;
		page += 1;
	} while (page <= pageCount);
	return templates;
}

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
