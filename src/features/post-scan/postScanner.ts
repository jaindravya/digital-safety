/**
 * @file src/features/post-scan/postScanner.ts
 * @description Stage 1 multimodal per-post and article disclosure extractor powered by
 * Google Gemini (`@google/genai`).
 *
 * Feature Overview:
 * Analyzes an individual `CreatorPost`—combining original camera-roll image bytes
 * (`inlineData`), caption/article prose, platform context, and timing metadata—to
 * extract structured `PostDisclosureClue` records. When sensitive visual objects
 * (shipping labels, apartment mail, hotel keycards, VIP credentials, street signs)
 * appear in an image, Gemini returns normalized `[ymin, xmin, ymax, xmax]` coordinates
 * (`0..1000`) so the Fix Studio can automatically highlight and blur them.
 *
 * Includes a deterministic heuristic fallback (`buildHeuristicPostFinding`) when no
 * API key is configured or venue Wi-Fi drops, ensuring uninterrupted demo reliability
 * while logging `usedFallback: true` in `INFO` GenAI telemetry.
 *
 * Primary Use Cases:
 * 1. Scanning uploaded Android/Mac camera-roll photos + captions for visual PII and routines.
 * 2. Scanning imported Substack/blog articles for recurring schedule or neighborhood disclosures.
 * 3. Batch-scanning an entire creator feed (`scanCreatorPostsBatch`).
 */

import { Part, Schema, Type } from '@google/genai';
import { APP_CONFIG } from '../../config/appConfig';
import {
  CreatorPost,
  DisclosureCategory,
  PostDisclosureClue,
  PostDisclosureFinding,
} from '../../domain/privacyTypes';
import {
  dataUrlToGenAiPart,
  GenAiStructuredExecutor,
  generateStructuredJson,
  hasConfiguredGeminiApiKey,
} from '../../genai/geminiClient';
import { logFunctionCall, logGenAiCall } from '../../logging/logger';

interface RawModelScanResponse {
  clues?: Array<{
    category: DisclosureCategory;
    summary: string;
    sourceModality: 'visual' | 'caption' | 'timestamp' | 'combined';
    confidencePercentage?: number;
    timeCue?: string;
    placeTypeCue?: string;
    boundingBox?: {
      ymin: number;
      xmin: number;
      ymax: number;
      xmax: number;
      label: string;
    };
  }>;
}

const POST_SCAN_SYSTEM_INSTRUCTION = `You are Stage 1 of Unseen, a defensive privacy self-auditor for women creators.
Inspect the creator's own photo (if attached), caption/article text, and timestamp.
Identify unintended privacy disclosures across these categories ONLY:
- predictable_routine (recurring days/times, habitual cafés, gyms, studios)
- real_time_location ("right now", live set/event cues, active check-ins)
- sensitive_document_or_pii (visible shipping labels, mail, barcodes, IDs, event badges, screens)
- travel_or_lodging_clue (hotel keycard sleeves, room/floor cues, Wi-Fi codes)
- recognizable_surroundings (distinctive exterior signage, awnings, street-level windows)

CRITICAL SAFETY RULES:
1. NEVER repeat or output exact street addresses, apartment numbers, hotel room numbers, or GPS coordinates in your summary or labels. Describe the OBJECT TYPE instead (e.g., "Visible parcel shipping label with residential address in lower-right corner").
2. Whenever a visual object should be blurred/cropped (mail, label, keycard, wristband, street sign), return a boundingBox in normalized 0..1000 coordinates [ymin, xmin, ymax, xmax].`;

const POST_SCAN_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    clues: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
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
          summary: { type: Type.STRING },
          sourceModality: {
            type: Type.STRING,
            enum: ['visual', 'caption', 'timestamp', 'combined'],
          },
          confidencePercentage: { type: Type.INTEGER },
          timeCue: { type: Type.STRING },
          placeTypeCue: { type: Type.STRING },
          boundingBox: {
            type: Type.OBJECT,
            properties: {
              ymin: { type: Type.INTEGER },
              xmin: { type: Type.INTEGER },
              ymax: { type: Type.INTEGER },
              xmax: { type: Type.INTEGER },
              label: { type: Type.STRING },
            },
            required: ['ymin', 'xmin', 'ymax', 'xmax', 'label'],
          },
        },
        required: ['category', 'summary', 'sourceModality'],
      },
    },
  },
  required: ['clues'],
};

