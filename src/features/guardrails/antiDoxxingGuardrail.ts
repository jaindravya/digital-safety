/**
 * @file src/features/guardrails/antiDoxxingGuardrail.ts
 * @description Defensive post-processing guardrail that prevents PrivacyMirror outputs
 * from inferring, echoing, or displaying exact street addresses, apartment/unit numbers,
 * or raw GPS coordinates.
 *
 * Feature Overview:
 * A core Responsible Design requirement of PrivacyMirror is explaining *categories* of
 * unintended exposure (e.g., "visible shipping label in corner", "recurring Tuesday
 * café routine") without ever turning into a doxxing or geolocation tool that outputs
 * inferred residential addresses or exact coordinates. Even though Gemini system
 * instructions forbid exact-location inference, defense-in-depth requires deterministic
 * output scrubbing across all Stage 1 clues, Stage 2 cross-post risks, and Stage 3
 * caption rewrites before anything reaches the UI.
 *
 * Primary Use Cases:
 * 1. Scrubbing accidental street addresses, apartment numbers, or decimal lat/long
 *    coordinates from raw LLM text (`sanitizeLocationSensitiveText`).
 * 2. Enforcing guardrail compliance across an entire `PrivacyAuditReport`
 *    (`enforceReportAntiDoxxing`).
 * 3. Enforcing guardrail compliance across `SafePostFixPlan` suggestions
 *    (`enforceFixPlanAntiDoxxing`).
 */

import { APP_CONFIG } from '../../config/appConfig';
import {
  CrossPlatformRisk,
  PostDisclosureClue,
  PostDisclosureFinding,
  PrivacyAuditReport,
  SafePostFixPlan,
} from '../../domain/privacyTypes';
import { logFunctionCall } from '../../logging/logger';

const APARTMENT_OR_ROOM_NUMBER_PATTERN =
  /\b(?:Apt\.?|Apartment|Suite|Ste\.?|Unit|Room|Rm\.?)\s*#?[A-Za-z0-9-]{1,6}\b/gi;

/**
 * Clamps a normalized Gemini bounding-box coordinate into the valid `[0, scale]`
 * interval so malformed model coordinates cannot draw out-of-bounds redaction overlays.
 *
 * @param coordinate - Raw numeric coordinate returned by a model.
 * @returns Integer clamped between `0` and `APP_CONFIG.genai.boundingBoxCoordinateScale`.
 */
export function clampBoundingBoxCoordinate(coordinate: number): number {
  logFunctionCall('clampBoundingBoxCoordinate', { coordinate });

  const maxScale = APP_CONFIG.genai.boundingBoxCoordinateScale;
  if (!Number.isFinite(coordinate)) {
    return 0;
  }
  return Math.min(maxScale, Math.max(0, Math.round(coordinate)));
}

/**
 * Scrubs exact street addresses, apartment/room identifiers, and decimal GPS
 * coordinates from free-form text while preserving high-level safety explanations.
 *
 * @param text - Candidate text produced by Gemini or intermediate analyzers.
 * @returns Sanitized string with exact location identifiers replaced by a safe placeholder.
 */
export function sanitizeLocationSensitiveText(text: string): string {
  logFunctionCall('sanitizeLocationSensitiveText', { text });

  const placeholder = APP_CONFIG.guardrails.redactedAddressPlaceholder;
  const streetRegex = new RegExp(
    APP_CONFIG.guardrails.streetAddressPattern.source,
    APP_CONFIG.guardrails.streetAddressPattern.flags,
  );
  const gpsRegex = new RegExp(
    APP_CONFIG.guardrails.gpsCoordinatePattern.source,
    APP_CONFIG.guardrails.gpsCoordinatePattern.flags,
  );

  return text
    .replace(streetRegex, placeholder)
    .replace(gpsRegex, placeholder)
    .replace(APARTMENT_OR_ROOM_NUMBER_PATTERN, placeholder);
}

/**
 * Sanitizes an individual `PostDisclosureClue` so neither its summary nor its
 * optional bounding-box label leaks exact street addresses, room numbers, or coordinates.
 *
 * @param clue - Stage 1 disclosure clue extracted from a creator post.
 * @returns Guardrail-compliant copy of `PostDisclosureClue`.
 */
