# Testing Guide - Data Cleaning & Best Practices

## Data Cleaning Behavior (v2.2.0+)

The MCP server now gracefully handles common scenarios when updating workouts and routines.

### 1. Empty Notes

**Problem:** The Hevy API rejects empty string notes with `"workout.exercises[0].notes" is not allowed to be empty`

**Solution:** The transform functions now automatically:
- Convert empty strings (`""`) to `undefined`
- Remove `undefined` values from the API request
- This allows you to safely pass empty notes without errors

**Example:**
```typescript
// This will work - empty notes are removed
{
  "title": "My Workout",
  "exercises": [{
    "exercise_template_id": "123",
    "notes": "",  // ✅ Automatically removed
    "sets": [...]
  }]
}
```

### 2. Extra Fields from GET Responses

**Problem:** When you GET a workout/routine and send it back with minor changes, the response contains fields like `index`, `id`, etc. that the API doesn't accept in PUT/POST requests.

**Solution:** The transform functions strip these fields automatically:
- `index` fields are ignored (order is determined by array position)
- `id` fields are ignored (provided in URL path)
- Other read-only fields are ignored

**Example:**
```typescript
// You can send back what you got with modifications
const workout = await get_workout("workout-123");

// Add a note to the first exercise
workout.exercises[0].notes = "Felt strong today!";

// This will work - index and id fields are automatically stripped
await update_workout("workout-123", workout);
```

### 3. Null vs Undefined Handling

**Solution:** The transform functions normalize null/undefined:
- `null` → `undefined` → removed from request
- Empty strings → `undefined` → removed from request
- This keeps requests clean and minimal

## Best Practices for Users

### Creating/Updating Workouts

```typescript
// Minimal example - only required fields
{
  "title": "Morning Push",
  "start_time": "2024-01-15T08:00:00Z",
  "end_time": "2024-01-15T09:00:00Z",
  "is_private": false,
  "exercises": [{
    "title": "Bench Press",
    "exercise_template_id": "abc-123",
    "sets": [{
      "type": "normal",
      "weight_kg": 100,
      "reps": 10
    }]
  }]
}

// You can include empty/null fields - they'll be cleaned
{
  "title": "Morning Push",
  "description": "",  // ✅ Will be removed
  "routine_id": null,  // ✅ Will be removed
  "exercises": [{
    "notes": "",  // ✅ Will be removed
    "superset_id": null,  // ✅ Will be removed
    // ...
  }]
}
```

### Update Workflow (GET → Modify → PUT)

```typescript
// 1. Get the workout
const workout = await get_workout("workout-123");

// 2. Modify as needed (don't worry about extra fields)
workout.title = "Updated Title";
workout.exercises[0].sets[0].weight_kg = 110;

// 3. Update (transform will clean automatically)
await update_workout("workout-123", workout);
```

## Technical Details

### Transform Functions

Two helper functions handle data cleaning:

1. **`cleanValue<T>(value)`**
   - Converts `null` → `undefined`
   - Converts empty strings (`""`) → `undefined`
   - Preserves all other values

2. **`removeUndefined<T>(obj)`**
   - Removes all `undefined` values from objects
   - Creates cleaner API requests
   - Reduces payload size

### Applied to:
- ✅ `transformWorkoutToAPI()` - workouts (create/update)
- ✅ `transformRoutineToAPI()` - routines (create/update)
- ✅ All nested objects (exercises, sets, rep_range)

## Advantages of This Approach

1. **User-Friendly**: Users don't need to manually clean data
2. **Idempotent**: GET → PUT workflows "just work"
3. **Error-Free**: Prevents common API validation errors
4. **Type-Safe**: TypeScript ensures fields are valid
5. **Minimal Payloads**: Removes unnecessary fields
6. **Future-Proof**: Handles API changes gracefully

## Migration Notes

This is a **non-breaking change**:
- Existing code continues to work
- Empty/null fields are now handled automatically
- No schema changes required
- Backward compatible with all existing clients

---

# Testing Infrastructure Setup Summary

## What Was Installed

Your Hevy MCP Server now has a complete testing infrastructure using Vitest.

### Dependencies Added

```json
{
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20251011.0",
    "@vitest/ui": "^3.2.4",
    "vitest": "^3.2.4"
  }
}
```

### Files Created

```
test/
├── README.md                    # Complete testing guide
├── setup.ts                     # Global test configuration & mock utilities
├── lib/
│   └── client.test.ts          # HevyClient tests (16 tests ✅)
├── fixtures/
│   └── workouts.ts             # Test data fixtures
└── tools/
    └── (ready for MCP tool tests)

vitest.config.ts                 # Vitest configuration
TESTING.md                       # This file
```

## Current Test Coverage

✅ **16 tests passing** for `HevyClient`:

### Constructor Tests (3)
- ✅ Creates client with API key
- ✅ Uses default base URL
- ✅ Uses custom base URL

