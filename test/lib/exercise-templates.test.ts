import { describe, expect, it } from "vitest";
import {
	parseCreatedExerciseTemplate,
	parseExerciseTemplatesPage,
	searchExerciseTemplates,
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

	it("rejects bodies with no id and names the missing field", () => {
		expect(() => parseCreatedExerciseTemplate({})).toThrow(
			/Hevy did not return an exercise template id.*id/,
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
	it("reads page, page_count, and the template rows", () => {
		expect(
			parseExerciseTemplatesPage({
				page: 2,
				page_count: 5,
				exercise_templates: [
					{
						id: "1",
						title: "Bench",
						type: "weight_reps",
						primary_muscle_group: "chest",
						is_custom: false,
					},
				],
			}),
		).toEqual({
			page: 2,
			page_count: 5,
			exercise_templates: [
				{
					id: "1",
					title: "Bench",
					type: "weight_reps",
					primary_muscle_group: "chest",
					is_custom: false,
				},
			],
		});
	});

	it("rejects a body with no page_count or template array", () => {
		expect(() =>
			parseExerciseTemplatesPage({ exercise_templates: [] }),
		).toThrow("Hevy did not return a paginated exercise template list");
		expect(() => parseExerciseTemplatesPage({ page: 1, page_count: 1 })).toThrow(
			/exercise_templates/,
		);
	});

	it("rejects a row missing the fields the list prints", () => {
		expect(() =>
			parseExerciseTemplatesPage({
				page: 1,
				page_count: 1,
				exercise_templates: [{ id: "1", title: "Bench" }],
			}),
		).toThrow(/type/);
	});
});

describe("searchExerciseTemplates", () => {
	it("walks every catalog page page 1 announced, even if a later page lies about page_count", async () => {
		const pages: Record<number, object> = {
			1: {
				page: 1,
				page_count: 2,
				exercise_templates: [
					{
						id: "1",
						title: "Curl A",
						type: "weight_reps",
						primary_muscle_group: "biceps",
						is_custom: false,
					},
				],
			},
			2: {
				page: 2,
				page_count: 99,
				exercise_templates: [
					{
						id: "2",
						title: "Curl B",
						type: "weight_reps",
						primary_muscle_group: "biceps",
						is_custom: false,
					},
				],
			},
		};
		const fetched: number[] = [];

		const result = await searchExerciseTemplates(
			async (page, pageSize) => {
				fetched.push(page);
				expect(pageSize).toBe(100);
				return pages[page];
			},
			"curl",
			1,
			20,
			100,
		);

		expect(fetched).toEqual([1, 2]);
		expect(result.total).toBe(2);
		expect(result.items.map((item) => item.id)).toEqual(["1", "2"]);
	});

	it("matches titles case-insensitively, including custom exercises, and paginates matches", async () => {
		const result = await searchExerciseTemplates(
			async () => ({
				page: 1,
				page_count: 1,
				exercise_templates: [
					{
						id: "1",
						title: "Bench Press (Barbell)",
						type: "weight_reps",
						primary_muscle_group: "chest",
						is_custom: false,
					},
					{
						id: "2",
						title: "Pallof Press",
						type: "weight_reps",
						primary_muscle_group: "abdominals",
						is_custom: false,
					},
					{
						id: "3",
						title: "My Custom Pallof",
						type: "weight_reps",
						primary_muscle_group: "abdominals",
						is_custom: true,
					},
					{
						id: "4",
						title: "Squat",
						type: "weight_reps",
						primary_muscle_group: "quadriceps",
						is_custom: false,
					},
				],
			}),
			"PALLOF",
			2,
			1,
			100,
		);

		expect(result.total).toBe(2);
		expect(result.page).toBe(2);
		expect(result.page_count).toBe(2);
		expect(result.items).toEqual([
			{
				id: "3",
				title: "My Custom Pallof",
				type: "weight_reps",
				primary_muscle_group: "abdominals",
				is_custom: true,
			},
		]);
	});

	it("throws when Hevy reports more catalog pages than the search cap", async () => {
		await expect(
			searchExerciseTemplates(
				async () => ({
					page: 1,
					page_count: 21,
					exercise_templates: [
						{
							id: "1",
							title: "Curl",
							type: "weight_reps",
							primary_muscle_group: "biceps",
							is_custom: false,
						},
					],
				}),
				"curl",
				1,
				20,
				100,
			),
		).rejects.toThrow(
			"Hevy reported 21 exercise-template pages; search stops at 20",
		);
	});
});
