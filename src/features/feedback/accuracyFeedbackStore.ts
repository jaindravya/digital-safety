/**
 * @file src/features/feedback/accuracyFeedbackStore.ts
 * @description Privacy-preserving anonymous report accuracy feedback recorder.
 *
 * Feature Overview:
 * Allows creators to submit a one-tap Thumbs Up or Thumbs Down rating (plus an
 * optional brief comment) on an audit report so the team can evaluate usefulness
 * and precision—without collecting user accounts, names, emails, or raw photos.
 * Records only anonymous aggregate counts and sanitized notes in memory and `INFO` logs.
 *
 * Primary Use Cases:
 * 1. Recording Thumbs Up / Thumbs Down accuracy ratings from the Risk Overview screen.
 * 2. Inspecting aggregate accuracy telemetry in automated tests and session logs.
 */

import { sanitizeLocationSensitiveText } from '../guardrails/antiDoxxingGuardrail';
import { logFunctionCall } from '../../logging/logger';

/**
 * Supported binary accuracy ratings submitted by a creator after reviewing a report.
 */
export type AccuracyRating = 'thumbs_up' | 'thumbs_down';

/**
 * Anonymous feedback event containing zero PII or media references.
 */
export interface AnonymousFeedbackRecord {
  readonly id: string;
  readonly rating: AccuracyRating;
  readonly comment?: string;
  readonly submittedAtIso: string;
}

const feedbackBuffer: AnonymousFeedbackRecord[] = [];
let feedbackSeq = 0;

/**
 * Records an anonymized accuracy rating, scrubbing any accidental address text from
 * optional comments before storing or logging.
 *
 * @param rating - `'thumbs_up'` or `'thumbs_down'` selection.
 * @param rawComment - Optional short user note (capped at 280 chars and sanitized).
 * @returns Newly recorded `AnonymousFeedbackRecord`.
 */
export function recordAnonymousFeedback(
  rating: AccuracyRating,
  rawComment?: string,
): AnonymousFeedbackRecord {
  const cleanedComment = rawComment
    ? sanitizeLocationSensitiveText(rawComment.trim().slice(0, 280))
    : undefined;

  logFunctionCall('recordAnonymousFeedback', {
    rating,
    hasComment: Boolean(cleanedComment),
  });

  feedbackSeq += 1;
  const record: AnonymousFeedbackRecord = Object.freeze({
    id: `feedback-${feedbackSeq}`,
    rating,
    comment: cleanedComment || undefined,
    submittedAtIso: new Date().toISOString(),
  });

  feedbackBuffer.push(record);
  return record;
}

/**
 * Returns aggregate Thumbs Up and Thumbs Down counts for the current runtime session.
 *
 * @returns Summary counts and read-only feedback records.
 */
export function getAnonymousFeedbackSummary(): {
  readonly thumbsUpCount: number;
  readonly thumbsDownCount: number;
  readonly records: readonly AnonymousFeedbackRecord[];
} {
  logFunctionCall('getAnonymousFeedbackSummary', {
    totalCount: feedbackBuffer.length,
  });

  const thumbsUpCount = feedbackBuffer.filter(
    (item) => item.rating === 'thumbs_up',
  ).length;
  const thumbsDownCount = feedbackBuffer.filter(
    (item) => item.rating === 'thumbs_down',
  ).length;

  return {
    thumbsUpCount,
    thumbsDownCount,
    records: [...feedbackBuffer],
  };
}

/**
 * Clears in-memory feedback entries (used for test isolation).
 */
export function clearAnonymousFeedback(): void {
  logFunctionCall('clearAnonymousFeedback', {});
  feedbackBuffer.length = 0;
}
