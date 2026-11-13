/**
 * @file src/domain/privacyTypes.ts
 * @description Core platform-agnostic TypeScript domain contracts for Unseen.
 *
 * Feature Overview:
 * Defines the strongly typed data structures shared across every stage of the
 * Unseen workflow—from camera-roll photo uploads and imported blog/Substack articles
 * (`CreatorPost`), to Stage 1 multimodal per-post disclosures with normalized
 * bounding boxes (`PostDisclosureFinding`), Stage 2 cumulative cross-platform
 * confidence insights (`CrossPlatformRisk`), deterministic exposure scoring and
 * personalized best practices (`BestPracticeRecommendation`), and Stage 3
 * pre-publication fixes (`SafePostFixPlan`).
 *
 * Primary Use Cases:
 * 1. Enforcing strict schema alignment between `@google/genai` JSON outputs and
 *    TypeScript business logic.
 * 2. Sharing identical domain contracts across Android mobile PWA, macOS Studio
 *    views, and Node backend endpoints without platform-specific imports.
 * 3. Combining privacy-preserving confidence insights ("With 89% confidence...")
 *    with actionable pre-post edits and downloadable safety checklists.
 */

import { SUPPORTED_PLATFORMS } from '../config/appConfig';

/**
 * Union of creator content sources supported by Unseen.
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
 * Represents a creator-owned camera-roll photo, published post, imported blog/Substack
 * article, or unpublished draft submitted for self-audit.
 */
export interface CreatorPost {
  readonly id: string;
  readonly platform: CreatorPlatform;
  readonly title?: string;
  readonly caption: string;
  readonly postedAtLabel: string;
  readonly isDraft: boolean;
  readonly sourceUrl?: string;
  readonly imageDataUrl?: string;
  readonly mediaAssetPath?: string;
  readonly mediaMimeType?: string;
  readonly mediaAltDescription: string;
}

/**
 * Single privacy-relevant clue extracted from an individual post or article in Stage 1.
 */
export interface PostDisclosureClue {
  readonly category: DisclosureCategory;
  readonly summary: string;
  readonly sourceModality: 'visual' | 'caption' | 'timestamp' | 'combined';
  readonly confidencePercentage?: number;
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
 * Stage 2 cross-platform privacy risk synthesizing one or more contributing posts/articles
 * with privacy-preserving confidence statements ("With X% confidence...") and zero raw addresses.
 */
export interface CrossPlatformRisk {
  readonly id: string;
  readonly title: string;
  readonly category: DisclosureCategory;
  readonly priority: RiskPriority;
  readonly confidencePercentage?: number;
  readonly occurrenceCount?: number;
  readonly abstractConfidenceStatement?: string;
  readonly contributingPostIds: readonly string[];
  readonly platformsInvolved: readonly CreatorPlatform[];
  readonly whyItMatters: string;
  readonly combinedEvidenceSummary: string;
  readonly recommendedActionSummary: string;
  readonly safetyReferenceNote: string;
  readonly status: 'needs_review' | 'addressed';
}

/**
 * Personalized or general digital safety habit item surfaced alongside audit results
 * and exportable as a local checklist.
 */
export interface BestPracticeRecommendation {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: 'personalized' | 'general';
  readonly triggeredByCategory?: DisclosureCategory;
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
 * Aggregate result of running the full Unseen audit across a creator's photos and articles.
 */
export interface PrivacyAuditReport {
  readonly auditedAtIso: string;
  readonly postsReviewedCount: number;
  readonly overallExposureScore?: number;
  readonly overallSeverityBand?: RiskPriority;
  readonly postFindings: readonly PostDisclosureFinding[];
  readonly crossPlatformRisks: readonly CrossPlatformRisk[];
  readonly bestPractices?: readonly BestPracticeRecommendation[];
  readonly limitationsNotice: string;
  readonly usedDemoFallback: boolean;
}
