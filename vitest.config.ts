import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    /**
     * THE DEFAULT 5s IS A CPU BUDGET, NOT A CORRECTNESS BUDGET.
     *
     * Five jsdom tests have now failed for the same reason and none of them
     * was wrong: rendering a component tree and driving `user-event` through
     * it takes longer than five seconds when the dev server is also running,
     * so the suite was green with the server stopped and red with it up. A
     * test that fails depending on what else is on the machine is a test
     * nobody can read a launch verdict from.
     *
     * 20s is still nowhere near «hung» — a genuinely stuck test fails, just
     * later. What it buys is that «no failing tests» means something.
     */
    testTimeout: 20_000,
  },
});
