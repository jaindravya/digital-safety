/**
 * @file src/platform/platformBridge.ts
 * @description Abstract Layer 2 platform adapter contract decoupling Unseen's React
 * UI from the underlying transport (HTTP server, Capacitor native shell, or Electron IPC).
 *
 * Feature Overview:
 * Ensures UI components never hardcode `fetch` URLs, Node modules, or device-specific
 * globals directly. Today, `httpPlatformAdapter.ts` implements this contract over
 * same-origin `/api/*` endpoints so both Android PWA installations and Mac browsers
 * work seamlessly; future native wrappers can swap adapters in one place.
 *
 * Primary Use Cases:
 * 1. Fetching health status and the 6-post sample creator feed.
 * 2. Importing a public Substack/blog URL, running a full audit, and requesting Stage 3 fixes.
 * 3. Submitting anonymous accuracy ratings and inspecting sanitized `INFO` logs.
 */

import {
  CreatorPost,
  CrossPlatformRisk,
  PostDisclosureFinding,
  PrivacyAuditReport,
  SafePostFixPlan,
} from '../domain/privacyTypes';
import { DemoCreatorPersona } from '../features/demo-dataset/mayaCreatorFeed';
import { AccuracyRating } from '../features/feedback/accuracyFeedbackStore';
import { OwnershipAttestation } from '../features/guardrails/ownershipConsent';
import { StructuredLogEntry } from '../logging/logger';

/**
 * Runtime health snapshot returned by the backend engine.
 */
export interface EngineHealthStatus {
  readonly status: 'ok';
  readonly appName: string;
  readonly version: string;
  readonly model: string;
  readonly liveGeminiKeyConfigured: boolean;
}

/**
 * Platform-independent bridge consumed by all Creator Studio & Mobile screens.
 */
export interface UnseenPlatformBridge {
  getHealth(): Promise<EngineHealthStatus>;
  loadDemoFeed(): Promise<{
    readonly persona: DemoCreatorPersona;
    readonly posts: readonly CreatorPost[];
  }>;
  importArticleUrl(url: string): Promise<CreatorPost>;
  runPrivacyAudit(params: {
    readonly posts: readonly CreatorPost[];
    readonly attestation: OwnershipAttestation;
  }): Promise<PrivacyAuditReport>;
  requestPostFixPlan(params: {
    readonly post: CreatorPost;
    readonly risk: CrossPlatformRisk;
    readonly postFinding?: PostDisclosureFinding;
    readonly attestation: OwnershipAttestation;
  }): Promise<SafePostFixPlan>;
  submitAccuracyFeedback(params: {
    readonly rating: AccuracyRating;
    readonly comment?: string;
  }): Promise<{
    readonly thumbsUpCount: number;
    readonly thumbsDownCount: number;
  }>;
  fetchAuditLogs(): Promise<readonly StructuredLogEntry[]>;
  clearAuditLogs(): Promise<void>;
}
