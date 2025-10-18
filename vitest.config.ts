import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'test/**',
        'dist/**',
        '**/*.config.ts',
        '**/*.d.ts',
      ],
    },
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
