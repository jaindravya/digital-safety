/**
 * @file src/features/risk-connector/riskConnector.ts
 * @description Stage 2 cross-platform privacy risk synthesizer powered by Google Gemini.
 *
 * Feature Overview:
 * Single-post scanners miss the biggest real-world threat to creators: *cumulative*
 * exposure across multiple harmless-looking posts and articles. Stage 2 takes all
 * structured `PostDisclosureFinding` outputs from Stage 1 (camera-roll photos,
 * Instagram/YouTube posts, Substack/blog articles, and drafts) and synthesizes
 * connected `CrossPlatformRisk` warnings—linking contributing post IDs, platforms,
 * RAINN-aligned digital safety context, and privacy-preserving `"With X% confidence..."`
 * insights without ever outputting inferred street addresses or venue names.
 *
 * Primary Use Cases:
 * 1. Connecting routine clues across camera-roll photos and a Substack/blog article.
 * 2. Highlighting high-priority single-post PII or real-time location drafts alongside
 *    multi-post patterns.
 * 3. Deterministically calibrating priorities and confidence statements via `riskScoringEngine`.
 */

import { Schema, Type } from '@google/genai';
import { APP_CONFIG } from '../../config/appConfig';
import {
  CreatorPlatform,
  CrossPlatformRisk,
  DisclosureCategory,
  PostDisclosureFinding,
  RiskPriority,
} from '../../domain/privacyTypes';
import {
  GenAiStructuredExecutor,
  generateStructuredJson,
  hasConfiguredGeminiApiKey,
} from '../../genai/geminiClient';
import { logFunctionCall, logGenAiCall } from '../../logging/logger';
import { calibrateCrossPlatformRisks } from './riskScoringEngine';

interface RawRiskSynthesisResponse {
  risks?: Array<{
    id: string;
    title: string;
    category: DisclosureCategory;
    priority: RiskPriority;
    confidencePercentage: number;
    abstractConfidenceStatement: string;
    contributingPostIds: string[];
    platformsInvolved: CreatorPlatform[];
    whyItMatters: string;
    combinedEvidenceSummary: string;
    recommendedActionSummary: string;
    safetyReferenceNote: string;
  }>;
}

const RISK_CONNECT_SYSTEM_INSTRUCTION = `You are Stage 2 of Unseen, an AI digital safety assistant for women creators.
Given per-post structured clues from a creator's own photos, drafts, and blog/Substack articles:
1. Group related clues across multiple posts/platforms to detect CUMULATIVE exposure (especially recurring weekly routines or repeated neighborhood surroundings).
2. Also surface urgent standalone exposures (visible mail/shipping labels, hotel keycards, or live "right now" drafts).
3. For every risk, write an abstractConfidenceStatement starting with "With X% confidence, ..." that communicates what pattern can be inferred WITHOUT EVER naming specific street addresses, apartment/room numbers,venue names, or coordinates.
4. Reference practical creator safety guidance (such as RAINN's recommendation to delay location sharing until after leaving a venue and avoid publishing predictable schedules).`;

const RISK_CONNECT_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    risks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          category: {
            type: Type.STRING,
            enum: [
              'predictable_routine',
              'real_time_location',
              'sensitive_document_or_pii',
              'recognizable_surroundings',
              'travel_or_lodging_clue',
            ],
          },
          priority: {
            type: Type.STRING,
            enum: ['high', 'medium', 'low'],
          },
          confidencePercentage: { type: Type.INTEGER },
          abstractConfidenceStatement: { type: Type.STRING },
          contributingPostIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          platformsInvolved: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
              enum: [
                'camera_roll',
                'instagram',
                'youtube',
                'substack',
                'blog',
                'draft',
              ],
            },
          },
          whyItMatters: { type: Type.STRING },
          combinedEvidenceSummary: { type: Type.STRING },
          recommendedActionSummary: { type: Type.STRING },
          safetyReferenceNote: { type: Type.STRING },
        },
        required: [
          'id',
          'title',
          'category',
          'priority',
          'confidencePercentage',
          'abstractConfidenceStatement',
          'contributingPostIds',
          'platformsInvolved',
          'whyItMatters',
          'combinedEvidenceSummary',
          'recommendedActionSummary',
          'safetyReferenceNote',
        ],
      },
    },
  },
  required: ['risks'],
};

/**
 * Deterministic fallback clustering Stage 1 `PostDisclosureFinding` items by
 * category when running offline or without a `GEMINI_API_KEY`.
 *
 * @param findings - Per-post findings produced in Stage 1.
 * @returns Calibrated `CrossPlatformRisk[]` connecting contributing posts and platforms.
 */
