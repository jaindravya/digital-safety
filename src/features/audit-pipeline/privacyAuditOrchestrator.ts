/**
 * @file src/features/audit-pipeline/privacyAuditOrchestrator.ts
 * @description End-to-end orchestrator coordinating Ownership Consent, Stage 1
 * Multimodal Post/Article Scanning, Stage 2 Cross-Platform Risk Synthesis,
 * Deterministic Exposure Scoring, Personalized Best Practices, and Anti-Doxxing
 * Output Sanitization.
 *
 * Feature Overview:
 * Serves as the single high-level entry point invoked by the Unseen backend/UI
 * whenever a creator runs a privacy audit across uploaded camera-roll photos,
 * drafts, and imported blog/Substack articles. Guarantees Responsible Design
 * invariants (consent check before execution, deterministic scoring, honest AI
 * limitations disclosure, and strict anti-doxxing scrubbing on output).
 *
 * Primary Use Cases:
 * 1. Running a full cross-platform audit from the Android mobile PWA or Mac Studio UI.
 * 2. Re-computing the overall exposure score when a creator applies a fix in-session.
 */

import { CreatorPost, PrivacyAuditReport } from '../../domain/privacyTypes';
import { GenAiStructuredExecutor } from '../../genai/geminiClient';
import { logFunctionCall } from '../../logging/logger';
import { enforceReportAntiDoxxing } from '../guardrails/antiDoxxingGuardrail';
import {
  assertOwnershipAttestation,
  OwnershipAttestation,
} from '../guardrails/ownershipConsent';
import { scanCreatorPostsBatch } from '../post-scan/postScanner';
import { connectCrossPlatformRisks } from '../risk-connector/riskConnector';
import {
  buildBestPracticesForRisks,
  calculateOverallExposureScore,
} from '../risk-connector/riskScoringEngine';

/**
 * Standard Responsible Design limitations disclosure attached to every report.
 */
export const DEFAULT_AUDIT_LIMITATIONS_NOTICE =
  'Unseen highlights likely visual, textual, and cross-post routine disclosures to help you edit before publishing, but automated AI review cannot catch every local landmark, reflection, or audio cue and does not guarantee complete anonymity.';

/**
 * Runs the complete Unseen privacy audit across a creator's submitted camera-roll
 * photos, drafts, and imported articles.
 *
 * @param params - Creator posts, ownership attestation, and optional test executor.
 * @returns Sanitized `PrivacyAuditReport` with cross-post confidence insights, bounding boxes, score, and best practices.
 */
export async function runFullPrivacyAudit(params: {
  readonly posts: readonly CreatorPost[];
  readonly attestation: OwnershipAttestation;
  readonly executor?: GenAiStructuredExecutor;
}): Promise<PrivacyAuditReport> {
  logFunctionCall('runFullPrivacyAudit', {
    postCount: params.posts.length,
    platforms: params.posts.map((p) => p.platform),
  });

  assertOwnershipAttestation(params.attestation);

  if (params.posts.length === 0) {
    return {
      auditedAtIso: new Date().toISOString(),
      postsReviewedCount: 0,
      overallExposureScore: 0,
      overallSeverityBand: 'low',
      postFindings: [],
      crossPlatformRisks: [],
      bestPractices: buildBestPracticesForRisks([]),
      limitationsNotice: DEFAULT_AUDIT_LIMITATIONS_NOTICE,
      usedDemoFallback: false,
    };
  }

  const stage1 = await scanCreatorPostsBatch(params.posts, params.executor);
  const stage2 = await connectCrossPlatformRisks(
    stage1.findings,
    params.executor,
    params.posts,
  );
  const { score, band } = calculateOverallExposureScore(stage2.risks);
  const bestPractices = buildBestPracticesForRisks(stage2.risks);

  const rawReport: PrivacyAuditReport = {
    auditedAtIso: new Date().toISOString(),
    postsReviewedCount: params.posts.length,
    overallExposureScore: score,
    overallSeverityBand: band,
    postFindings: stage1.findings,
    crossPlatformRisks: stage2.risks,
    bestPractices,
    limitationsNotice: DEFAULT_AUDIT_LIMITATIONS_NOTICE,
    usedDemoFallback: stage1.usedFallback || stage2.usedFallback,
  };

  return enforceReportAntiDoxxing(rawReport);
}
