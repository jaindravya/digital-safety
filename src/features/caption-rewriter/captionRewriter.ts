/**
 * @file src/features/caption-rewriter/captionRewriter.ts
 * @description Stage 3 voice-preserving pre-post fix planner powered by Google Gemini.
 *
 * Feature Overview:
 * Instead of telling women creators to stop sharing their lives or delete everything,
 * Stage 3 helps them publish *safely* while keeping their authentic tone and aesthetic.
 * Given a flagged `CreatorPost`, its associated `CrossPlatformRisk`, and any Stage 1
 * visual bounding boxes, this module generates:
 *   1. Three natural caption alternatives (`Warm & Casual`, `Editorial Minimal`,
 *      `Post-Event Recap`) that strip real-time or predictable schedule cues.
 *   2. Suggested visual redaction boxes (`suggestedRegionsToRedact`) ready for one-tap
 *      Smart Blur or Crop on Android and Mac.
 *   3. Concrete publish-timing guidance and a plain-English pre-post checklist, all
 *      passed through `enforceFixPlanAntiDoxxing`.
 *
 * Primary Use Cases:
 * 1. Opening "Make This Post Safer" on a flagged camera-roll photo or live event draft.
 * 2. Comparing Original vs. Safer caption rewrites in the Before/After Fix Studio.
 */

import { Schema, Type } from '@google/genai';
import { APP_CONFIG } from '../../config/appConfig';
import {
  CreatorPost,
  CrossPlatformRisk,
  NormalizedBoundingBox,
  PostDisclosureFinding,
  SafePostFixPlan,
} from '../../domain/privacyTypes';
import { enforceFixPlanAntiDoxxing } from '../guardrails/antiDoxxingGuardrail';
import {
  assertOwnershipAttestation,
  OwnershipAttestation,
} from '../guardrails/ownershipConsent';
import {
  GenAiStructuredExecutor,
  generateStructuredJson,
  hasConfiguredGeminiApiKey,
} from '../../genai/geminiClient';
import { logFunctionCall, logGenAiCall } from '../../logging/logger';

interface RawFixPlanResponse {
  captionOptions?: Array<{
    id: string;
    styleLabel: string;
    rewrittenCaption: string;
    whatChanged: string;
  }>;
  timingRecommendation?: string;
  plainLanguageChecklist?: string[];
}

const CAPTION_REWRITE_SYSTEM_INSTRUCTION = `You are Stage 3 of Unseen, a creator-friendly privacy studio assistant.
Rewrite the creator's caption into 3 natural alternatives that preserve her warm, authentic creator personality while removing:
- real-time location cues ("right now", "until 8pm", "come find me")
- recurring weekly day/hour routines ("every Tuesday at 8am")
- references to mail, apartment/floor numbers, or hotel check-ins.

CRITICAL SAFETY RULE: Never include street addresses, room numbers, venue names, or coordinates in any option or explanation.`;

const CAPTION_REWRITE_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    captionOptions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          styleLabel: { type: Type.STRING },
          rewrittenCaption: { type: Type.STRING },
          whatChanged: { type: Type.STRING },
        },
        required: ['id', 'styleLabel', 'rewrittenCaption', 'whatChanged'],
      },
    },
    timingRecommendation: { type: Type.STRING },
    plainLanguageChecklist: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['captionOptions', 'timingRecommendation', 'plainLanguageChecklist'],
};

/**
 * Collects all normalized `[ymin, xmin, ymax, xmax]` bounding boxes detected for a
 * given `postId` during Stage 1 scanning.
 *
 * @param postFinding - Optional Stage 1 `PostDisclosureFinding` for the target post.
 * @returns Array of `NormalizedBoundingBox` regions requiring visual blur/crop.
 */
export function extractRedactionBoxesFromFinding(
  postFinding?: PostDisclosureFinding,
): NormalizedBoundingBox[] {
  logFunctionCall('extractRedactionBoxesFromFinding', {
    postId: postFinding?.postId ?? null,
    clueCount: postFinding?.clues.length ?? 0,
  });

  if (!postFinding) {
    return [];
  }

  return postFinding.clues
    .map((clue) => clue.boundingBox)
    .filter((box): box is NormalizedBoundingBox => Boolean(box));
}

/**
 * Generates a deterministic creator-voice `SafePostFixPlan` when offline or when
 * running without a live `GEMINI_API_KEY`.
 *
 * @param post - Target `CreatorPost` being edited in the Fix Studio.
 * @param risk - Associated `CrossPlatformRisk` being addressed.
 * @param redactionBoxes - Visual bounding boxes extracted in Stage 1.
 * @returns Guardrail-sanitized `SafePostFixPlan`.
 */
