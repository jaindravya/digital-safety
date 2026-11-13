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
  CreatorPost,
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

const RISK_CONNECT_SYSTEM_INSTRUCTION = `You are Stage 2 of Unseen, an AI Counter-OSINT & digital safety assistant for women creators.
Given per-post structured clues from a creator's own photos, binary EXIF metadata scans, drafts, and blog/Substack articles:
1. Group related clues across multiple posts/platforms to detect CUMULATIVE exposure (e.g., spotting the exact same coffee shop window/awning, gym/Pilates studio block, neighborhood name, or recurring weekday/hour routine across multiple posts).
2. ALSO surface standalone single-photo exposures—including:
   - Background street/storefront geo-triangulation: readable restaurant/shop/property blade signs, sidewalk A-frame promo boards (e.g., student discounts naming a campus), street-corner signs, phone numbers on signs, or doorway numbers in the background of an outfit/street photo that combine to pinpoint the exact city block.
   - Hidden EXIF GPS headers, zoom-readable shipping labels/mail, hotel keycard sleeves, or live "right now" drafts.
3. BE HYPER-SPECIFIC—NEVER WRITE VAGUE GENERIC BOILERPLATE!
   - In "title": Name the concrete pattern or background signs caught (e.g., "Background 'Dezer Properties' sign & 'FIT Students 10% Off' sidewalk board pinpoint exact Chelsea block" or "Same Silver Lake coffee shop & Tuesday 8–9 AM Pilates block repeated across 3 posts").
   - In "abstractConfidenceStatement": Start with "With X% confidence, ..." and explicitly cite the EXACT readable background signs/boards, visual cues, repeated coffee shop/studio/neighborhood cues, days/times, and which posts showed them.
   - In "whyItMatters": Explain step-by-step how Googling or combining those exact background signs/boards/numbers lets a stranger triangulate the exact block in seconds.
4. STRICT PRIVACY BOUNDARY: ONLY withhold private residential home street addresses (e.g., "2840 Hyperion Ave"), private apartment/unit numbers ("Apt 4B"), exact hotel room numbers ("Room 612"), and raw decimal GPS coordinates. DO name public restaurant/business/property signs, campus names, neighborhoods, repeated coffee shops/studios, visual objects, floor numbers, and routine times so the creator sees the exact receipts!
5. TWO-TIER CREATOR REMEDIATION IN "recommendedActionSummary":
   - TIER A — SMALL BACKGROUND SIGNS OR PII (when clues include boundingBox regions around small background restaurant/business blade signs, sidewalk A-frame boards, street signs, doorway numbers, mail, badges, or keycards): Explicitly suggest hiding/blurring those small background signs in "Make Post Safer" so the creator keeps her outfit/portrait shot intact without giving away the exact block (and optionally waiting until after leaving the area to post).
   - TIER B — HUGE ICONIC LANDMARKS OR SKYLINES (like the Eiffel Tower, bridges, skylines, or wide exteriors with NO small signs/PII boxed): NEVER tell the creator to blur the landmark! Advise keeping the photo unblurred and simply delaying the post by a few hours or days until after leaving the area, paired with a past-tense caption.`;

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
      title: 'Same corner café & Tuesday 8–9 AM Pilates block repeated across posts',
      why: 'Individually each post looks casual, but matching the café window table & awning photo with the next-door Pilates archway frame and exact weekday/hour mentions reveals where you can be found on future weeks.',
      action:
        'Rewrite captions to remove recurring weekday/hour cues and stagger posting times.',
      reference:
        'RAINN recommends avoiding public disclosure of recurring personal schedules.',
    },
    real_time_location: {
      title: 'Live rooftop DJ set whereabouts ("until 8pm") & VIP wristband exposure',
      why: 'Publishing while still on site—paired with a readable ALL ACCESS wristband and live clock window—tells strangers exactly where to find you right now.',
      action:
        'Hold the draft until after leaving the venue, rewrite "right now" phrasing, and blur the VIP wristband.',
      reference:
        'RAINN advises sharing event locations and geotags only after departing the area.',
    },
    sensitive_document_or_pii: {
      title: 'Hidden EXIF GPS or zoom-readable shipping label in photo',
      why: 'Original camera-roll files can embed invisible EXIF GPS headers and high-resolution parcel labels/barcodes in desk corners that expose private delivery details when zoomed.',
      action:
        'Export an EXIF-stripped PNG and apply Smart Blur over any visible labels, mail, or badges before publishing.',
      reference:
        'Embedded EXIF GPS tags, personal mail, and delivery labels are primary sources of unintentional self-doxxing.',
    },
    travel_or_lodging_clue: {
      title: 'Active 6th-floor hotel check-in & visible keycard sleeve',
      why: 'Sharing an active check-in story naming the floor alongside a printed hotel keycard sleeve inside your carry-on narrows down your temporary room while you are still staying there.',
      action:
        'Blur the hotel keycard sleeve and wait until after checkout to share travel recaps.',
      reference:
        'Creator safety guidelines advise delaying hotel and lodging posts until after checkout.',
    },
    recognizable_surroundings: {
      title: 'Recognizable landmarks or surroundings revealing current area',
      why: 'Iconic landmarks, storefronts, and skyline views immediately identify where a photo was taken—which becomes risky when posted live while you are still in the area.',
      action:
        'No need to blur the landmark—keep your photo intact and simply wait a few hours or 1–2 days until after you have left the area before posting.',
      reference:
        'RAINN digital safety guidance recommends delaying landmark and location-identifiable posts until after departing.',
    },
  };

  const rawRisks: CrossPlatformRisk[] = [];
  for (const [category, group] of grouped.entries()) {
    const meta = categoryCopy[category];
    const evidenceJoined = group.summaries.join(' ');
    const postCount = group.postIds.size;
    const itemNoun = postCount === 1 ? '1 item' : `${postCount} items`;
    rawRisks.push({
      id: `risk-${category}`,
      title: meta.title,
      category,
      priority: 'medium',
      confidencePercentage: group.maxConfidence,
      abstractConfidenceStatement: `With ${group.maxConfidence}% confidence, connected clues across ${itemNoun} reveal this pattern: ${evidenceJoined}`,
      contributingPostIds: [...group.postIds],
      platformsInvolved: [...group.platforms],
      whyItMatters: meta.why,
      combinedEvidenceSummary: evidenceJoined,
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
 * linking concrete visual, metadata, and prose evidence across camera-roll photos,
 * social posts, and blog/Substack articles.
 *
 * @param findings - Stage 1 `PostDisclosureFinding[]` array.
 * @param executor - Optional injectable Gemini executor for unit testing.
 * @param posts - Optional original `CreatorPost[]` list providing post titles & timestamps for specific citations.
 * @returns Calibrated `CrossPlatformRisk[]` plus fallback indicator.
 */
export async function connectCrossPlatformRisks(
  findings: readonly PostDisclosureFinding[],
  executor?: GenAiStructuredExecutor,
  posts?: readonly CreatorPost[],
): Promise<{
  readonly risks: CrossPlatformRisk[];
  readonly usedFallback: boolean;
}> {
  logFunctionCall('connectCrossPlatformRisks', {
    findingsCount: findings.length,
    postContextCount: posts?.length ?? 0,
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
    const postById = new Map((posts ?? []).map((p) => [p.id, p]));
    const enrichedFindings = nonEmptyFindings.map((f) => {
      const meta = postById.get(f.postId);
      return {
        postId: f.postId,
        platform: f.platform,
        postTitle: meta?.title,
        postedAtLabel: meta?.postedAtLabel,
        isDraft: meta?.isDraft,
        clues: f.clues,
      };
    });
    const promptPayload = JSON.stringify(enrichedFindings, null, 2);
    const parsed = await generateStructuredJson<RawRiskSynthesisResponse>(
      {
        stage: 'Stage2_CrossPlatformRiskSynthesis',
        model: APP_CONFIG.genai.riskConnectModel,
        systemInstruction: RISK_CONNECT_SYSTEM_INSTRUCTION,
        contents: [
          {
            text: `Connect cumulative and standalone privacy risks across these creator post findings, citing exact post titles, repeated coffee shops/studios/neighborhoods, days/times, and specific visual cues:\n${promptPayload}`,
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
