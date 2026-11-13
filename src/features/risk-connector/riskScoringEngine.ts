/**
 * @file src/features/risk-connector/riskScoringEngine.ts
 * @description Deterministic backend scoring and personalized Best Practices generator.
 *
 * Feature Overview:
 * Rather than letting an LLM hallucinate arbitrary risk numbers, Unseen uses
 * deterministic code to:
 *   1. Enforce occurrence-based priority rules across clustered clues (boosting
 *      direct PII documents and live real-time whereabouts to `high` immediately).
 *   2. Compute a crisp `0–100` Detected Exposure Score and `low` / `medium` / `high`
 *      severity band calibrated to `APP_CONFIG.scoring`.
 *   3. Format privacy-preserving `"With X% confidence..."` abstract statements that
 *      communicate urgency without naming private addresses or venues.
 *   4. Match detected categories to personalized + general digital safety Best Practices
 *      that creators can check off and download locally.
 *
 * Primary Use Cases:
 * 1. Post-processing Stage 2 `CrossPlatformRisk` items with consistent priority & confidence copy.
 * 2. Generating the Personalized Best Practices checklist for the creator dashboard.
 */

import { APP_CONFIG } from '../../config/appConfig';
import {
  BestPracticeRecommendation,
  CrossPlatformRisk,
  DisclosureCategory,
  RiskPriority,
} from '../../domain/privacyTypes';
import { logFunctionCall } from '../../logging/logger';

const GENERAL_BEST_PRACTICES: readonly BestPracticeRecommendation[] = Object.freeze([
  {
    id: 'general-camera-roll-check',
    title: 'Zoom into corners & reflections before posting',
    description:
      'Check desk corners, mirrors, laptop tabs, and car dashboards for mail, badges, or street signs before sharing original camera-roll photos.',
    kind: 'general',
  },
  {
    id: 'general-stagger-locations',
    title: 'Delay location-tagged posts until after you leave',
    description:
      'RAINN digital safety guidance recommends waiting until you have departed an event, café, or hotel before publishing recognizable surroundings.',
    kind: 'general',
  },
]);

const CATEGORY_PERSONALIZED_TIPS: Readonly<
  Record<DisclosureCategory, BestPracticeRecommendation>
> = Object.freeze({
  predictable_routine: {
    id: 'tip-routine-exposure',
    title: 'Break predictable weekday & time cues across platforms',
    description:
      'Avoid pairing exact days/times in newsletters or captions (e.g., "every Tuesday at 8am") with visual neighborhood clues from the same routine.',
    kind: 'personalized',
    triggeredByCategory: 'predictable_routine',
  },
  real_time_location: {
    id: 'tip-realtime-post',
    title: 'Switch live "right now" captions to post-event recaps',
    description:
      'Hold live venue or rooftop drafts for 12–24 hours and blur VIP/artist credentials that show active set times or entrances.',
    kind: 'personalized',
    triggeredByCategory: 'real_time_location',
  },
  sensitive_document_or_pii: {
    id: 'tip-visible-pii',
    title: 'Blur or crop parcel labels, mail, and ID badges',
    description:
      'High-resolution camera-roll photos let viewers zoom in on barcodes, apartment numbers, and shipping labels—use Smart Blur before posting.',
    kind: 'personalized',
    triggeredByCategory: 'sensitive_document_or_pii',
  },
  travel_or_lodging_clue: {
    id: 'tip-hotel-lodging',
    title: 'Hide hotel keycard sleeves, floor numbers, and Wi-Fi codes',
    description:
      'Share travel flatlays and room tours only after checkout, and crop out printed room envelopes or distinctive balcony views.',
    kind: 'personalized',
    triggeredByCategory: 'travel_or_lodging_clue',
  },
  recognizable_surroundings: {
    id: 'tip-surroundings',
    title: 'Frame tighter around subjects near home or studio blocks',
    description:
      'Exterior awnings, unique archways, and street-level windows across multiple posts can narrow down a neighborhood block.',
    kind: 'personalized',
    triggeredByCategory: 'recognizable_surroundings',
  },
});

/**
 * Deterministically assigns `low`, `medium`, or `high` priority based on post
 * occurrence frequency and high-immediacy disclosure categories.
 *
 * @param category - Type of privacy disclosure pattern.
 * @param occurrenceCount - Number of contributing posts/articles in the cluster.
 * @returns Normalized `RiskPriority` (`'low' | 'medium' | 'high'`).
 */
export function computeDeterministicPriority(
  category: DisclosureCategory,
  occurrenceCount: number,
): RiskPriority {
  logFunctionCall('computeDeterministicPriority', {
    category,
    occurrenceCount,
  });

  if (
    category === 'sensitive_document_or_pii' ||
    category === 'real_time_location' ||
    occurrenceCount >= APP_CONFIG.scoring.highOccurrenceThreshold
  ) {
    return 'high';
  }

  if (
    category === 'travel_or_lodging_clue' ||
    occurrenceCount >= APP_CONFIG.scoring.mediumOccurrenceThreshold
  ) {
    return 'medium';
  }

  return 'low';
}