export function sanitizePostClue(clue: PostDisclosureClue): PostDisclosureClue {
  logFunctionCall('sanitizePostClue', {
    category: clue.category,
    sourceModality: clue.sourceModality,
  });

  return {
    ...clue,
    summary: sanitizeLocationSensitiveText(clue.summary),
    timeCue: clue.timeCue ? sanitizeLocationSensitiveText(clue.timeCue) : undefined,
    placeTypeCue: clue.placeTypeCue
      ? sanitizeLocationSensitiveText(clue.placeTypeCue)
      : undefined,
    boundingBox: clue.boundingBox
      ? {
          ymin: clampBoundingBoxCoordinate(clue.boundingBox.ymin),
          xmin: clampBoundingBoxCoordinate(clue.boundingBox.xmin),
          ymax: clampBoundingBoxCoordinate(clue.boundingBox.ymax),
          xmax: clampBoundingBoxCoordinate(clue.boundingBox.xmax),
          label: sanitizeLocationSensitiveText(clue.boundingBox.label),
        }
      : undefined,
  };
}

/**
 * Sanitizes a Stage 2 `CrossPlatformRisk` object to guarantee all creator-facing
 * explanations describe exposure categories rather than exact physical locations.
 *
 * @param risk - Cross-platform risk synthesized across multiple posts.
 * @returns Guardrail-compliant copy of `CrossPlatformRisk`.
 */
export function sanitizeCrossPlatformRisk(
  risk: CrossPlatformRisk,
): CrossPlatformRisk {
  logFunctionCall('sanitizeCrossPlatformRisk', {
    riskId: risk.id,
    category: risk.category,
  });

  return {
    ...risk,
    title: sanitizeLocationSensitiveText(risk.title),
    whyItMatters: sanitizeLocationSensitiveText(risk.whyItMatters),
    combinedEvidenceSummary: sanitizeLocationSensitiveText(
      risk.combinedEvidenceSummary,
    ),
    recommendedActionSummary: sanitizeLocationSensitiveText(
      risk.recommendedActionSummary,
    ),
    safetyReferenceNote: sanitizeLocationSensitiveText(risk.safetyReferenceNote),
  };
}

/**
 * Applies anti-doxxing sanitization across an entire `PrivacyAuditReport`
 * before returning results to the UI layer.
 *
 * @param report - Raw `PrivacyAuditReport` assembled by the audit pipeline.
 * @returns Sanitized `PrivacyAuditReport` safe for creator presentation.
 */
export function enforceReportAntiDoxxing(
  report: PrivacyAuditReport,
): PrivacyAuditReport {
  logFunctionCall('enforceReportAntiDoxxing', {
    postsReviewedCount: report.postsReviewedCount,
    risksCount: report.crossPlatformRisks.length,
  });

  const sanitizedFindings: PostDisclosureFinding[] = report.postFindings.map(
    (finding) => ({
      ...finding,
      clues: finding.clues.map((clue) => sanitizePostClue(clue)),
    }),
  );

  const sanitizedRisks: CrossPlatformRisk[] = report.crossPlatformRisks.map(
    (risk) => sanitizeCrossPlatformRisk(risk),
  );

  return {
    ...report,
    postFindings: sanitizedFindings,
    crossPlatformRisks: sanitizedRisks,
    limitationsNotice: sanitizeLocationSensitiveText(report.limitationsNotice),
  };
}

/**
 * Applies anti-doxxing sanitization and bounding-box clamping across a Stage 3
 * `SafePostFixPlan` so suggested captions and redaction labels never echo PII.
 *
 * @param plan - Candidate `SafePostFixPlan` generated for a flagged post.
 * @returns Sanitized `SafePostFixPlan`.
 */
export function enforceFixPlanAntiDoxxing(
  plan: SafePostFixPlan,
): SafePostFixPlan {
  logFunctionCall('enforceFixPlanAntiDoxxing', {
    postId: plan.postId,
    riskId: plan.riskId,
  });

  return {
    ...plan,
    captionOptions: plan.captionOptions.map((option) => ({
      ...option,
      styleLabel: sanitizeLocationSensitiveText(option.styleLabel),
      rewrittenCaption: sanitizeLocationSensitiveText(option.rewrittenCaption),
      whatChanged: sanitizeLocationSensitiveText(option.whatChanged),
    })),
    suggestedRegionsToRedact: plan.suggestedRegionsToRedact.map((box) => ({
      ymin: clampBoundingBoxCoordinate(box.ymin),
      xmin: clampBoundingBoxCoordinate(box.xmin),
      ymax: clampBoundingBoxCoordinate(box.ymax),
      xmax: clampBoundingBoxCoordinate(box.xmax),
      label: sanitizeLocationSensitiveText(box.label),
    })),
    timingRecommendation: sanitizeLocationSensitiveText(
      plan.timingRecommendation,
    ),
    plainLanguageChecklist: plan.plainLanguageChecklist.map((step) =>
      sanitizeLocationSensitiveText(step),
    ),
  };
}
