/**
 * Real-browser test configuration via @vitest/browser + Playwright.
 *
 * Run: npm run test:browser
 *
 * Uses Chromium by default. Tests under `tests/browser/` (and any explicitly
 * picked up here) execute in a real browser context — catching streaming /
 * Body-mixing / CORS quirks that happy-dom misses.
 *
 * NOT run as part of the default `npm test` because Playwright pulls a
 * ~150 MB binary; CI-only via `.github/workflows/browser.yml` (which is
 * itself opt-in via workflow_dispatch).
 */

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/browser/**/*.test.ts'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