/**
 * Builds a privacy-preserving abstract confidence statement ("With X% confidence...")
 * describing the pattern category and occurrence count without naming addresses or venues.
 *
 * @param category - Disclosure category of the cluster.
 * @param confidencePercentage - Clamped confidence integer (`50..98`).
 * @param occurrenceCount - Number of posts/articles contributing to the insight.
 * @returns Creator-friendly confidence warning string.
 */
export function formatAbstractConfidenceStatement(
  category: DisclosureCategory,
  confidencePercentage: number,
  occurrenceCount: number,
): string {
  logFunctionCall('formatAbstractConfidenceStatement', {
    category,
    confidencePercentage,
    occurrenceCount,
  });

  const clampedConfidence = Math.min(98, Math.max(50, Math.round(confidencePercentage)));
  const itemNoun = occurrenceCount === 1 ? '1 item' : `${occurrenceCount} items`;

  switch (category) {
    case 'predictable_routine':
      return `With ${clampedConfidence}% confidence, an observer could map your recurring weekly café & workout schedule (connected across ${itemNoun}).`;
    case 'real_time_location':
      return `With ${clampedConfidence}% confidence, this draft reveals your active real-time venue whereabouts while you are still on site (${itemNoun}).`;
    case 'sensitive_document_or_pii':
      return `With ${clampedConfidence}% confidence, a readable residential mail or shipping label is exposed in frame (${itemNoun}).`;
    case 'travel_or_lodging_clue':
      return `With ${clampedConfidence}% confidence, your active hotel stay and floor/room details can be narrowed down (${itemNoun}).`;
    case 'recognizable_surroundings':
      return `With ${clampedConfidence}% confidence, repeated exterior landmarks narrow down a frequented neighborhood block (${itemNoun}).`;
  }
}

/**
 * Enriches raw `CrossPlatformRisk` items with deterministic occurrence counts,
 * calibrated priority levels, and standardized abstract confidence statements.
 *
 * @param risks - Candidate `CrossPlatformRisk` items produced by Stage 2 or fallback.
 * @returns Deterministically calibrated `CrossPlatformRisk` array sorted high-to-low.
 */
export function calibrateCrossPlatformRisks(
  risks: readonly CrossPlatformRisk[],
): CrossPlatformRisk[] {
  logFunctionCall('calibrateCrossPlatformRisks', {
    riskCount: risks.length,
  });

  const priorityRank: Record<RiskPriority, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  return risks
    .map((risk) => {
      const occurrenceCount = Math.max(1, risk.contributingPostIds.length);
      const priority = computeDeterministicPriority(risk.category, occurrenceCount);
      const defaultConfidence =
        priority === 'high' ? 91 : priority === 'medium' ? 84 : 72;
      const confidencePercentage = Math.min(
        98,
        Math.max(50, Math.round(risk.confidencePercentage ?? defaultConfidence)),
      );

      return {
        ...risk,
        priority,
        occurrenceCount,
        confidencePercentage,
        abstractConfidenceStatement:
          risk.abstractConfidenceStatement ??
          formatAbstractConfidenceStatement(
            risk.category,
            confidencePercentage,
            occurrenceCount,
          ),
      };
    })
    .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority]);
}

/**
 * Computes the overall `0–100` Detected Exposure Score and severity band from
 * calibrated `CrossPlatformRisk` items.
 *
 * @param risks - Calibrated `CrossPlatformRisk` list (considering unresolved risks).
 * @returns Score (`0..100`) and corresponding `'low' | 'medium' | 'high'` band.
 */
export function calculateOverallExposureScore(
  risks: readonly CrossPlatformRisk[],
): { readonly score: number; readonly band: RiskPriority } {
  logFunctionCall('calculateOverallExposureScore', {
    riskCount: risks.length,
  });

  const activeRisks = risks.filter((r) => r.status !== 'addressed');
  let rawPoints = 0;

  for (const risk of activeRisks) {
    if (risk.priority === 'high') {
      rawPoints += APP_CONFIG.scoring.highPriorityWeight;
    } else if (risk.priority === 'medium') {
      rawPoints += APP_CONFIG.scoring.mediumPriorityWeight;
    } else {
      rawPoints += APP_CONFIG.scoring.lowPriorityWeight;
    }
  }

  const score = Math.min(100, Math.max(0, rawPoints));
  const band: RiskPriority =
    score > APP_CONFIG.scoring.mediumBandMaxScore
      ? 'high'
      : score > APP_CONFIG.scoring.lowBandMaxScore
        ? 'medium'
        : 'low';

  return { score, band };
}

/**
 * Builds the combined list of scan-triggered Personalized Best Practices followed
 * by seeded General Digital Safety Best Practices.
 *
 * @param risks - Detected `CrossPlatformRisk` list from the audit.
 * @returns Deduplicated array of `BestPracticeRecommendation` items.
 */
export function buildBestPracticesForRisks(
  risks: readonly CrossPlatformRisk[],
): BestPracticeRecommendation[] {
  logFunctionCall('buildBestPracticesForRisks', {
    riskCount: risks.length,
  });

  const seenCategories = new Set<DisclosureCategory>();
  const personalized: BestPracticeRecommendation[] = [];

  for (const risk of risks) {
    if (!seenCategories.has(risk.category)) {
      seenCategories.add(risk.category);
      personalized.push(CATEGORY_PERSONALIZED_TIPS[risk.category]);
    }
  }

  return [...personalized, ...GENERAL_BEST_PRACTICES];
}
