/**
 * @file vitest.config.ts
 * @description Centralized test runner configuration for Unseen.
 *
 * Feature Overview:
 * Configures Vitest to execute automated unit and integration suites across the
 * platform-agnostic core, logging sanitizer, anti-doxxing guardrails, and
 * 3-stage Gemini multimodal pipeline.
 *
 * Primary Use Cases:
 * 1. Continuous verification during hackathon development (`npm test`).
 * 2. Validating that `inlineData` image buffers are stripped from `INFO` logs.
 * 3. Providing reproducible testing evidence for prototype evaluation.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['verbose'],
  },
});
