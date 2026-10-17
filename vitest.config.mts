import { defineConfig } from 'vitest/config';

// Unit tests for pure logic only (plans, totals, formats, e-mail templates).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
    environment: 'node',
  },
});