### GET Endpoints (9)
- ✅ Fetches workouts with pagination
- ✅ Fetches single workout by ID
- ✅ Includes correct headers
- ✅ Handles API errors
- ✅ Fetches workout count
- ✅ Fetches routines
- ✅ Fetches exercise templates

### POST Endpoints (2)
- ✅ Creates new workout
- ✅ Handles validation errors

### PUT Endpoints (1)
- ✅ Updates existing workout

### Error Handling (1)
- ✅ HevyApiError class works correctly

## How to Run Tests

```bash
# Run tests once
npm test

# Watch mode (auto-rerun on changes)
npm run test:watch

# UI mode (browser interface)
npm run test:ui

# Coverage report
npm run test:coverage

# CI mode (single run)
npm run test:run
```

## Quick Start: Adding Your First Test

Let's say you want to add tests for a new `deleteWorkout` endpoint:

### Step 1: Write the Test First (🔴 Red)

```typescript
// test/lib/client.test.ts

describe('deleteWorkout', () => {
  it('should delete workout by ID', async () => {
    mockFetchSuccess({ success: true }, 204);

    await client.deleteWorkout('workout-123');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.hevyapp.com/v1/workouts/workout-123',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
```

Run: `npm test` → ❌ Test fails (method doesn't exist)

### Step 2: Implement the Code (🟢 Green)

```typescript
// src/lib/client.ts

async deleteWorkout(workoutId: string): Promise<void> {
  return this.request<void>(`/v1/workouts/${workoutId}`, {
    method: 'DELETE'
  });
}
```

Run: `npm test` → ✅ Test passes!

### Step 3: Refactor (🔵 Refactor)

Clean up if needed, tests will ensure nothing breaks.

## Mock Utilities

Three helper functions are available in every test:

```typescript
import { mockFetchSuccess, mockFetchError, createMockEnv } from '../setup';

// Mock successful API response
mockFetchSuccess({ id: '123', title: 'Test' }, 200);

// Mock error response
mockFetchError(404, 'Not Found', { error: 'Resource not found' });

// Create mock Cloudflare environment
const env = createMockEnv('test-api-key');
```

## Test Fixtures

Reusable test data is available in `test/fixtures/`:

```typescript
import { mockWorkout, mockWorkoutsList } from '../fixtures/workouts';

// Use in tests
mockFetchSuccess(mockWorkout);
```

## Next Steps

### For Your Existing Code

1. **Add more client tests** for remaining methods:
   - `getRoutine()`
   - `createRoutine()`
   - `updateRoutine()`
   - `getExerciseTemplates()`
   - `createExerciseTemplate()`
   - etc.

2. **Add MCP tool tests** (requires Cloudflare Workers environment setup)

3. **Set up CI/CD** to run tests automatically:
   ```yaml
   # .github/workflows/test.yml
   - run: npm test -- --run
   ```

### For New Features (TDD Approach)

1. ✍️ Write test first (describe what you want)
2. ❌ Run test (should fail)
3. ✅ Write code to make it pass
4. ♻️ Refactor
5. 🔁 Repeat

## Testing Best Practices

1. **Test behavior, not implementation**
   - Focus on inputs and outputs
   - Don't test private methods

2. **Keep tests isolated**
   - Each test should be independent
   - Use `beforeEach` to reset state

3. **Use descriptive names**
   ```typescript
   // ✅ Good
   it('should return 404 when workout not found')

   // ❌ Bad
   it('test error')
   ```

4. **Test edge cases**
   - Empty data
   - Null/undefined
   - Error conditions
   - Boundary values

5. **Mock external dependencies**
   - Never hit real API
   - Use provided mock helpers

## Example TDD Workflow

Let's implement the `update_routine` endpoint using TDD:

```bash
# 1. Write test
vim test/lib/client.test.ts
# Add: describe('updateRoutine', () => { ... })

# 2. Run test (should fail)
npm test
# ❌ FAIL: updateRoutine is not defined

# 3. Implement method
vim src/lib/client.ts
# Add: async updateRoutine(id, data) { ... }

# 4. Run test again (should pass)
npm test
# ✅ PASS: All tests passing

# 5. Register MCP tool
vim src/index.ts
# Add: this.server.tool('update_routine', ...)

# 6. Deploy
npm run deploy
```

## Resources

- 📖 [Test README](./test/README.md) - Detailed testing guide
- 🧪 [Vitest Docs](https://vitest.dev/) - Testing framework
- 🎯 [TDD Guide](https://martinfowler.com/articles/practical-test-pyramid.html) - Best practices
- 🔧 [Mock Utilities](./test/setup.ts) - Helper functions

## Results

```bash
$ npm test

 ✓ test/lib/client.test.ts (16 tests) 15ms

 Test Files  1 passed (1)
      Tests  16 passed (16)
   Duration  284ms
```

Your testing infrastructure is ready! 🎉

Start adding tests for your existing code or use TDD for new features.
