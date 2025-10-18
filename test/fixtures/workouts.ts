/**
 * Test fixtures for workout-related tests
 * Based on the Hevy API schema from api.json
 */

export const mockWorkout = {
  id: 'b459cba5-cd6d-463c-abd6-54f8eafcadcb',
  title: 'Morning Workout 💪',
  description: 'Pushed myself to the limit today!',
  routine_id: 'routine-123',
  start_time: '2024-01-15T10:00:00Z',
  end_time: '2024-01-15T11:30:00Z',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T11:30:00Z',
  exercises: [
    {
      index: 0,
      title: 'Bench Press (Barbell)',
      exercise_template_id: '05293BCA',
      superset_id: null,
      notes: 'Paid closer attention to form today. Felt great!',
      sets: [
        {
          index: 0,
          type: 'warmup',
          weight_kg: 60,
          reps: 10,
          distance_meters: null,
          duration_seconds: null,
          rpe: null,
          custom_metric: null,
        },
        {
          index: 1,
          type: 'normal',
          weight_kg: 100,
          reps: 10,
          distance_meters: null,
          duration_seconds: null,
          rpe: 8.5,
          custom_metric: null,
        },
        {
          index: 2,
          type: 'normal',
          weight_kg: 100,
          reps: 8,
          distance_meters: null,
          duration_seconds: null,
          rpe: 9,
          custom_metric: null,
        },
      ],
    },
    {
      index: 1,
      title: 'Incline Dumbbell Press',
      exercise_template_id: '05293BCB',
      superset_id: null,
      notes: null,
      sets: [
        {
          index: 0,
          type: 'normal',
          weight_kg: 30,
          reps: 12,
          distance_meters: null,
          duration_seconds: null,
          rpe: null,
          custom_metric: null,
        },
        {
          index: 1,
          type: 'normal',
          weight_kg: 30,
          reps: 10,
          distance_meters: null,
          duration_seconds: null,
          rpe: null,
          custom_metric: null,
        },
      ],
    },
  ],
};

export const mockWorkoutsList = {
  page: 1,
  page_count: 5,
  workouts: [
    {
      id: 'workout-1',
      title: 'Push Day',
      start_time: '2024-01-15T10:00:00Z',
      end_time: '2024-01-15T11:00:00Z',
      exercises: [],
    },
    {
      id: 'workout-2',
      title: 'Pull Day',
      start_time: '2024-01-16T10:00:00Z',
      end_time: '2024-01-16T11:00:00Z',
      exercises: [],
    },
    {
      id: 'workout-3',
      title: 'Leg Day',
      start_time: '2024-01-17T10:00:00Z',
      end_time: '2024-01-17T11:00:00Z',
      exercises: [],
    },
  ],
};

export const mockWorkoutEvents = {
  page: 1,
  page_count: 1,
  events: [
    {
      type: 'updated',
      workout: {
        id: 'workout-1',
        title: 'Updated Workout',
        start_time: '2024-01-15T10:00:00Z',
        end_time: '2024-01-15T11:00:00Z',
        updated_at: '2024-01-15T12:00:00Z',
        exercises: [],
      },
    },
    {
      type: 'deleted',
      id: 'workout-2',
      deleted_at: '2024-01-15T11:00:00Z',
    },
  ],
};

export const mockCreateWorkoutRequest = {
  workout: {
    title: 'Friday Leg Day 🔥',
    description: 'Medium intensity leg day focusing on quads.',
    start_time: '2024-08-14T12:00:00Z',
    end_time: '2024-08-14T12:30:00Z',
    routine_id: 'b459cba5-cd6d-463c-abd6-54f8eafcadcb',
    is_private: false,
    exercises: [
      {
        index: 0,
        title: 'Barbell Squat',
        exercise_template_id: 'D04AC939',
        superset_id: null,
        notes: 'Felt good today. Form was on point.',
        sets: [
          {
            index: 0,
            type: 'normal',
            weight_kg: 100,
            reps: 10,
            distance_meters: null,
            duration_seconds: null,
            custom_metric: null,
            rpe: null,
          },
        ],
      },
    ],
  },
};
