/**
 * @file src/domain/privacyTypes.ts
 * @description Core platform-agnostic TypeScript domain contracts for PrivacyMirror.
 *
 * Feature Overview:
 * Defines the strongly typed data structures shared across every stage of the
 * PrivacyMirror workflow—from creator-submitted multi-platform posts (`CreatorPost`),
 * to Stage 1 multimodal per-post disclosures with normalized bounding boxes
 * (`PostDisclosureFinding`), Stage 2 cumulative cross-platform risk connections
 * (`CrossPlatformRisk`), and Stage 3 pre-publication fixes (`SafePostFixPlan`).
 *
 * Primary Use Cases:
 * 1. Enforcing strict schema alignment between `@google/genai` JSON outputs and
 *    TypeScript business logic.
 * 2. Sharing identical domain contracts between the macOS Electron app and future
 *    iOS/Android mobile builds without any platform-specific imports.
 * 3. Tracking human-in-the-loop resolution state ("exposures addressed") without
 *    fabricating a misleading percentage "privacy safety score."
 */

import { SUPPORTED_PLATFORMS } from '../config/appConfig';

/**
 * Union of creator platforms supported by PrivacyMirror.
 */
export type CreatorPlatform = (typeof SUPPORTED_PLATFORMS)[number];

/**
 * High-level categories of privacy disclosures detected in creator content.
 */
export type DisclosureCategory =
  | 'predictable_routine'
  | 'real_time_location'
  | 'sensitive_document_or_pii'
  | 'recognizable_surroundings'
  | 'travel_or_lodging_clue';

/**
 * Normalized severity level communicated in plain creator-friendly language.
 */
export type RiskPriority = 'high' | 'medium' | 'low';

/**
 * Normalized bounding box in Gemini's `0..1000` coordinate space (`[ymin, xmin, ymax, xmax]`),
 * used by the Fix Studio to highlight, blur, or crop sensitive regions within an image.
 */
export interface NormalizedBoundingBox {
  readonly ymin: number;
  readonly xmin: number;
  readonly ymax: number;
  readonly xmax: number;
  readonly label: string;
}

/**
 * Represents a creator-owned published post or unpublished draft submitted for self-audit.
 */
export interface CreatorPost {
  readonly id: string;
  readonly platform: CreatorPlatform;
  readonly title?: string;
  readonly caption: string;
  readonly postedAtLabel: string;
  readonly isDraft: boolean;
  readonly imageDataUrl?: string;
  readonly mediaMimeType?: string;
  readonly mediaAltDescription: string;
}

/**
 * Single privacy-relevant clue extracted from an individual post in Stage 1.
 */
export interface PostDisclosureClue {
  readonly category: DisclosureCategory;
  readonly summary: string;
  readonly sourceModality: 'visual' | 'caption' | 'timestamp' | 'combined';
  readonly timeCue?: string;
  readonly placeTypeCue?: string;
  readonly boundingBox?: NormalizedBoundingBox;
}

/**
 * Complete Stage 1 multimodal scan result for a single `CreatorPost`.
 */
export interface PostDisclosureFinding {
  readonly postId: string;
  readonly platform: CreatorPlatform;
  readonly clues: readonly PostDisclosureClue[];
}

/**
 * Stage 2 cross-platform privacy risk synthesizing one or more contributing posts
 * to explain cumulative exposure without inferring exact addresses or coordinates.
 */
export interface CrossPlatformRisk {
  readonly id: string;
  readonly title: string;
  readonly category: DisclosureCategory;
  readonly priority: RiskPriority;
  readonly contributingPostIds: readonly string[];
  readonly platformsInvolved: readonly CreatorPlatform[];
  readonly whyItMatters: string;
  readonly combinedEvidenceSummary: string;
  readonly recommendedActionSummary: string;
  readonly safetyReferenceNote: string;
  readonly status: 'needs_review' | 'addressed';
}

/**
 * Voice-preserving caption option generated in Stage 3 for a flagged post or draft.
 */
export interface CaptionRewriteOption {
  readonly id: string;
  readonly styleLabel: string;
  readonly rewrittenCaption: string;
  readonly whatChanged: string;
}

/**
 * Stage 3 actionable pre-post fix plan for a specific `CreatorPost`.
 */
export interface SafePostFixPlan {
  readonly postId: string;
  readonly riskId: string;
  readonly captionOptions: readonly CaptionRewriteOption[];
  readonly suggestedRegionsToRedact: readonly NormalizedBoundingBox[];
  readonly timingRecommendation: string;
  readonly plainLanguageChecklist: readonly string[];
}

/**
 * Applied edits chosen by the creator in the Before/After Fix Studio.
 */
export interface AppliedPostSafetyFix {
  readonly postId: string;
  readonly riskId: string;
  readonly updatedCaption: string;
  readonly redactedImageDataUrl?: string;
  readonly appliedRedactionBoxes: readonly NormalizedBoundingBox[];
  readonly scheduledTimingNote: string;
  readonly appliedAtIso: string;
}

/**
 * Aggregate result of running the full PrivacyMirror audit across a creator's feed.
 */
export interface PrivacyAuditReport {
  readonly auditedAtIso: string;
  readonly postsReviewedCount: number;
  readonly postFindings: readonly PostDisclosureFinding[];
  readonly crossPlatformRisks: readonly CrossPlatformRisk[];
  readonly limitationsNotice: string;
  readonly usedDemoFallback: boolean;
}
