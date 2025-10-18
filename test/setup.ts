import { beforeEach, vi } from 'vitest';

// Mock fetch globally for all tests
global.fetch = vi.fn();

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Helper to mock a successful fetch response
 */
export function mockFetchSuccess(data: any, status = 200) {
  (global.fetch as any).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => data,
  });
}

/**
 * Helper to mock a failed fetch response
 */
export function mockFetchError(status: number, message: string, data?: any) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  (global.fetch as any).mockResolvedValueOnce({
    ok: false,
    status,
    statusText: message,
    headers: {
      get: (key: string) => headers.get(key),
    },
    json: async () => data || { error: message },
  });
}

/**
 * Helper to create a mock environment object
 */
export function createMockEnv(apiKey = 'test-api-key'): any {
  return {
    HEVY_API_KEY: apiKey,
  };
}
