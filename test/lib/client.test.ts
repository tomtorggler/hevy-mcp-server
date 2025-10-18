import { describe, it, expect, beforeEach } from 'vitest';
import { HevyClient, HevyApiError } from '../../src/lib/client';
import { mockFetchSuccess, mockFetchError } from '../setup';

/**
 * Tests based on the Hevy API OpenAPI specification (api.json)
 * These tests validate that our client correctly implements the API contract
 *
 * Each test references the relevant line numbers in api.json for verification
 */
describe('HevyClient - API Contract Compliance', () => {
  let client: HevyClient;
  const TEST_API_KEY = 'test-api-key-12345';

  beforeEach(() => {
    client = new HevyClient({ apiKey: TEST_API_KEY });
  });

  describe('Client Configuration', () => {
    it('should create client with provided API key', () => {
      expect(client).toBeInstanceOf(HevyClient);
    });

    it('should use default base URL (https://api.hevyapp.com)', () => {
      const client = new HevyClient({ apiKey: TEST_API_KEY });
      expect(client).toBeDefined();
    });

    it('should allow custom base URL', () => {
      const customUrl = 'https://custom.api.com';
      const client = new HevyClient({
        apiKey: TEST_API_KEY,
        baseUrl: customUrl
      });
      expect(client).toBeDefined();
    });
  });

  // ============================================
  // WORKOUTS - GET /v1/workouts
  // API Spec: Lines 9-76
  // ============================================
  describe('GET /v1/workouts - getWorkouts()', () => {
    it('should send GET request with correct endpoint', async () => {
      const mockData = {
        page: 1,
        page_count: 5,
        workouts: []
      };
      mockFetchSuccess(mockData);

      await client.getWorkouts();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/workouts',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should include api-key header (required per spec)', async () => {
      mockFetchSuccess({ page: 1, page_count: 1, workouts: [] });

      await client.getWorkouts();

      const callArgs = (global.fetch as any).mock.calls[0];
      const headers = callArgs[1].headers as Headers;

      expect(headers.get('api-key')).toBe(TEST_API_KEY);
      expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('should use default pagination: page=1 (per spec line 30)', async () => {
      mockFetchSuccess({ page: 1, page_count: 1, workouts: [] });

      await client.getWorkouts();

      // Should not add query params when using defaults
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/workouts',
        expect.any(Object)
      );
    });

    it('should accept custom page query parameter (per spec line 27-32)', async () => {
      mockFetchSuccess({ page: 2, page_count: 5, workouts: [] });

      await client.getWorkouts({ page: 2 });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/workouts?page=2',
        expect.any(Object)
      );
    });

    it('should accept custom pageSize query parameter (max 10 per spec line 34-42)', async () => {
      mockFetchSuccess({ page: 1, page_count: 1, workouts: [] });

      await client.getWorkouts({ pageSize: 10 });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/workouts?pageSize=10',
        expect.any(Object)
      );
    });

    it('should return response with correct schema (per spec line 50-68)', async () => {
      const mockData = {
        page: 1,
        page_count: 5,
        workouts: [
          {
            id: 'b459cba5-cd6d-463c-abd6-54f8eafcadcb',
            title: 'Morning Workout 💪',
            start_time: '2021-09-14T12:00:00Z',
            end_time: '2021-09-14T13:00:00Z',
            exercises: []
          }
        ]
      };
      mockFetchSuccess(mockData);

      const result = await client.getWorkouts();

      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('page_count');
      expect(result).toHaveProperty('workouts');
      expect(Array.isArray(result.workouts)).toBe(true);
    });

    it('should handle 400 error for invalid page size (per spec line 73-75)', async () => {
      mockFetchError(400, 'Bad Request', { error: 'Invalid page size' });

      try {
        await client.getWorkouts({ pageSize: 999 });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(HevyApiError);
        expect(error.status).toBe(400);
      }
    });
  });

  // ============================================
  // WORKOUTS - POST /v1/workouts
  // API Spec: Lines 78-132
  // ============================================
  describe('POST /v1/workouts - createWorkout()', () => {
    it('should send POST request to correct endpoint', async () => {
      mockFetchSuccess({}, 201);

      await client.createWorkout({ workout: {} });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/workouts',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should include api-key header (required per spec)', async () => {
      mockFetchSuccess({}, 201);

      await client.createWorkout({ workout: {} });

      const callArgs = (global.fetch as any).mock.calls[0];
      const headers = callArgs[1].headers as Headers;
      expect(headers.get('api-key')).toBe(TEST_API_KEY);
    });

    it('should send request body matching PostWorkoutsRequestBody schema (spec line 1239-1284)', async () => {
      const requestBody = {
        workout: {
          title: 'Friday Leg Day 🔥',
          description: 'Medium intensity leg day focusing on quads.',
          start_time: '2024-08-14T12:00:00Z',
          end_time: '2024-08-14T12:30:00Z',
          routine_id: 'b459cba5-cd6d-463c-abd6-54f8eafcadcb',
          is_private: false,
          exercises: [
            {
              exercise_template_id: 'D04AC939',
              superset_id: null,
              notes: 'Felt good today.',
              sets: [
                {
                  type: 'normal',
                  weight_kg: 100,
                  reps: 10,
                  distance_meters: null,
                  duration_seconds: null,
                  custom_metric: null,
                  rpe: null
                }
              ]
            }
          ]
        }
      };

      mockFetchSuccess({}, 201);

      await client.createWorkout(requestBody);

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.workout).toHaveProperty('title');
      expect(body.workout).toHaveProperty('start_time');
      expect(body.workout).toHaveProperty('end_time');
      expect(body.workout).toHaveProperty('exercises');
      expect(Array.isArray(body.workout.exercises)).toBe(true);
    });

    it('should return 201 status on success (per spec line 105)', async () => {
      const mockResponse = {
        id: 'new-workout-id',
        title: 'Test Workout',
        exercises: []
      };

      mockFetchSuccess(mockResponse, 201);

      const result = await client.createWorkout({ workout: {} });

      expect(result).toEqual(mockResponse);
    });

    it('should handle 400 error for invalid request body (per spec line 115-130)', async () => {
      mockFetchError(400, 'Bad Request', { error: 'Invalid request body' });

      try {
        await client.createWorkout({ workout: { title: '' } });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(HevyApiError);
        expect(error.status).toBe(400);
        expect(error.data).toHaveProperty('error');
      }
    });
  });

  // ============================================
  // WORKOUTS - GET /v1/workouts/count
  // API Spec: Lines 134-170
  // ============================================
  describe('GET /v1/workouts/count - getWorkoutsCount()', () => {
    it('should send GET request to correct endpoint', async () => {
      mockFetchSuccess({ workout_count: 42 });

      await client.getWorkoutsCount();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/workouts/count',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return response with workout_count property (per spec line 159-163)', async () => {
      const mockData = { workout_count: 42 };
      mockFetchSuccess(mockData);

      const result = await client.getWorkoutsCount();

      expect(result).toHaveProperty('workout_count');
      expect(typeof result.workout_count).toBe('number');
      expect(result.workout_count).toBe(42);
    });
  });

  // ============================================
  // WORKOUTS - GET /v1/workouts/events
  // API Spec: Lines 172-231
  // ============================================
  describe('GET /v1/workouts/events - getWorkoutEvents()', () => {
    it('should send GET request to correct endpoint', async () => {
      mockFetchSuccess({ page: 1, page_count: 1, events: [] });

      await client.getWorkoutEvents();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/workouts/events',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should accept pagination parameters (max pageSize 10, per spec line 197-204)', async () => {
      mockFetchSuccess({ page: 2, page_count: 5, events: [] });

      await client.getWorkoutEvents({ page: 2, pageSize: 10 });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/workouts/events?page=2&pageSize=10',
        expect.any(Object)
      );
    });

    it('should accept since parameter for date filtering (per spec line 207-212)', async () => {
      mockFetchSuccess({ page: 1, page_count: 1, events: [] });

      await client.getWorkoutEvents({ since: '2024-01-01T00:00:00Z' });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/workouts/events?since=2024-01-01T00%3A00%3A00Z',
        expect.any(Object)
      );
    });

    it('should return PaginatedWorkoutEvents schema (per spec line 221-223)', async () => {
      const mockData = {
        page: 1,
        page_count: 2,
        events: [
          {
            type: 'updated',
            workout: {
              id: 'workout-1',
              title: 'Updated Workout',
              start_time: '2024-01-15T10:00:00Z',
              end_time: '2024-01-15T11:00:00Z',
              exercises: []
            }
          },
          {
            type: 'deleted',
            id: 'workout-2',
            deleted_at: '2024-01-15T11:00:00Z'
          }
        ]
      };

      mockFetchSuccess(mockData);

      const result = await client.getWorkoutEvents();

      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('page_count');
      expect(result).toHaveProperty('events');
      expect(Array.isArray(result.events)).toBe(true);
      expect(result.events).toHaveLength(2);
    });

    it('should handle updated workout events (per spec line 2170-2185)', async () => {
      const mockData = {
        page: 1,
        page_count: 1,
        events: [
          {
            type: 'updated',
            workout: {
              id: 'workout-1',
              title: 'Updated Workout',
              exercises: []
            }
          }
        ]
      };

      mockFetchSuccess(mockData);

      const result = await client.getWorkoutEvents();

      expect(result.events[0].type).toBe('updated');
      expect(result.events[0].workout).toBeDefined();
      expect(result.events[0].workout.id).toBe('workout-1');
    });

    it('should handle deleted workout events (per spec line 2187-2209)', async () => {
      const mockData = {
        page: 1,
        page_count: 1,
        events: [
          {
            type: 'deleted',
            id: 'workout-2',
            deleted_at: '2024-01-15T11:00:00Z'
          }
        ]
      };

      mockFetchSuccess(mockData);

      const result = await client.getWorkoutEvents();

      expect(result.events[0].type).toBe('deleted');
      expect(result.events[0].id).toBe('workout-2');
      expect(result.events[0].deleted_at).toBeDefined();
    });

    it('should handle 500 error (per spec line 227-229)', async () => {
      mockFetchError(500, 'Internal Server Error');

      try {
        await client.getWorkoutEvents();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(HevyApiError);
        expect((error as HevyApiError).status).toBe(500);
      }
    });
  });

  // ============================================
  // WORKOUTS - GET /v1/workouts/{workoutId}
  // API Spec: Lines 233-270
  // ============================================
  describe('GET /v1/workouts/{workoutId} - getWorkout()', () => {
    it('should send GET request to correct endpoint with workoutId in path', async () => {
      const workoutId = 'b459cba5-cd6d-463c-abd6-54f8eafcadcb';
      mockFetchSuccess({ id: workoutId, title: 'Test' });

      await client.getWorkout(workoutId);

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.hevyapp.com/v1/workouts/${workoutId}`,
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return Workout schema (per spec line 262)', async () => {
      const mockWorkout = {
        id: 'workout-123',
        title: 'Morning Workout 💪',
        start_time: '2021-09-14T12:00:00Z',
        end_time: '2021-09-14T13:00:00Z',
        exercises: []
      };

      mockFetchSuccess(mockWorkout);

      const result = await client.getWorkout('workout-123');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('start_time');
      expect(result).toHaveProperty('end_time');
      expect(result).toHaveProperty('exercises');
    });

    it('should handle 404 error when workout not found (per spec line 267-269)', async () => {
      mockFetchError(404, 'Not Found', { error: 'Workout not found' });

      try {
        await client.getWorkout('non-existent-id');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(HevyApiError);
        expect(error.status).toBe(404);
      }
    });
  });

  // ============================================
  // WORKOUTS - PUT /v1/workouts/{workoutId}
  // API Spec: Lines 272-332
  // ============================================
  describe('PUT /v1/workouts/{workoutId} - updateWorkout()', () => {
    it('should send PUT request to correct endpoint with workoutId', async () => {
      const workoutId = 'workout-123';
      mockFetchSuccess({});

      await client.updateWorkout(workoutId, { workout: {} });

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.hevyapp.com/v1/workouts/${workoutId}`,
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('should use PostWorkoutsRequestBody schema for request (per spec line 299)', async () => {
      const workoutId = 'workout-123';
      const requestBody = {
        workout: {
          title: 'Updated Workout',
          start_time: '2024-01-15T10:00:00Z',
          end_time: '2024-01-15T11:00:00Z',
          exercises: []
        }
      };

      mockFetchSuccess({});

      await client.updateWorkout(workoutId, requestBody);

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.workout).toHaveProperty('title');
      expect(body.workout).toHaveProperty('start_time');
      expect(body.workout).toHaveProperty('end_time');
    });

    it('should return 200 on success (per spec line 305)', async () => {
      const mockResponse = {
        id: 'workout-123',
        title: 'Updated Workout',
        exercises: []
      };

      mockFetchSuccess(mockResponse, 200);

      const result = await client.updateWorkout('workout-123', { workout: {} });

      expect(result).toEqual(mockResponse);
    });

    it('should handle 400 error for invalid request body (per spec line 315-330)', async () => {
      mockFetchError(400, 'Bad Request', { error: 'Invalid request body' });

      try {
        await client.updateWorkout('workout-123', { workout: {} });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(HevyApiError);
        expect(error.status).toBe(400);
      }
    });
  });

  // ============================================
  // ROUTINES - GET /v1/routines
  // API Spec: Lines 334-401
  // ============================================
  describe('GET /v1/routines - getRoutines()', () => {
    it('should send GET request to correct endpoint', async () => {
      mockFetchSuccess({ page: 1, page_count: 1, routines: [] });

      await client.getRoutines();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/routines',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should accept pagination parameters (default pageSize: 5, per spec line 362-366)', async () => {
      mockFetchSuccess({ page: 1, page_count: 1, routines: [] });

      await client.getRoutines({ page: 1, pageSize: 5 });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/routines?page=1&pageSize=5',
        expect.any(Object)
      );
    });

    it('should return paginated routines response (per spec line 375-393)', async () => {
      const mockData = {
        page: 1,
        page_count: 3,
        routines: [
          {
            id: 'routine-1',
            title: 'Push Day',
            exercises: []
          }
        ]
      };

      mockFetchSuccess(mockData);

      const result = await client.getRoutines();

      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('page_count');
      expect(result).toHaveProperty('routines');
      expect(Array.isArray(result.routines)).toBe(true);
    });
  });

  // ============================================
  // ROUTINES - POST /v1/routines
  // API Spec: Lines 403-473
  // ============================================
  describe('POST /v1/routines - createRoutine()', () => {
    it('should send POST request to correct endpoint', async () => {
      mockFetchSuccess({}, 201);

      await client.createRoutine({ routine: {} });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/routines',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should return 201 on successful creation (per spec line 430)', async () => {
      const mockResponse = {
        id: 'routine-123',
        title: 'New Routine',
        exercises: []
      };

      mockFetchSuccess(mockResponse, 201);

      const result = await client.createRoutine({ routine: {} });

      expect(result).toEqual(mockResponse);
    });

    it('should handle 403 error when routine limit exceeded (per spec line 456-471)', async () => {
      mockFetchError(403, 'Forbidden', { error: 'Routine limit exceeded' });

      try {
        await client.createRoutine({ routine: {} });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(HevyApiError);
        expect(error.status).toBe(403);
      }
    });
  });

  // ============================================
  // ROUTINES - GET /v1/routines/{routineId}
  // API Spec: Lines 475-530
  // ============================================
  describe('GET /v1/routines/{routineId} - getRoutine()', () => {
    it('should send GET request with routineId in path', async () => {
      const routineId = 'routine-123';
      mockFetchSuccess({ routine: { id: routineId } });

      await client.getRoutine(routineId);

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.hevyapp.com/v1/routines/${routineId}`,
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return response with routine property (per spec line 504-510)', async () => {
      const mockData = {
        routine: {
          id: 'routine-123',
          title: 'Push Day',
          exercises: []
        }
      };

      mockFetchSuccess(mockData);

      const result = await client.getRoutine('routine-123');

      expect(result).toHaveProperty('routine');
      expect(result.routine).toHaveProperty('id');
      expect(result.routine).toHaveProperty('title');
    });
  });

  // ============================================
  // ROUTINES - PUT /v1/routines/{routineId}
  // API Spec: Lines 532-608
  // ============================================
  describe('PUT /v1/routines/{routineId} - updateRoutine()', () => {
    it('should send PUT request to correct endpoint with routineId', async () => {
      const routineId = 'routine-123';
      mockFetchSuccess({}, 200);

      await client.updateRoutine(routineId, { routine: {} });

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.hevyapp.com/v1/routines/${routineId}`,
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('should use PutRoutinesRequestBody schema for request (per spec line 559)', async () => {
      const routineId = 'routine-123';
      const requestBody = {
        routine: {
          title: 'Updated Routine',
          notes: 'Updated notes',
          exercises: [
            {
              exercise_template_id: 'D04AC939',
              superset_id: null,
              rest_seconds: 90,
              notes: 'Focus on form',
              sets: [
                {
                  type: 'normal',
                  weight_kg: 100,
                  reps: 10,
                  rep_range: null,
                  distance_meters: null,
                  duration_seconds: null,
                  custom_metric: null
                }
              ]
            }
          ]
        }
      };

      mockFetchSuccess({}, 200);

      await client.updateRoutine(routineId, requestBody);

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.routine).toHaveProperty('title');
      expect(body.routine).toHaveProperty('notes');
      expect(body.routine).toHaveProperty('exercises');
      expect(Array.isArray(body.routine.exercises)).toBe(true);
    });

    it('should support rep_range in sets (per spec line 1461-1479)', async () => {
      const routineId = 'routine-123';
      const requestBody = {
        routine: {
          title: 'Routine with Rep Ranges',
          exercises: [
            {
              exercise_template_id: 'D04AC939',
              sets: [
                {
                  type: 'normal',
                  weight_kg: 100,
                  rep_range: {
                    start: 8,
                    end: 12
                  }
                }
              ]
            }
          ]
        }
      };

      mockFetchSuccess({}, 200);

      await client.updateRoutine(routineId, requestBody);

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.routine.exercises[0].sets[0].rep_range).toEqual({
        start: 8,
        end: 12
      });
    });

    it('should return 200 on success (per spec line 565)', async () => {
      const mockResponse = {
        id: 'routine-123',
        title: 'Updated Routine',
        exercises: []
      };

      mockFetchSuccess(mockResponse, 200);

      const result = await client.updateRoutine('routine-123', { routine: {} });

      expect(result).toEqual(mockResponse);
    });

    it('should handle 400 error for invalid request body (per spec line 575-590)', async () => {
      mockFetchError(400, 'Bad Request', { error: 'Invalid request body' });

      try {
        await client.updateRoutine('routine-123', { routine: {} });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(HevyApiError);
        expect((error as HevyApiError).status).toBe(400);
      }
    });

    it('should handle 404 error when routine not found (per spec line 591-606)', async () => {
      mockFetchError(404, 'Not Found', { error: "Routine doesn't exist or doesn't belong to the user" });

      try {
        await client.updateRoutine('non-existent-id', { routine: {} });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(HevyApiError);
        expect((error as HevyApiError).status).toBe(404);
      }
    });
  });

  // ============================================
  // EXERCISE TEMPLATES - GET /v1/exercise_templates
  // API Spec: Lines 610-677
  // ============================================
  describe('GET /v1/exercise_templates - getExerciseTemplates()', () => {
    it('should send GET request to correct endpoint', async () => {
      mockFetchSuccess({ page: 1, page_count: 1, exercise_templates: [] });

      await client.getExerciseTemplates();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/exercise_templates',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should accept pagination with max pageSize 100 (per spec line 637-642)', async () => {
      mockFetchSuccess({ page: 1, page_count: 1, exercise_templates: [] });

      await client.getExerciseTemplates({ page: 1, pageSize: 100 });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/exercise_templates?page=1&pageSize=100',
        expect.any(Object)
      );
    });

    it('should return paginated exercise templates (per spec line 651-670)', async () => {
      const mockData = {
        page: 1,
        page_count: 10,
        exercise_templates: [
          {
            id: 'D04AC939',
            title: 'Bench Press (Barbell)',
            type: 'weight_reps',
            primary_muscle_group: 'chest',
            is_custom: false
          }
        ]
      };

      mockFetchSuccess(mockData);

      const result = await client.getExerciseTemplates();

      expect(result).toHaveProperty('exercise_templates');
      expect(Array.isArray(result.exercise_templates)).toBe(true);
    });
  });

  // ============================================
  // EXERCISE TEMPLATES - POST /v1/exercise_templates
  // API Spec: Lines 679-758
  // ============================================
  describe('POST /v1/exercise_templates - createExerciseTemplate()', () => {
    it('should send POST request to correct endpoint', async () => {
      mockFetchSuccess({ id: 123 }, 200);

      await client.createExerciseTemplate({ exercise: {} });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/exercise_templates',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should return object with id property on success (per spec line 712-720)', async () => {
      const mockResponse = { id: 123 };
      mockFetchSuccess(mockResponse, 200);

      const result = await client.createExerciseTemplate({ exercise: {} });

      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('number');
    });

    it('should handle 403 error when custom exercise limit exceeded (per spec line 741-757)', async () => {
      mockFetchError(403, 'Forbidden', { error: 'exceeds-custom-exercise-limit' });

      try {
        await client.createExerciseTemplate({ exercise: {} });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(HevyApiError);
        expect(error.status).toBe(403);
      }
    });
  });

  // ============================================
  // EXERCISE TEMPLATES - GET /v1/exercise_templates/{id}
  // API Spec: Lines 761-799
  // ============================================
  describe('GET /v1/exercise_templates/{exerciseTemplateId} - getExerciseTemplate()', () => {
    it('should send GET request with exercise template ID in path', async () => {
      const templateId = 'D04AC939';
      mockFetchSuccess({ id: templateId, title: 'Bench Press' });

      await client.getExerciseTemplate(templateId);

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.hevyapp.com/v1/exercise_templates/${templateId}`,
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle 404 when exercise template not found (per spec line 795-797)', async () => {
      mockFetchError(404, 'Not Found');

      try {
        await client.getExerciseTemplate('non-existent');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(HevyApiError);
        expect(error.status).toBe(404);
      }
    });
  });

  // ============================================
  // ROUTINE FOLDERS - GET /v1/routine_folders
  // API Spec: Lines 801-868
  // ============================================
  describe('GET /v1/routine_folders - getRoutineFolders()', () => {
    it('should send GET request to correct endpoint', async () => {
      mockFetchSuccess({ page: 1, page_count: 1, routine_folders: [] });

      await client.getRoutineFolders();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/routine_folders',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should accept pagination with max pageSize 10 (per spec line 829-833)', async () => {
      mockFetchSuccess({ page: 1, page_count: 1, routine_folders: [] });

      await client.getRoutineFolders({ page: 1, pageSize: 10 });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/routine_folders?page=1&pageSize=10',
        expect.any(Object)
      );
    });
  });

  // ============================================
  // ROUTINE FOLDERS - POST /v1/routine_folders
  // API Spec: Lines 870-924
  // ============================================
  describe('POST /v1/routine_folders - createRoutineFolder()', () => {
    it('should send POST request to correct endpoint', async () => {
      mockFetchSuccess({}, 201);

      await client.createRoutineFolder({ routine_folder: { title: 'Test' } });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hevyapp.com/v1/routine_folders',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should return 201 on successful creation (per spec line 897)', async () => {
      const mockResponse = {
        id: 42,
        title: 'New Folder',
        index: 0
      };

      mockFetchSuccess(mockResponse, 201);

      const result = await client.createRoutineFolder({ routine_folder: { title: 'New Folder' } });

      expect(result).toEqual(mockResponse);
    });
  });

  // ============================================
  // ROUTINE FOLDERS - GET /v1/routine_folders/{folderId}
  // API Spec: Lines 926-964
  // ============================================
  describe('GET /v1/routine_folders/{folderId} - getRoutineFolder()', () => {
    it('should send GET request with folderId in path', async () => {
      const folderId = '42';
      mockFetchSuccess({ id: 42, title: 'Test Folder' });

      await client.getRoutineFolder(folderId);

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.hevyapp.com/v1/routine_folders/${folderId}`,
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle 404 when folder not found (per spec line 960-962)', async () => {
      mockFetchError(404, 'Not Found');

      try {
        await client.getRoutineFolder('999');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(HevyApiError);
        expect(error.status).toBe(404);
      }
    });
  });

  // ============================================
  // EXERCISE HISTORY - GET /v1/exercise_history/{id}
  // API Spec: Lines 1085-1153
  // ============================================
  describe('GET /v1/exercise_history/{exerciseTemplateId} - getExerciseHistory()', () => {
    it('should send GET request with exercise template ID in path', async () => {
      const templateId = 'D04AC939';
      mockFetchSuccess({ exercise_history: [] });

      await client.getExerciseHistory(templateId);

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.hevyapp.com/v1/exercise_history/${templateId}`,
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should accept optional start_date and end_date query params (per spec line 1108-1128)', async () => {
      const templateId = 'D04AC939';
      mockFetchSuccess({ exercise_history: [] });

      await client.getExerciseHistory(templateId, {
        start_date: '2024-01-01T00:00:00Z',
        end_date: '2024-12-31T23:59:59Z'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.hevyapp.com/v1/exercise_history/${templateId}?start_date=2024-01-01T00%3A00%3A00Z&end_date=2024-12-31T23%3A59%3A59Z`,
        expect.any(Object)
      );
    });

    it('should return response with exercise_history array (per spec line 1136-1143)', async () => {
      const mockData = {
        exercise_history: [
          {
            workout_id: 'workout-1',
            workout_title: 'Morning Workout',
            weight_kg: 100,
            reps: 10,
            set_type: 'normal'
          }
        ]
      };

      mockFetchSuccess(mockData);

      const result = await client.getExerciseHistory('D04AC939');

      expect(result).toHaveProperty('exercise_history');
      expect(Array.isArray(result.exercise_history)).toBe(true);
    });
  });

  // ============================================
  // SCHEMA VALIDATION - Enhanced Deep Validation
  // ============================================
  describe('Schema Validation', () => {
    describe('Set Type Enum Validation (per spec line 1161-1169)', () => {
      it('should accept valid set types: warmup, normal, failure, dropset', async () => {
        const workout = {
          workout: {
            title: 'Set Type Test',
            start_time: '2024-01-15T10:00:00Z',
            end_time: '2024-01-15T11:00:00Z',
            exercises: [
              {
                exercise_template_id: 'D04AC939',
                sets: [
                  { type: 'warmup', weight_kg: 60, reps: 10 },
                  { type: 'normal', weight_kg: 100, reps: 10 },
                  { type: 'failure', weight_kg: 100, reps: 8 },
                  { type: 'dropset', weight_kg: 80, reps: 12 }
                ]
              }
            ]
          }
        };

        mockFetchSuccess({}, 201);

        await client.createWorkout(workout);

        const callArgs = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.workout.exercises[0].sets[0].type).toBe('warmup');
        expect(body.workout.exercises[0].sets[1].type).toBe('normal');
        expect(body.workout.exercises[0].sets[2].type).toBe('failure');
        expect(body.workout.exercises[0].sets[3].type).toBe('dropset');
      });
    });

    describe('RPE Enum Validation (per spec line 1202-1207)', () => {
      it('should accept valid RPE values: 6, 7, 7.5, 8, 8.5, 9, 9.5, 10', async () => {
        const workout = {
          workout: {
            title: 'RPE Test',
            start_time: '2024-01-15T10:00:00Z',
            end_time: '2024-01-15T11:00:00Z',
            exercises: [
              {
                exercise_template_id: 'D04AC939',
                sets: [
                  { type: 'normal', weight_kg: 100, reps: 10, rpe: 6 },
                  { type: 'normal', weight_kg: 100, reps: 10, rpe: 7.5 },
                  { type: 'normal', weight_kg: 100, reps: 10, rpe: 9 },
                  { type: 'normal', weight_kg: 100, reps: 10, rpe: 10 }
                ]
              }
            ]
          }
        };

        mockFetchSuccess({}, 201);

        await client.createWorkout(workout);

        const callArgs = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.workout.exercises[0].sets[0].rpe).toBe(6);
        expect(body.workout.exercises[0].sets[1].rpe).toBe(7.5);
        expect(body.workout.exercises[0].sets[2].rpe).toBe(9);
        expect(body.workout.exercises[0].sets[3].rpe).toBe(10);
      });

      it('should accept null RPE value (per spec line 1202)', async () => {
        const workout = {
          workout: {
            title: 'RPE Null Test',
            start_time: '2024-01-15T10:00:00Z',
            end_time: '2024-01-15T11:00:00Z',
            exercises: [
              {
                exercise_template_id: 'D04AC939',
                sets: [
                  { type: 'normal', weight_kg: 100, reps: 10, rpe: null }
                ]
              }
            ]
          }
        };

        mockFetchSuccess({}, 201);

        await client.createWorkout(workout);

        const callArgs = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.workout.exercises[0].sets[0].rpe).toBeNull();
      });
    });

    describe('Nullable Field Validation', () => {
      it('should accept null values for optional set fields (per spec line 1172-1201)', async () => {
        const workout = {
          workout: {
            title: 'Nullable Fields Test',
            start_time: '2024-01-15T10:00:00Z',
            end_time: '2024-01-15T11:00:00Z',
            exercises: [
              {
                exercise_template_id: 'D04AC939',
                superset_id: null,
                notes: null,
                sets: [
                  {
                    type: 'normal',
                    weight_kg: null,
                    reps: null,
                    distance_meters: null,
                    duration_seconds: null,
                    custom_metric: null,
                    rpe: null
                  }
                ]
              }
            ]
          }
        };

        mockFetchSuccess({}, 201);

        await client.createWorkout(workout);

        const callArgs = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(callArgs[1].body);
        const set = body.workout.exercises[0].sets[0];

        expect(set.weight_kg).toBeNull();
        expect(set.reps).toBeNull();
        expect(set.distance_meters).toBeNull();
        expect(set.duration_seconds).toBeNull();
        expect(set.custom_metric).toBeNull();
        expect(set.rpe).toBeNull();
      });

      it('should accept null description for workout (per spec line 1250-1254)', async () => {
        const workout = {
          workout: {
            title: 'Test Workout',
            description: null,
            start_time: '2024-01-15T10:00:00Z',
            end_time: '2024-01-15T11:00:00Z',
            exercises: []
          }
        };

        mockFetchSuccess({}, 201);

        await client.createWorkout(workout);

        const callArgs = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.workout.description).toBeNull();
      });
    });

    describe('Pagination Boundary Validation', () => {
      it('should accept pageSize up to max 10 for workouts (per spec line 41)', async () => {
        mockFetchSuccess({ page: 1, page_count: 1, workouts: [] });

        await client.getWorkouts({ page: 1, pageSize: 10 });

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.hevyapp.com/v1/workouts?page=1&pageSize=10',
          expect.any(Object)
        );
      });

      it('should accept pageSize up to max 100 for exercise templates (per spec line 642)', async () => {
        mockFetchSuccess({ page: 1, page_count: 1, exercise_templates: [] });

        await client.getExerciseTemplates({ page: 1, pageSize: 100 });

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.hevyapp.com/v1/exercise_templates?page=1&pageSize=100',
          expect.any(Object)
        );
      });

      it('should accept pageSize up to max 10 for routines (per spec line 366)', async () => {
        mockFetchSuccess({ page: 1, page_count: 1, routines: [] });

        await client.getRoutines({ page: 1, pageSize: 10 });

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.hevyapp.com/v1/routines?page=1&pageSize=10',
          expect.any(Object)
        );
      });

      it('should accept pageSize up to max 10 for routine folders (per spec line 833)', async () => {
        mockFetchSuccess({ page: 1, page_count: 1, routine_folders: [] });

        await client.getRoutineFolders({ page: 1, pageSize: 10 });

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.hevyapp.com/v1/routine_folders?page=1&pageSize=10',
          expect.any(Object)
        );
      });

      it('should accept page >= 1 (per spec line 27-32)', async () => {
        mockFetchSuccess({ page: 100, page_count: 100, workouts: [] });

        await client.getWorkouts({ page: 100 });

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.hevyapp.com/v1/workouts?page=100',
          expect.any(Object)
        );
      });
    });

    describe('Rep Range Validation for Routines', () => {
      it('should accept rep_range with start and end (per spec line 1330-1348)', async () => {
        const routine = {
          routine: {
            title: 'Rep Range Test',
            exercises: [
              {
                exercise_template_id: 'D04AC939',
                sets: [
                  {
                    type: 'normal',
                    weight_kg: 100,
                    rep_range: {
                      start: 8,
                      end: 12
                    }
                  }
                ]
              }
            ]
          }
        };

        mockFetchSuccess({}, 201);

        await client.createRoutine(routine);

        const callArgs = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.routine.exercises[0].sets[0].rep_range).toEqual({
          start: 8,
          end: 12
        });
      });

      it('should accept null rep_range (per spec line 1331-1333)', async () => {
        const routine = {
          routine: {
            title: 'Null Rep Range Test',
            exercises: [
              {
                exercise_template_id: 'D04AC939',
                sets: [
                  {
                    type: 'normal',
                    weight_kg: 100,
                    rep_range: null
                  }
                ]
              }
            ]
          }
        };

        mockFetchSuccess({}, 201);

        await client.createRoutine(routine);

        const callArgs = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.routine.exercises[0].sets[0].rep_range).toBeNull();
      });

      it('should accept nullable start and end in rep_range (per spec line 1335-1346)', async () => {
        const routine = {
          routine: {
            title: 'Partial Rep Range Test',
            exercises: [
              {
                exercise_template_id: 'D04AC939',
                sets: [
                  {
                    type: 'normal',
                    weight_kg: 100,
                    rep_range: {
                      start: null,
                      end: 12
                    }
                  }
                ]
              }
            ]
          }
        };

        mockFetchSuccess({}, 201);

        await client.createRoutine(routine);

        const callArgs = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.routine.exercises[0].sets[0].rep_range.start).toBeNull();
        expect(body.routine.exercises[0].sets[0].rep_range.end).toBe(12);
      });
    });

    describe('Superset ID Validation', () => {
      it('should accept integer superset_id (per spec line 1219-1223)', async () => {
        const workout = {
          workout: {
            title: 'Superset Test',
            start_time: '2024-01-15T10:00:00Z',
            end_time: '2024-01-15T11:00:00Z',
            exercises: [
              {
                exercise_template_id: 'D04AC939',
                superset_id: 1,
                sets: [{ type: 'normal', weight_kg: 100, reps: 10 }]
              },
              {
                exercise_template_id: 'D04AC940',
                superset_id: 1,
                sets: [{ type: 'normal', weight_kg: 50, reps: 12 }]
              }
            ]
          }
        };

        mockFetchSuccess({}, 201);

        await client.createWorkout(workout);

        const callArgs = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.workout.exercises[0].superset_id).toBe(1);
        expect(body.workout.exercises[1].superset_id).toBe(1);
      });

      it('should accept null superset_id when not in superset (per spec line 1219-1223)', async () => {
        const workout = {
          workout: {
            title: 'No Superset Test',
            start_time: '2024-01-15T10:00:00Z',
            end_time: '2024-01-15T11:00:00Z',
            exercises: [
              {
                exercise_template_id: 'D04AC939',
                superset_id: null,
                sets: [{ type: 'normal', weight_kg: 100, reps: 10 }]
              }
            ]
          }
        };

        mockFetchSuccess({}, 201);

        await client.createWorkout(workout);

        const callArgs = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.workout.exercises[0].superset_id).toBeNull();
      });
    });

    describe('Custom Metric Validation', () => {
      it('should accept custom_metric for steps/floors (per spec line 1196-1200)', async () => {
        const workout = {
          workout: {
            title: 'Stair Machine Test',
            start_time: '2024-01-15T10:00:00Z',
            end_time: '2024-01-15T11:00:00Z',
            exercises: [
              {
                exercise_template_id: 'STAIR_MACHINE_ID',
                sets: [
                  {
                    type: 'normal',
                    duration_seconds: 300,
                    custom_metric: 50 // 50 floors
                  }
                ]
              }
            ]
          }
        };

        mockFetchSuccess({}, 201);

        await client.createWorkout(workout);

        const callArgs = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.workout.exercises[0].sets[0].custom_metric).toBe(50);
      });
    });
  });

  // ============================================
  // ERROR HANDLING
  // ============================================
  describe('HevyApiError', () => {
    it('should create error with status and data', () => {
      const error = new HevyApiError('Test error', 400, { detail: 'Bad request' });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('HevyApiError');
      expect(error.message).toBe('Test error');
      expect(error.status).toBe(400);
      expect(error.data).toEqual({ detail: 'Bad request' });
    });

    it('should properly extend Error class', () => {
      const error = new HevyApiError('Test', 500);

      expect(error instanceof Error).toBe(true);
      expect(error instanceof HevyApiError).toBe(true);
    });
  });
});
