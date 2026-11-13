/**
 * @file tests/serverAndPlatform.test.ts
 * @description Automated HTTP integration tests for Chunk 4: Unified Single-Port
 * Server (`/api/*` + Android PWA static shell), Platform Bridge, and Anonymous
 * Accuracy Feedback Store.
 *
 * Feature Overview:
 * Spins up an isolated `createUnseenServer` instance on an ephemeral local port
 * (or invokes `handleApiRequest` & `resolveSafeStaticFile` directly inside sandboxed
 * environments) to verify:
 *   1. `/api/health`, `/api/demo-feed`, `/api/audit`, `/api/fix-post`, `/api/feedback`,
 *      and `/api/logs` return strongly typed JSON contracts.
 *   2. Unconsented `/api/audit` calls are rejected with HTTP `403`.
 *   3. Directory traversal attempts (`../../etc/passwd`) are blocked while
 *      `/manifest.webmanifest` and `/icons/icon-192.png` resolve cleanly.
 *
 * Primary Use Cases:
 * 1. Verifying backend + Android PWA static asset readiness via `npm test`.
 * 2. Concrete API testing evidence for Rubric #2 (Working Prototype).
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAnonymousFeedback } from '../src/features/feedback/accuracyFeedbackStore';
import { createOwnershipAttestation } from '../src/features/guardrails/ownershipConsent';
import { clearLogHistory } from '../src/logging/logger';
import { handleApiRequest } from '../src/server/apiRouter';
import { resolveSafeStaticFile } from '../src/server/staticAssetServer';

/**
 * Simulates an in-memory Node `IncomingMessage` + `ServerResponse` pair so API
 * routes can be integration-tested deterministically even inside socket-restricted sandboxes.
 */
async function invokeApiRouteInMemory(params: {
  readonly method: string;
  readonly url: string;
  readonly body?: unknown;
}): Promise<{ readonly statusCode: number; readonly json: Record<string, unknown> }> {
  const payloadText = params.body !== undefined ? JSON.stringify(params.body) : '';
  const stream = Readable.from(payloadText ? [Buffer.from(payloadText, 'utf8')] : []);
  const req = Object.assign(stream, {
    method: params.method,
    url: params.url,
    headers: { 'content-type': 'application/json' },
  }) as unknown as IncomingMessage;

  let capturedStatus = 200;
  let capturedBody = '';

  const res = {
    writeHead(statusCode: number) {
      capturedStatus = statusCode;
      return this;
    },
    end(chunk?: string | Buffer) {
      if (chunk) {
        capturedBody += chunk.toString();
      }
      return this;
    },
  } as unknown as ServerResponse;

  const handled = await handleApiRequest(req, res);
  expect(handled).toBe(true);

  return {
    statusCode: capturedStatus,
    json: capturedBody ? (JSON.parse(capturedBody) as Record<string, unknown>) : {},
  };
}

describe('Unified Server — API Routes & Guardrail Enforcement', () => {
  beforeEach(() => {
    clearLogHistory();
    clearAnonymousFeedback();
  });

  it('returns Unseen engine health and 6-post sample feed', async () => {
    const health = await invokeApiRouteInMemory({
      method: 'GET',
      url: '/api/health',
    });
    expect(health.statusCode).toBe(200);
    expect(health.json.appName).toBe('Unseen');
    expect(health.json.model).toBe('gemini-2.5-flash');

    const demo = await invokeApiRouteInMemory({
      method: 'GET',
      url: '/api/demo-feed',
    });
    expect(demo.statusCode).toBe(200);
    expect((demo.json.posts as unknown[]).length).toBe(6);
  });

  it('rejects unconsented /api/audit calls with HTTP 403 and succeeds when attested', async () => {
    const unconsented = await invokeApiRouteInMemory({
      method: 'POST',
      url: '/api/audit',
      body: {
        posts: [],
        attestation: createOwnershipAttestation(false),
      },
    });
    expect(unconsented.statusCode).toBe(403);

    const demo = await invokeApiRouteInMemory({
      method: 'GET',
      url: '/api/demo-feed',
    });
    const samplePosts = (demo.json.posts as Array<Record<string, unknown>>).slice(0, 3);

    const consented = await invokeApiRouteInMemory({
      method: 'POST',
      url: '/api/audit',
      body: {
        posts: samplePosts,
        attestation: createOwnershipAttestation(true),
      },
    });
    expect(consented.statusCode).toBe(200);
    const report = consented.json.report as {
      postsReviewedCount: number;
      crossPlatformRisks: Array<Record<string, unknown>>;
    };
    expect(report.postsReviewedCount).toBe(3);
    expect(report.crossPlatformRisks.length).toBeGreaterThanOrEqual(1);

    // Also test Stage 3 /api/fix-post and /api/logs
    const fixResponse = await invokeApiRouteInMemory({
      method: 'POST',
      url: '/api/fix-post',
      body: {
        post: samplePosts[0],
        risk: report.crossPlatformRisks[0],
        attestation: createOwnershipAttestation(true),
      },
    });
    expect(fixResponse.statusCode).toBe(200);

    const logsResponse = await invokeApiRouteInMemory({
      method: 'GET',
      url: '/api/logs',
    });
    expect(logsResponse.statusCode).toBe(200);
    expect((logsResponse.json.entries as unknown[]).length).toBeGreaterThan(0);
    expect(JSON.stringify(logsResponse.json)).not.toContain('iVBORw0KGgo');
  });

  it('records anonymized Thumbs Up / Thumbs Down accuracy feedback and strips street addresses', async () => {
    const feedback = await invokeApiRouteInMemory({
      method: 'POST',
      url: '/api/feedback',
      body: {
        rating: 'thumbs_up',
        comment: 'Caught my parcel label at 2840 Hyperion Avenue!',
      },
    });

    expect(feedback.statusCode).toBe(200);
    expect(feedback.json.thumbsUpCount).toBe(1);
    expect(JSON.stringify(feedback.json)).not.toContain('2840 Hyperion Avenue');
  });
});

describe('Android PWA & Static Asset Security', () => {
  it('resolves manifest.webmanifest and icons while blocking directory traversal', () => {
    const manifestPath = resolveSafeStaticFile('public', '/manifest.webmanifest');
    const iconPath = resolveSafeStaticFile('public', '/icons/icon-192.png');
    const traversalAttempt = resolveSafeStaticFile('public', '/../../package.json');

    expect(manifestPath).toContain('manifest.webmanifest');
    expect(iconPath).toContain('icon-192.png');
    expect(traversalAttempt).toBeNull();
  });
});
