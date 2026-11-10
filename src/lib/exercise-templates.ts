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

const MAX_CATALOG_PAGES = 20;

function formatZodIssues(error: z.ZodError): string {
	return error.issues
		.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
		.join("; ");
}

export function parseCreatedExerciseTemplate(
	data: unknown,
): CreatedExerciseTemplate {
	const parsed = CreatedExerciseTemplateIdSchema.safeParse(data);
	if (!parsed.success) {
		throw new Error(
			`Hevy did not return an exercise template id from POST /v1/exercise_templates (${formatZodIssues(parsed.error)})`,
		);
	}
	return { id: parsed.data };
}

const ExerciseTemplateListItemSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	type: z.string().min(1),
	primary_muscle_group: z.string().min(1),
	is_custom: z.boolean(),
});
export type ExerciseTemplateListItem = z.infer<
	typeof ExerciseTemplateListItemSchema
>;

const ExerciseTemplatesPageSchema = z.object({
	page: z.number().int().positive(),
	page_count: z.number().int().nonnegative(),
	exercise_templates: z.array(ExerciseTemplateListItemSchema),
});
export type ExerciseTemplatesPage = z.infer<typeof ExerciseTemplatesPageSchema>;

export function parseExerciseTemplatesPage(data: unknown): ExerciseTemplatesPage {
	const parsed = ExerciseTemplatesPageSchema.safeParse(data);
	if (!parsed.success) {
		throw new Error(
			`Hevy did not return a paginated exercise template list from GET /v1/exercise_templates (${formatZodIssues(parsed.error)})`,
		);
	}
	return parsed.data;
}

async function collectExerciseTemplates(
	fetchPage: (page: number, pageSize: number) => Promise<ExerciseTemplatesPage>,
	pageSize: number,
): Promise<ExerciseTemplateListItem[]> {
	const first = await fetchPage(1, pageSize);
	if (first.page_count > MAX_CATALOG_PAGES) {
		throw new Error(
			`Hevy reported ${first.page_count} exercise-template pages; search stops at ${MAX_CATALOG_PAGES}`,
		);
	}
	const rest = await Promise.all(
		Array.from({ length: Math.max(0, first.page_count - 1) }, (_, index) =>
			fetchPage(index + 2, pageSize),
		),
	);
	return [first, ...rest].flatMap((entry) => entry.exercise_templates);
}

export async function searchExerciseTemplates(
	fetchPage: (page: number, pageSize: number) => Promise<ExerciseTemplatesPage>,
	query: string,
	page: number,
	pageSize: number,
	catalogPageSize: number,
): Promise<{
	total: number;
	page: number;
	page_count: number;
	items: ExerciseTemplateListItem[];
}> {
	const needle = query.trim().toLowerCase();
	const matches = (await collectExerciseTemplates(fetchPage, catalogPageSize)).filter(
		(template) => template.title.toLowerCase().includes(needle),
	);
	const page_count = Math.max(1, Math.ceil(matches.length / pageSize));
	const start = (page - 1) * pageSize;
	return {
		total: matches.length,
		page,
		page_count,
		items: matches.slice(start, start + pageSize),
	};
}