export function buildFallbackConnectedRisks(
  findings: readonly PostDisclosureFinding[],
): CrossPlatformRisk[] {
  logFunctionCall('buildFallbackConnectedRisks', {
    findingsCount: findings.length,
  });

  const grouped = new Map<
    DisclosureCategory,
    {
      postIds: Set<string>;
      platforms: Set<CreatorPlatform>;
      summaries: string[];
      maxConfidence: number;
    }
  >();

  for (const finding of findings) {
    for (const clue of finding.clues) {
      const entry = grouped.get(clue.category) ?? {
        postIds: new Set<string>(),
        platforms: new Set<CreatorPlatform>(),
        summaries: [],
        maxConfidence: 82,
      };
      entry.postIds.add(finding.postId);
      entry.platforms.add(finding.platform);
      entry.summaries.push(clue.summary);
      if (typeof clue.confidencePercentage === 'number') {
        entry.maxConfidence = Math.max(entry.maxConfidence, clue.confidencePercentage);
      }
      grouped.set(clue.category, entry);
    }
  }

  const categoryCopy: Readonly<
    Record<
      DisclosureCategory,
      { title: string; why: string; action: string; reference: string }
    >
  > = {
    predictable_routine: {
      title: 'Predictable weekly schedule across platforms',
      why: 'Individually each post looks casual, but combining café window visuals, studio exteriors, and newsletter day/time mentions reveals where you will be on future weeks.',
      action:
        'Rewrite captions to remove recurring weekday/hour cues and stagger posting times.',
      reference:
        'RAINN recommends avoiding public disclosure of recurring personal schedules.',
    },
    real_time_location: {
      title: 'Real-time event whereabouts & credential exposure',
      why: 'Publishing while still at an active venue—paired with a visible access wristband—lets strangers know you are on site right now.',
      action:
        'Hold the draft until after leaving the venue, rewrite "right now" phrasing, and blur the VIP wristband.',
      reference:
        'RAINN advises sharing event locations and geotags only after departing the area.',
    },
    sensitive_document_or_pii: {
      title: 'Readable shipping label in background flatlay',
      why: 'High-resolution desk photos allow viewers to zoom into parcel labels and barcodes containing residential delivery information.',
      action:
        'Apply Smart Blur or crop over the lower-right parcel envelope before publishing.',
      reference:
        'Personal mail, barcodes, and delivery labels are primary sources of unintentional self-doxxing.',
    },
    travel_or_lodging_clue: {
      title: 'Active hotel stay & keycard sleeve exposure',
      why: 'Sharing a check-in story with a visible printed room card sleeve and floor cue reveals active temporary lodging.',
      action:
        'Blur the hotel keycard sleeve and wait until after checkout to share travel recaps.',
      reference:
        'Creator safety guidelines advise delaying hotel and lodging posts until after checkout.',
    },
    recognizable_surroundings: {
      title: 'Repeated neighborhood exterior landmarks',
      why: 'Distinctive storefronts and window views across posts can narrow down a frequented neighborhood block.',
      action: 'Crop tighter on the subject or blur exterior signage.',
      reference:
        'Cross-post visual landmarks compound quickly when paired with timestamps.',
    },
  };

  const rawRisks: CrossPlatformRisk[] = [];
  for (const [category, group] of grouped.entries()) {
    const meta = categoryCopy[category];
    rawRisks.push({
      id: `risk-${category}`,
      title: meta.title,
      category,
      priority: 'medium',
      confidencePercentage: group.maxConfidence,
      contributingPostIds: [...group.postIds],
      platformsInvolved: [...group.platforms],
      whyItMatters: meta.why,
      combinedEvidenceSummary: group.summaries.join(' '),
      recommendedActionSummary: meta.action,
      safetyReferenceNote: meta.reference,
      status: 'needs_review',
    });
  }

  const calibrated = calibrateCrossPlatformRisks(rawRisks);

  logGenAiCall({
    stage: 'Stage2_CrossPlatformRiskSynthesis',
    model: APP_CONFIG.genai.riskConnectModel,
    prompt: findings,
    config: {
      temperature: APP_CONFIG.genai.riskConnectTemperature,
      fallbackReason: 'Missing API key or offline fallback active',
    },
    output: calibrated,
    durationMs: 2,
    usedFallback: true,
  });

  return calibrated;
}

/**
 * Synthesizes Stage 1 per-post findings into calibrated `CrossPlatformRisk` items
 * linking evidence across camera-roll photos, social posts, and blog/Substack articles.
 *
 * @param findings - Stage 1 `PostDisclosureFinding[]` array.
 * @param executor - Optional injectable Gemini executor for unit testing.
 * @returns Calibrated `CrossPlatformRisk[]` plus fallback indicator.
 */
export async function connectCrossPlatformRisks(
  findings: readonly PostDisclosureFinding[],
  executor?: GenAiStructuredExecutor,
): Promise<{
  readonly risks: CrossPlatformRisk[];
  readonly usedFallback: boolean;
}> {
  logFunctionCall('connectCrossPlatformRisks', {
    findingsCount: findings.length,
  });

  const nonEmptyFindings = findings.filter((f) => f.clues.length > 0);
  if (nonEmptyFindings.length === 0) {
    return { risks: [], usedFallback: false };
  }

  const canCallLiveModel = Boolean(executor) || hasConfiguredGeminiApiKey();
  if (!canCallLiveModel && APP_CONFIG.genai.enableDemoFallbackOnMissingKey) {
    return {
      risks: buildFallbackConnectedRisks(nonEmptyFindings),
      usedFallback: true,
    };
  }

  try {
    const promptPayload = JSON.stringify(nonEmptyFindings, null, 2);
    const parsed = await generateStructuredJson<RawRiskSynthesisResponse>(
      {
        stage: 'Stage2_CrossPlatformRiskSynthesis',
        model: APP_CONFIG.genai.riskConnectModel,
        systemInstruction: RISK_CONNECT_SYSTEM_INSTRUCTION,
        contents: [
          {
            text: `Connect cumulative privacy risks across these creator post findings:\n${promptPayload}`,
          },
        ],
        temperature: APP_CONFIG.genai.riskConnectTemperature,
        responseSchema: RISK_CONNECT_RESPONSE_SCHEMA,
      },
      executor,
    );

    const mapped: CrossPlatformRisk[] = (parsed.risks ?? []).map((risk) => ({
      ...risk,
      status: 'needs_review' as const,
    }));

    return {
      risks: calibrateCrossPlatformRisks(mapped),
      usedFallback: false,
    };
  } catch (error) {
    if (APP_CONFIG.genai.enableDemoFallbackOnMissingKey && !executor) {
      return {
        risks: buildFallbackConnectedRisks(nonEmptyFindings),
        usedFallback: true,
      };
    }
    throw error;
  }
}
