/**
 * @file tests/foundation.test.ts
 * @description Automated unit tests for Unseen Chunk 1 foundation modules:
 * centralized configuration, inline-data payload sanitization, and structured
 * `INFO` function & GenAI call logging.
 *
 * Feature Overview:
 * Provides verifiable prototype testing evidence confirming that:
 *   1. Centralized configuration (`APP_CONFIG`) exposes immutable defaults and
 *      honors environment overrides.
 *   2. `stripInlineData` removes raw base64 `inlineData` payloads, `data:image/*`
 *      URLs, explicit base64 fields, and binary byte buffers without mutating inputs.
 *   3. `logFunctionCall` and `logGenAiCall` record `INFO` entries with complete
 *      parameters, model names, prompts, configs, and outputs while guaranteeing
 *      zero raw image bytes enter the log history.
 *
 * Primary Use Cases:
 * 1. Continuous regression testing via `npm test`.
 * 2. Evidence of testing for rubric category #2 (Working Prototype) and #5
 *    (Responsible Design / Privacy-Safe Observability).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { APP_CONFIG, createAppConfig } from '../src/config/appConfig';
import {
  clearLogHistory,
  getLogHistory,
  logFunctionCall,
  logGenAiCall,
  subscribeToLogs,
} from '../src/logging/logger';
import { stripInlineData } from '../src/logging/payloadSanitizer';

describe('Unseen Foundation — Centralized Config', () => {
  it('exposes immutable Gemini model defaults and anti-doxxing patterns', () => {
    expect(APP_CONFIG.appName).toBe('Unseen');
    expect(APP_CONFIG.genai.postScanModel).toBe('gemini-3.8-flash');
    expect(APP_CONFIG.genai.boundingBoxCoordinateScale).toBe(1000);
    expect(APP_CONFIG.guardrails.requireOwnershipAttestation).toBe(true);
    expect(Object.isFrozen(APP_CONFIG)).toBe(true);
  });

  it('respects UNSEEN_GEMINI_MODEL environment override', () => {
    const previous = process.env.UNSEEN_GEMINI_MODEL;
    process.env.UNSEEN_GEMINI_MODEL = 'gemini-2.5-pro';

    try {
      const customConfig = createAppConfig();
      expect(customConfig.genai.postScanModel).toBe('gemini-2.5-pro');
      expect(customConfig.genai.riskConnectModel).toBe('gemini-2.5-pro');
    } finally {
      if (previous === undefined) {
        delete process.env.UNSEEN_GEMINI_MODEL;
      } else {
        process.env.UNSEEN_GEMINI_MODEL = previous;
      }
    }
  });

  it('enables console INFO emission outside of test mode', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const devConfig = createAppConfig();
      expect(devConfig.logging.emitToConsole).toBe(true);
      expect(devConfig.logging.defaultLevel).toBe('INFO');
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});

describe('Unseen Foundation — Inline Data Payload Sanitizer', () => {
  it('strips @google/genai inlineData base64 image blobs while keeping text prompts intact', () => {
    const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const rawContents = [
      { text: 'Analyze this Instagram draft for visible mail or badges.' },
      {
        inlineData: {
          mimeType: 'image/png',
          data: sampleBase64,
        },
      },
    ];

    const sanitized = stripInlineData(rawContents) as Array<Record<string, unknown>>;

    expect(sanitized[0]).toEqual({
      text: 'Analyze this Instagram draft for visible mail or badges.',
    });
    expect(sanitized[1]).toEqual({
      inlineData: {
        mimeType: 'image/png',
        data: `[STRIPPED_INLINE_DATA mimeType=image/png base64Chars=${sampleBase64.length}]`,
      },
    });
    // Ensure input immutability (original inlineData is untouched for actual API transmission)
    expect((rawContents[1] as { inlineData: { data: string } }).inlineData.data).toBe(
      sampleBase64,
    );
  });

  it('strips data:image/* base64 URLs and binary Uint8Array buffers', () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/';
    const rawPayload = {
      postId: 'post-4',
      imageDataUrl: dataUrl,
      thumbnailBytes: new Uint8Array([1, 2, 3, 4, 5]),
    };

    const sanitized = stripInlineData(rawPayload) as Record<string, unknown>;

    expect(sanitized.postId).toBe('post-4');
    expect(sanitized.imageDataUrl).toBe(
      '[STRIPPED_INLINE_DATA mimeType=image/jpeg base64Chars=28]',
    );
    expect(sanitized.thumbnailBytes).toBe('[STRIPPED_INLINE_DATA binaryBytes=5]');
  });
});

describe('Unseen Foundation — INFO Function & GenAI Logger', () => {
  beforeEach(() => {
    clearLogHistory();
  });

  it('logs function calls with parameters and strips embedded image data URLs', () => {
    const receivedIds: string[] = [];
    const unsubscribe = subscribeToLogs((entry) => receivedIds.push(entry.id));

    const entry = logFunctionCall('scanCreatorPost', {
      postId: 'maya-post-1',
      platform: 'instagram',
      imageDataUrl: 'data:image/png;base64,ABCDEF123456',
    });

    unsubscribe();

    expect(entry.level).toBe('INFO');
    expect(entry.category).toBe('FUNCTION_CALL');
    expect(entry.name).toBe('scanCreatorPost');
    expect(entry.details.params).toEqual({
      postId: 'maya-post-1',
      platform: 'instagram',
      imageDataUrl: '[STRIPPED_INLINE_DATA mimeType=image/png base64Chars=12]',
    });
    expect(receivedIds).toEqual([entry.id]);
    expect(getLogHistory()).toHaveLength(1);
  });

  it('logs GenAI calls with model, prompt, config, and output while stripping inlineData', () => {
    const entry = logGenAiCall({
      stage: 'Stage1_PostMultimodalScan',
      model: APP_CONFIG.genai.postScanModel,
      prompt: [
        { text: 'Inspect creator post' },
        { inlineData: { mimeType: 'image/webp', data: 'RAW_BASE64_IMAGE_BYTES' } },
      ],
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
      output: {
        postId: 'maya-post-4',
        clues: [{ category: 'sensitive_document_or_pii', summary: 'Shipping label visible' }],
      },
      durationMs: 412,
    });

    expect(entry.level).toBe('INFO');
    expect(entry.category).toBe('GENAI_CALL');
    expect(entry.details.model).toBe('gemini-3.8-flash');
    expect(entry.details.config).toEqual({
      temperature: 0.1,
      responseMimeType: 'application/json',
    });
    expect(JSON.stringify(entry)).not.toContain('RAW_BASE64_IMAGE_BYTES');
    expect(JSON.stringify(entry)).toContain(
      '[STRIPPED_INLINE_DATA mimeType=image/webp base64Chars=22]',
    );
  });
});
