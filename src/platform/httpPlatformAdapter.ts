/**
 * @file src/platform/httpPlatformAdapter.ts
 * @description Same-origin HTTP implementation of `UnseenPlatformBridge` for the
 * installable Android/iOS Progressive Web App and Mac Studio interface.
 *
 * Feature Overview:
 * Communicates with the unified `/api/*` server over relative paths so the exact
 * same build works on `http://localhost:5173` (Vite dev proxy), `http://localhost:3001`
 * (unified local server), and any HTTPS tunnel or cloud URL opened on an Android phone.
 * Logs every outgoing bridge invocation at `INFO` level with `inlineData` stripped.
 *
 * Primary Use Cases:
 * 1. Executing audits and caption rewrites from Android Chrome/PWA and macOS browsers.
 * 2. Surfacing human-readable server validation errors cleanly to the UI.
 */

import {
  CreatorPost,
  DeepfakeShieldMode,
  DeepfakeShieldVerificationReport,
  PrivacyAuditReport,
  SafePostFixPlan,
} from '../domain/privacyTypes';
import { DemoCreatorPersona } from '../features/demo-dataset/mayaCreatorFeed';
import { logFunctionCall } from '../logging/logger';
import { StructuredLogEntry } from '../logging/logger';
import {
  EngineHealthStatus,
  UnseenPlatformBridge,
} from './platformBridge';

/**
 * Helper performing a typed JSON HTTP call against `/api/*` and throwing a clean
 * `Error` when the server responds with a non-2xx status.
 *
 * @param path - Relative API route (e.g., `'/api/audit'`).
 * @param init - Optional `RequestInit` configuration.
 * @returns Parsed JSON response of type `T`.
 */
async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  logFunctionCall('requestJson', {
    path,
    method: init?.method ?? 'GET',
  });

  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

/**
 * Creates a ready-to-use `UnseenPlatformBridge` backed by same-origin `/api/*` routes.
 *
 * @param baseUrl - Optional base URL prefix (defaults to `''` for same-origin requests).
 * @returns Configured `UnseenPlatformBridge` instance.
 */
export function createHttpPlatformBridge(
  baseUrl = '',
): UnseenPlatformBridge {
  logFunctionCall('createHttpPlatformBridge', { baseUrl });

  return {
    async getHealth(): Promise<EngineHealthStatus> {
      logFunctionCall('httpBridge.getHealth', {});
      return requestJson<EngineHealthStatus>(`${baseUrl}/api/health`);
    },

    async loadDemoFeed(): Promise<{
      readonly persona: DemoCreatorPersona;
      readonly posts: readonly CreatorPost[];
    }> {
      logFunctionCall('httpBridge.loadDemoFeed', {});
      return requestJson(`${baseUrl}/api/demo-feed`);
    },

    async importArticleUrl(url: string): Promise<CreatorPost> {
      logFunctionCall('httpBridge.importArticleUrl', { url });
      const res = await requestJson<{ post: CreatorPost }>(
        `${baseUrl}/api/import-article`,
        {
          method: 'POST',
          body: JSON.stringify({ url }),
        },
      );
      return res.post;
    },

    async runPrivacyAudit(params): Promise<PrivacyAuditReport> {
      logFunctionCall('httpBridge.runPrivacyAudit', {
        postCount: params.posts.length,
        attested: params.attestation.attestedByCreator,
      });
      const res = await requestJson<{ report: PrivacyAuditReport }>(
        `${baseUrl}/api/audit`,
        {
          method: 'POST',
          body: JSON.stringify(params),
        },
      );
      return res.report;
    },

    async requestPostFixPlan(params): Promise<SafePostFixPlan> {
      logFunctionCall('httpBridge.requestPostFixPlan', {
        postId: params.post.id,
        riskId: params.risk.id,
      });
      const res = await requestJson<{ plan: SafePostFixPlan }>(
        `${baseUrl}/api/fix-post`,
        {
          method: 'POST',
          body: JSON.stringify(params),
        },
      );
      return res.plan;
    },

    async submitAccuracyFeedback(params) {
      logFunctionCall('httpBridge.submitAccuracyFeedback', {
        rating: params.rating,
      });
      return requestJson<{
        thumbsUpCount: number;
        thumbsDownCount: number;
      }>(`${baseUrl}/api/feedback`, {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },

    async fetchAuditLogs(): Promise<readonly StructuredLogEntry[]> {
      logFunctionCall('httpBridge.fetchAuditLogs', {});
      const res = await requestJson<{ entries: StructuredLogEntry[] }>(
        `${baseUrl}/api/logs`,
      );
      return res.entries;
    },

    async clearAuditLogs(): Promise<void> {
      logFunctionCall('httpBridge.clearAuditLogs', {});
      await requestJson(`${baseUrl}/api/logs/clear`, { method: 'POST' });
    },

    async loadDeepfakeShieldDemo(
      mode: DeepfakeShieldMode = 'stealth',
    ): Promise<DeepfakeShieldVerificationReport> {
      logFunctionCall('httpBridge.loadDeepfakeShieldDemo', { mode });
      const res = await requestJson<{ report: DeepfakeShieldVerificationReport }>(
        `${baseUrl}/api/deepfake-shield/demo?mode=${encodeURIComponent(mode)}`,
      );
      return res.report;
    },

    async verifyDeepfakeShield(params): Promise<DeepfakeShieldVerificationReport> {
      logFunctionCall('httpBridge.verifyDeepfakeShield', {
        mode: params.mode ?? 'stealth',
        attested: params.attestation.attestedByCreator,
      });
      const res = await requestJson<{ report: DeepfakeShieldVerificationReport }>(
        `${baseUrl}/api/deepfake-shield/verify`,
        {
          method: 'POST',
          body: JSON.stringify(params),
        },
      );
      return res.report;
    },
  };
}
