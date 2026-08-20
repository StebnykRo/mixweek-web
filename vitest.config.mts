import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * docs/14-qa.md §1 — two suites.
 *
 * `unit` is pure logic and runs anywhere. `integration` talks to a real
 * Postgres, because the guarantees it checks — RLS, transactional capacity,
 * partial unique indexes — only exist in the database.
 */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.spec.ts'],
          environment: 'node',
          setupFiles: ['tests/setup-unit.ts'],
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.spec.ts'],
          environment: 'node',
          setupFiles: ['tests/setup-integration.ts'],
          // One shared database: running these in parallel would make the
          // concurrency assertions meaningless.
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/app/**', 'src/components/**', 'src/messages/**', 'src/worker/**'],
    },
  },
});