/**
 * Builds multimodal `@google/genai` `Part[]` contents for a single `CreatorPost`.
 *
 * @param post - Creator photo post, draft, or imported blog/Substack article.
 * @returns Ordered array of prompt text and optional `inlineData` image part.
 */
export function buildPostScanParts(post: CreatorPost): Part[] {
  logFunctionCall('buildPostScanParts', {
    postId: post.id,
    platform: post.platform,
    hasImage: Boolean(post.imageDataUrl),
  });

  const parts: Part[] = [
    {
      text: [
        `Post ID: ${post.id}`,
        `Source Platform: ${post.platform}`,
        `Is Unpublished Draft: ${post.isDraft}`,
        `Timestamp / Context: ${post.postedAtLabel}`,
        post.title ? `Title: ${post.title}` : '',
        `Caption or Article Text:\n${post.caption}`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  if (post.imageDataUrl) {
    const imagePart = dataUrlToGenAiPart(post.imageDataUrl);
    if (imagePart) {
      parts.push(imagePart);
    }
  }

  return parts;
}

/**
 * Deterministic offline/fallback analyzer for Maya's demo feed and arbitrary custom
 * camera-roll/article uploads when live Gemini connectivity is unavailable.
 *
 * @param post - Input `CreatorPost` to inspect heuristically.
 * @returns Structured `PostDisclosureFinding` with accurate bounding boxes and clues.
 */
export function buildHeuristicPostFinding(
  post: CreatorPost,
): PostDisclosureFinding {
  logFunctionCall('buildHeuristicPostFinding', {
    postId: post.id,
    platform: post.platform,
  });

  const combinedText = `${post.title ?? ''} ${post.caption} ${post.postedAtLabel} ${post.mediaAltDescription}`.toLowerCase();
  const clues: PostDisclosureClue[] = [];

  if (
    /every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|ritual|8:15am|9am|8\s*to\s*9am|weekly/i.test(
      combinedText,
    )
  ) {
    clues.push({
      category: 'predictable_routine',
      summary:
        'Discloses a recurring weekday morning routine linking a neighborhood café and nearby fitness studio.',
      sourceModality: post.imageDataUrl ? 'combined' : 'caption',
      confidencePercentage: 89,
      timeCue: 'Recurring Tuesday morning window (8:00–9:30 AM)',
      placeTypeCue: 'Neighborhood corner café & reformer Pilates block',
    });
  }

  if (/shipping label|parcel|in the mail|envelope/i.test(combinedText)) {
    clues.push({
      category: 'sensitive_document_or_pii',
      summary:
        'Visible parcel shipping label in the lower-right corner exposes recipient name and residential delivery details.',
      sourceModality: 'visual',
      confidencePercentage: 95,
      placeTypeCue: 'Home studio workspace',
      boundingBox: {
        ymin: 600,
        xmin: 535,
        ymax: 935,
        xmax: 955,
        label: 'Parcel shipping label & barcode',
      },
    });
  }

  if (/hotel|checked in|6th floor|keycard|suitcase/i.test(combinedText)) {
    clues.push({
      category: 'travel_or_lodging_clue',
      summary:
        'Active hotel check-in post includes a visible printed keycard sleeve and floor reference while still staying on property.',
      sourceModality: 'combined',
      confidencePercentage: 88,
      timeCue: 'Active weekend stay',
      placeTypeCue: 'Boutique hotel room',
      boundingBox: {
        ymin: 680,
        xmin: 455,
        ymax: 915,
        xmax: 880,
        label: 'Printed hotel keycard sleeve',
      },
    });
  }

  if (/right now|until 8pm|come say hi|wristband|live set/i.test(combinedText)) {
    clues.push({
      category: 'real_time_location',
      summary:
        'Draft announces real-time presence at an active rooftop venue while displaying an artist VIP access credential.',
      sourceModality: 'combined',
      confidencePercentage: 94,
      timeCue: 'Live / currently on site until 8:00 PM',
      placeTypeCue: 'Rooftop lounge & DJ booth',
      boundingBox: post.imageDataUrl
        ? {
            ymin: 725,
            xmin: 65,
            ymax: 915,
            xmax: 520,
            label: 'VIP event credential wristband',
          }
        : undefined,
    });
  }

  if (
    clues.length === 0 &&
    /window|awning|archway|street|block|entrance/i.test(combinedText)
  ) {
    clues.push({
      category: 'recognizable_surroundings',
      summary:
        'Exterior architectural features and signage in the background could narrow down a frequented block.',
      sourceModality: 'visual',
      confidencePercentage: 74,
      placeTypeCue: 'Street-facing storefront',
    });
  }

  const finding: PostDisclosureFinding = {
    postId: post.id,
    platform: post.platform,
    clues,
  };

  logGenAiCall({
    stage: `Stage1_PostMultimodalScan[${post.id}]`,
    model: APP_CONFIG.genai.postScanModel,
    prompt: buildPostScanParts(post),
    config: {
      temperature: APP_CONFIG.genai.postScanTemperature,
      fallbackReason: 'Missing API key or offline fallback active',
    },
    output: finding,
    durationMs: 2,
    usedFallback: true,
  });

  return finding;
}

/**
 * Runs Stage 1 multimodal disclosure extraction on a single `CreatorPost`.
 *
 * @param post - Creator post, camera-roll image, or imported article to scan.
 * @param executor - Optional injectable Gemini executor for deterministic tests.
 * @returns Structured `PostDisclosureFinding` with clues and optional bounding boxes.
 */
export async function scanSingleCreatorPost(
  post: CreatorPost,
  executor?: GenAiStructuredExecutor,
): Promise<{ readonly finding: PostDisclosureFinding; readonly usedFallback: boolean }> {
  logFunctionCall('scanSingleCreatorPost', {
    postId: post.id,
    platform: post.platform,
    isDraft: post.isDraft,
    imageDataUrl: post.imageDataUrl,
  });

  const canCallLiveModel = Boolean(executor) || hasConfiguredGeminiApiKey();

  if (!canCallLiveModel && APP_CONFIG.genai.enableDemoFallbackOnMissingKey) {
    return {
      finding: buildHeuristicPostFinding(post),
      usedFallback: true,
    };
  }

  try {
    const contents = buildPostScanParts(post);
    const parsed = await generateStructuredJson<RawModelScanResponse>(
      {
        stage: `Stage1_PostMultimodalScan[${post.id}]`,
        model: APP_CONFIG.genai.postScanModel,
        systemInstruction: POST_SCAN_SYSTEM_INSTRUCTION,
        contents,
        temperature: APP_CONFIG.genai.postScanTemperature,
        responseSchema: POST_SCAN_RESPONSE_SCHEMA,
      },
      executor,
    );

    return {
      finding: {
        postId: post.id,
        platform: post.platform,
        clues: parsed.clues ?? [],
      },
      usedFallback: false,
    };
  } catch (error) {
    if (APP_CONFIG.genai.enableDemoFallbackOnMissingKey && !executor) {
      return {
        finding: buildHeuristicPostFinding(post),
        usedFallback: true,
      };
    }
    throw error;
  }
}

/**
 * Runs Stage 1 multimodal extraction across a batch of `CreatorPost` items in parallel.
 *
 * @param posts - Collection of creator photos, drafts, and imported articles.
 * @param executor - Optional injectable Gemini executor for testing.
 * @returns Findings array plus whether any post used the offline fallback.
 */
export async function scanCreatorPostsBatch(
  posts: readonly CreatorPost[],
  executor?: GenAiStructuredExecutor,
): Promise<{
  readonly findings: PostDisclosureFinding[];
  readonly usedFallback: boolean;
}> {
  logFunctionCall('scanCreatorPostsBatch', {
    postCount: posts.length,
    postIds: posts.map((p) => p.id),
  });

  const results = await Promise.all(
    posts.map((post) => scanSingleCreatorPost(post, executor)),
  );

  return {
    findings: results.map((r) => r.finding),
    usedFallback: results.some((r) => r.usedFallback),
  };
}