export function buildFallbackFixPlan(
  post: CreatorPost,
  risk: CrossPlatformRisk,
  redactionBoxes: readonly NormalizedBoundingBox[],
): SafePostFixPlan {
  logFunctionCall('buildFallbackFixPlan', {
    postId: post.id,
    riskId: risk.id,
    redactionBoxCount: redactionBoxes.length,
  });

  const planByCategory: SafePostFixPlan = (() => {
    if (risk.category === 'real_time_location') {
      return {
        postId: post.id,
        riskId: risk.id,
        captionOptions: [
          {
            id: 'opt-recap',
            styleLabel: 'Golden Hour Recap (Recommended)',
            rewrittenCaption:
              'Golden hour behind the decks—still dreaming about this sunset energy ✨🎶',
            whatChanged:
              'Shifted live "right now until 8pm" invitation into a timeless post-set recap.',
          },
          {
            id: 'opt-minimal',
            styleLabel: 'Editorial Minimal',
            rewrittenCaption: 'Sunset frequencies & skyline light.',
            whatChanged: 'Removed live venue window and neighborhood tag.',
          },
          {
            id: 'opt-warm',
            styleLabel: 'Warm Community Note',
            rewrittenCaption:
              'Grateful for everyone who danced through sunset with me this week!',
            whatChanged: 'Preserves warmth while posting safely after leaving.',
          },
        ],
        suggestedRegionsToRedact: redactionBoxes,
        timingRecommendation:
          'Publish tomorrow afternoon (at least 12–24 hours after leaving the venue).',
        plainLanguageChecklist: [
          'Apply Smart Blur over the VIP access wristband in the lower-left corner',
          'Switch caption from live "right now" phrasing to a past-tense recap',
          'Wait until after departing the venue before publishing',
        ],
      };
    }

    if (risk.category === 'sensitive_document_or_pii') {
      return {
        postId: post.id,
        riskId: risk.id,
        captionOptions: [
          {
            id: 'opt-studio',
            styleLabel: 'Creator Studio Vibe (Recommended)',
            rewrittenCaption:
              'Editing marathon with fresh studio audio—deep in vlog cut mode today 🎧',
            whatChanged:
              'Removed mention of home mail delivery and paired with parcel label redaction.',
          },
          {
            id: 'opt-minimal',
            styleLabel: 'Clean Aesthetic',
            rewrittenCaption: 'Afternoon edit desk essentials.',
            whatChanged: 'Short editorial caption keeping focus on creative gear.',
          },
          {
            id: 'opt-cozy',
            styleLabel: 'Cozy Workday',
            rewrittenCaption: 'Iced coffee + timeline trims for Episode 15.',
            whatChanged: 'Preserves casual tone with zero delivery clues.',
          },
        ],
        suggestedRegionsToRedact: redactionBoxes,
        timingRecommendation: 'Safe to publish immediately once parcel label is blurred.',
        plainLanguageChecklist: [
          'Blur or crop the parcel shipping label & barcode in the lower-right corner',
          'Double-check high-res zoom before exporting to camera roll',
        ],
      };
    }

    if (risk.category === 'travel_or_lodging_clue') {
      return {
        postId: post.id,
        riskId: risk.id,
        captionOptions: [
          {
            id: 'opt-post-trip',
            styleLabel: 'Post-Trip Reset (Recommended)',
            rewrittenCaption:
              'Weekend creative retreat recap—packed light and wrote three new drafts ☕️🤍',
            whatChanged:
              'Removed active check-in status and specific floor number.',
          },
          {
            id: 'opt-minimal',
            styleLabel: 'Weekend Palette',
            rewrittenCaption: 'Carry-on neutrals & slow morning light.',
            whatChanged: 'Strips live stay timing and floor cue.',
          },
          {
            id: 'opt-reflective',
            styleLabel: 'Reflective Note',
            rewrittenCaption:
              'Home from a quiet weekend offline—feeling recharged for the week ahead.',
            whatChanged: 'Explicitly signals the stay has already ended.',
          },
        ],
        suggestedRegionsToRedact: redactionBoxes,
        timingRecommendation: 'Hold until after hotel checkout.',
        plainLanguageChecklist: [
          'Blur the printed hotel keycard sleeve & Wi-Fi code',
          'Remove floor number from caption',
          'Publish after checking out of the property',
        ],
      };
    }

    return {
      postId: post.id,
      riskId: risk.id,
      captionOptions: [
        {
          id: 'opt- timeless',
          styleLabel: 'Routine-Safe Creator Voice (Recommended)',
          rewrittenCaption:
            'Slow morning matcha & notebook pages before movement class 🍵',
          whatChanged:
            'Removed exact weekday ("Tuesday") and clock window ("8–9am") that linked across posts.',
        },
        {
          id: 'opt-minimal',
          styleLabel: 'Minimal Ritual',
          rewrittenCaption: 'Iced matcha & quiet morning pages.',
          whatChanged: 'Keeps the aesthetic ritual without predictable schedule cues.',
        },
        {
          id: 'opt-editorial',
          styleLabel: 'Newsletter Teaser',
          rewrittenCaption:
            'Drafting this week’s essay with a cold matcha in hand—new issue out soon.',
          whatChanged: 'Disconnects writing habit from a recurring neighborhood time slot.',
        },
      ],
      suggestedRegionsToRedact: redactionBoxes,
      timingRecommendation:
        'Stagger posting days so morning rituals do not map to a fixed weekday.',
      plainLanguageChecklist: [
        'Remove specific weekday and hour references from the caption/article',
        'Avoid pairing exterior storefront signage with recurring schedule notes',
      ],
    };
  })();

  const hasExifClue =
    Boolean(post.exifScanSummary?.hasExifMetadata) ||
    post.postedAtLabel.toLowerCase().includes('exif');

  const planWithExifStep: SafePostFixPlan = hasExifClue
    ? {
        ...planByCategory,
        plainLanguageChecklist: [
          ...planByCategory.plainLanguageChecklist,
          'Download the protected PNG export so hidden EXIF GPS & capture-time headers remain completely stripped',
        ],
      }
    : planByCategory;

  const safePlan = enforceFixPlanAntiDoxxing(planWithExifStep);

  logGenAiCall({
    stage: `Stage3_VoicePreservingFixPlan[${post.id}]`,
    model: APP_CONFIG.genai.captionRewriteModel,
    prompt: { postId: post.id, caption: post.caption, riskCategory: risk.category },
    config: {
      temperature: APP_CONFIG.genai.captionRewriteTemperature,
      fallbackReason: 'Missing API key or offline fallback active',
    },
    output: safePlan,
    durationMs: 2,
    usedFallback: true,
  });

  return safePlan;
}

