import { describe, expect, it } from "vitest";
import {
	collectExerciseTemplates,
	filterExerciseTemplatesByTitle,
	paginateItems,
	parseCreatedExerciseTemplate,
	parseExerciseTemplatesPage,
} from "../../src/lib/exercise-templates.js";

describe("parseCreatedExerciseTemplate", () => {
	it("accepts the live Hevy response: a plain UUID string", () => {
		expect(
			parseCreatedExerciseTemplate("d0778813-ce6b-4f40-a3ec-a9c0f254e3d3"),
		).toEqual({ id: "d0778813-ce6b-4f40-a3ec-a9c0f254e3d3" });
	});

	it("trims whitespace around a string id", () => {
		expect(parseCreatedExerciseTemplate("  abc-123 \n")).toEqual({
			id: "abc-123",
		});
	});

	it("accepts the OpenAPI snapshot shape { id: number }", () => {
		expect(parseCreatedExerciseTemplate({ id: 123 })).toEqual({ id: "123" });
	});

	it("accepts { id: string } and ignores extra fields", () => {
		expect(
			parseCreatedExerciseTemplate({
				id: "new-template-id",
				title: "My Exercise",
			}),
		).toEqual({ id: "new-template-id" });
	});

	it("rejects bodies with no id", () => {
		expect(() => parseCreatedExerciseTemplate({})).toThrow(
			"Hevy did not return an exercise template id",
		);
		expect(() => parseCreatedExerciseTemplate(null)).toThrow(
			"Hevy did not return an exercise template id",
		);
		expect(() => parseCreatedExerciseTemplate("")).toThrow(
			"Hevy did not return an exercise template id",
		);
	});
});

describe("parseExerciseTemplatesPage", () => {
	it("reads page_count and defaults a missing template array to empty", () => {
		expect(parseExerciseTemplatesPage({ page: 2, page_count: 5 })).toEqual({
			page: 2,
			page_count: 5,
			exercise_templates: [],
		});
	});

	it("rejects a body with no page_count instead of inventing one", () => {
		expect(() =>
			parseExerciseTemplatesPage({ exercise_templates: [] }),
		).toThrow("Hevy did not return a paginated exercise template list");
	});
});

describe("collectExerciseTemplates", () => {
	it("walks every catalog page and concatenates the rows", async () => {
		const pages = [
			{
				page: 1,
				page_count: 2,
				exercise_templates: [{ id: "1", title: "A" }],
			},
			{
				page: 2,
				page_count: 2,
				exercise_templates: [{ id: "2", title: "B" }],
			},
		];
		const fetched: Array<{ page: number; pageSize: number }> = [];

		const templates = await collectExerciseTemplates(async (page, pageSize) => {
			fetched.push({ page, pageSize });
			return pages[page - 1];
		}, 100);

		expect(fetched).toEqual([
			{ page: 1, pageSize: 100 },
			{ page: 2, pageSize: 100 },
		]);
		expect(templates).toEqual([
			{ id: "1", title: "A" },
			{ id: "2", title: "B" },
		]);
	});
});

describe("filterExerciseTemplatesByTitle", () => {
	const templates = [
		{ id: "1", title: "Bench Press (Barbell)" },
		{ id: "2", title: "Pallof Press" },
		{ id: "3", title: "My Custom Pallof", is_custom: true },
		{ id: "4", title: "Squat" },
		{ id: "5", title: undefined },
	];

	it("matches titles case-insensitively, including custom exercises", () => {
		expect(filterExerciseTemplatesByTitle(templates, "pallof")).toEqual([
			{ id: "2", title: "Pallof Press" },
			{ id: "3", title: "My Custom Pallof", is_custom: true },
		]);
		expect(filterExerciseTemplatesByTitle(templates, "PALLOF")).toHaveLength(2);
	});

	it("returns no rows for a blank query", () => {
		expect(filterExerciseTemplatesByTitle(templates, "   ")).toEqual([]);
	});
});

describe("paginateItems", () => {
	it("slices a filtered list and reports page_count from the match total", () => {
		const items = ["a", "b", "c"];
		expect(paginateItems(items, 2, 1)).toEqual({
			page: 2,
			page_count: 3,
			items: ["b"],
		});
		expect(paginateItems([], 1, 20)).toEqual({
			page: 1,
			page_count: 1,
			items: [],
		});
	});
});
