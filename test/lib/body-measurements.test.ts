import { describe, it, expect, beforeEach, vi } from "vitest";
import { HevyClient } from "../../src/lib/client.js";
import { mockFetchSuccess } from "../setup.js";
import {
	BodyMeasurementFieldsSchema,
	MeasurementDateSchema,
	summarizeMeasurement,
	toBodyMeasurementPayload,
} from "../../src/lib/body-schemas.js";

describe("body measurement schemas", () => {
	it("accepts YYYY-MM-DD dates only", () => {
		expect(MeasurementDateSchema.safeParse("2025-01-31").success).toBe(true);
		expect(MeasurementDateSchema.safeParse("2025-1-31").success).toBe(false);
		expect(
			MeasurementDateSchema.safeParse("2025-01-31T00:00:00Z").success,
		).toBe(false);
	});

	it("keeps explicit nulls and drops undefined fields in the payload", () => {
		const parsed = BodyMeasurementFieldsSchema.parse({
			weight_kg: 80.5,
			waist: null,
		});
		expect(toBodyMeasurementPayload(parsed)).toEqual({
			weight_kg: 80.5,
			waist: null,
		});
	});

	it("rejects out-of-range values", () => {
		expect(
			BodyMeasurementFieldsSchema.safeParse({ fat_percent: 120 }).success,
		).toBe(false);
		expect(
			BodyMeasurementFieldsSchema.safeParse({ weight_kg: -1 }).success,
		).toBe(false);
	});

	it("summarises recorded values with units", () => {
		expect(
			summarizeMeasurement({
				date: "2025-01-01",
				weight_kg: 80,
				fat_percent: 18.5,
				waist: 82,
				hips: null,
			}),
		).toBe("weight: 80 kg, fat percent: 18.5 %, waist: 82 cm");
		expect(summarizeMeasurement({ date: "2025-01-01" })).toBe(
			"no values recorded",
		);
	});
});

describe("HevyClient body measurement and profile endpoints", () => {
	let client: HevyClient;

	beforeEach(() => {
		vi.clearAllMocks();
		client = new HevyClient({ apiKey: "test-api-key" });
	});

	function lastCall() {
		const [url, init] = (global.fetch as any).mock.calls.at(-1);
		return { url: url as string, init: init as RequestInit };
	}

	it("gets user info", async () => {
		mockFetchSuccess({ data: { username: "jhon", weight_unit: "kg" } });
		const result = await client.getUserInfo();
		expect(result.data.username).toBe("jhon");
		expect(lastCall().url).toBe("https://api.hevyapp.com/v1/user/info");
	});

	it("lists body measurements with pagination", async () => {
		mockFetchSuccess({ page: 2, page_count: 3, body_measurements: [] });
		await client.getBodyMeasurements({ page: 2, pageSize: 10 });
		expect(lastCall().url).toBe(
			"https://api.hevyapp.com/v1/body_measurements?page=2&pageSize=10",
		);
	});

	it("gets one measurement by date", async () => {
		mockFetchSuccess({ date: "2025-01-02", weight_kg: 80 });
		const result = await client.getBodyMeasurement("2025-01-02");
		expect(result.weight_kg).toBe(80);
		expect(lastCall().url).toBe(
			"https://api.hevyapp.com/v1/body_measurements/2025-01-02",
		);
	});

	it("creates a measurement with POST", async () => {
		mockFetchSuccess("", 201);
		await client.createBodyMeasurement({ date: "2025-01-02", weight_kg: 80 });
		const { url, init } = lastCall();
		expect(url).toBe("https://api.hevyapp.com/v1/body_measurements");
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toEqual({
			date: "2025-01-02",
			weight_kg: 80,
		});
	});

	it("updates a measurement with PUT", async () => {
		mockFetchSuccess({});
		await client.updateBodyMeasurement("2025-01-02", {
			weight_kg: 81,
			waist: null,
		});
		const { url, init } = lastCall();
		expect(url).toBe("https://api.hevyapp.com/v1/body_measurements/2025-01-02");
		expect(init.method).toBe("PUT");
		expect(JSON.parse(init.body as string)).toEqual({
			weight_kg: 81,
			waist: null,
		});
	});
});