/**
 * Generates a Stage 3 `SafePostFixPlan` combining voice-preserving caption rewrites,
 * Stage 1 visual redaction regions, and publish-timing recommendations.
 *
 * @param params - Target post, risk, optional Stage 1 finding, ownership attestation, and optional test executor.
 * @returns Sanitized `SafePostFixPlan` ready for interactive preview in the Fix Studio.
 */
export async function generateSafePostFixPlan(params: {
  readonly post: CreatorPost;
  readonly risk: CrossPlatformRisk;
  readonly postFinding?: PostDisclosureFinding;
  readonly attestation: OwnershipAttestation;
  readonly executor?: GenAiStructuredExecutor;
}): Promise<SafePostFixPlan> {
  logFunctionCall('generateSafePostFixPlan', {
    postId: params.post.id,
    riskId: params.risk.id,
    platform: params.post.platform,
  });

  assertOwnershipAttestation(params.attestation);
  const redactionBoxes = extractRedactionBoxesFromFinding(params.postFinding);
  const canCallLiveModel =
    Boolean(params.executor) || hasConfiguredGeminiApiKey();

  if (!canCallLiveModel && APP_CONFIG.genai.enableDemoFallbackOnMissingKey) {
    return buildFallbackFixPlan(params.post, params.risk, redactionBoxes);
  }

  try {
    const promptText = [
      `Platform: ${params.post.platform} (Draft: ${params.post.isDraft})`,
      `Original Caption / Excerpt:\n${params.post.caption}`,
      `Flagged Risk Category: ${params.risk.category}`,
      `Why It Matters: ${params.risk.whyItMatters}`,
      `Visual Regions Flagged for Blur: ${redactionBoxes.map((b) => b.label).join(', ') || 'None'}`,
    ].join('\n\n');

    const parsed = await generateStructuredJson<RawFixPlanResponse>(
      {
        stage: `Stage3_VoicePreservingFixPlan[${params.post.id}]`,
        model: APP_CONFIG.genai.captionRewriteModel,
        systemInstruction: CAPTION_REWRITE_SYSTEM_INSTRUCTION,
        contents: [{ text: promptText }],
        temperature: APP_CONFIG.genai.captionRewriteTemperature,
        responseSchema: CAPTION_REWRITE_RESPONSE_SCHEMA,
      },
      params.executor,
    );

    const hasExifMetadata =
      Boolean(params.post.exifScanSummary?.hasExifMetadata) ||
      Boolean(
        params.postFinding?.clues.some((c) => /exif/i.test(c.summary)),
      );
    const rawChecklist = parsed.plainLanguageChecklist ?? [];
    const enrichedChecklist =
      hasExifMetadata &&
      !rawChecklist.some((item) => /exif/i.test(item))
        ? [
            ...rawChecklist,
            'Export clean PNG from Fix Studio so hidden EXIF GPS & capture-time headers remain completely stripped',
          ]
        : rawChecklist;

    const candidatePlan: SafePostFixPlan = {
      postId: params.post.id,
      riskId: params.risk.id,
      captionOptions: parsed.captionOptions ?? [],
      suggestedRegionsToRedact: redactionBoxes,
      timingRecommendation:
        parsed.timingRecommendation ??
        'Publish after leaving the location and stagger routine days.',
      plainLanguageChecklist: enrichedChecklist,
    };

    return enforceFixPlanAntiDoxxing(candidatePlan);
  } catch (error) {
    if (APP_CONFIG.genai.enableDemoFallbackOnMissingKey && !params.executor) {
      return buildFallbackFixPlan(params.post, params.risk, redactionBoxes);
    }
    throw error;
  }
}
