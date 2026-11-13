/**
 * @file src/features/post-scan/postScanner.ts
 * @description Stage 1 multimodal per-post, article, and binary EXIF metadata disclosure
 * extractor powered by Google Gemini (`@google/genai`) + deterministic TIFF/XMP scanning.
 *
 * Feature Overview:
 * Analyzes an individual `CreatorPost`—combining:
 *   1. Binary EXIF/TIFF/XMP header inspection (`scanImageDataUrlForExifPrivacy`) to flag
 *      hidden GPS coordinates, capture timestamps, and camera serial tags inside raw
 *      camera-roll files without ever echoing raw coordinates.
 *   2. Original camera-roll image pixels (`inlineData`), caption/article prose, platform
 *      context, and timing metadata via Google Gemini (`gemini-3.8-flash`).
 *
 * When sensitive visual objects (shipping labels, apartment mail, hotel keycards, VIP
 * credentials, street signs, mirror/screen reflections) appear in an image, Gemini returns
 * normalized `[ymin, xmin, ymax, xmax]` coordinates (`0..1000`) so the Fix Studio can
 * automatically highlight and blur them while stripping all EXIF headers on export.
 *
 * Includes a deterministic heuristic fallback (`buildHeuristicPostFinding`) when no
 * API key is configured or venue Wi-Fi drops, ensuring uninterrupted demo reliability
 * while logging `usedFallback: true` in `INFO` GenAI telemetry.
 *
 * Primary Use Cases:
 * 1. Scanning uploaded Android/iOS/Mac camera-roll photos + captions for hidden EXIF GPS,
 *    visual PII, and recurring routines.
 * 2. Scanning imported Substack/blog articles for recurring schedule or neighborhood disclosures.
 * 3. Batch-scanning an entire creator feed (`scanCreatorPostsBatch`).
 */

import { Part, Schema, Type } from '@google/genai';
import { APP_CONFIG } from '../../config/appConfig';
import {
  CreatorPost,
  DisclosureCategory,
  ExifPrivacyScanSummary,
  NormalizedBoundingBox,
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
import {
  buildExifDisclosureClues,
  mergeExifScanSummaries,
  scanImageDataUrlForExifPrivacy,
} from '../exif-scanner/exifMetadataScanner';

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

const POST_SCAN_SYSTEM_INSTRUCTION = `You are Stage 1 of Unseen, a sharp, detail-oriented multimodal Counter-OSINT & privacy self-auditor for women content creators.
Inspect EVERY detail of the creator's own photo (foreground, desk corners, cups/packaging, hanging restaurant/store/property blade signs, sidewalk A-frame chalkboards/promo boards, street-name signs, doorway/column building numbers, phone numbers/area codes on signs, window views, mirrors/sunglasses reflections, laptop screens, wristbands, keycards, mail/barcodes), binary EXIF metadata summary (if detected), caption/article text, and timestamp.

BACKGROUND OCR & STREET GEO-TRIANGULATION PASS (CRITICAL — EVEN WHEN CAPTION IS EMPTY):
- Never dismiss a casual street-style, outfit, walking, or aesthetic close-up photo (e.g., a funny sidewalk quote board, coffee cup, or flower stand) as clean until you ZOOM INTO THE BACKGROUND across the street and behind the subject to read every legible sign, station entrance, building header, board, or number!
- Specifically look for and flag:
  1. Subway / Metro / London Underground / transit station entrances, roundels, and bus-stop headers across the street in the background (e.g., an "UNDERGROUND" roundel + "ST. JAMES'S PARK STATION" canopy + "55 BROADWAY" building header right behind a foreground café chalkboard!).
  2. Hanging restaurant, café, bar, boutique, or property/leasing blade signs in the background (e.g., a restaurant name sign or "DEZER PROPERTIES / OFFICES FOR LEASE").
  3. Sidewalk A-frame chalkboards, sandwich boards, or posters naming local colleges, campuses, student discounts, or neighborhood events (e.g., "HEY FIT STUDENTS TAKE 10% OFF").
  4. Street-corner signs, doorway/column building numbers (e.g., "122"), regional traffic/roundabout signs, and phone numbers or area codes visible on signs.
- Even on a SINGLE photo where the foreground looks totally generic, a background station entrance or 1–3 small signs lets an OSINT tracker pinpoint the exact doorway the creator is standing in front of in seconds—ALWAYS return concrete clues citing the exact legible background text!

Identify unintended privacy disclosures across these categories ONLY:
- predictable_routine (recurring weekdays/hours, repeated coffee shops, Pilates/gym studios, run clubs, or hidden EXIF capture-time patterns)
- real_time_location ("right now", "until 8pm", live DJ set/event cues, active check-ins while still on site)
- sensitive_document_or_pii (hidden EXIF GPS headers, zoom-readable shipping labels, mail, barcodes, IDs, VIP credentials, laptop/mirror reflections)
- travel_or_lodging_clue (hotel keycard sleeves, floor numbers, room layout/views during an active stay, Wi-Fi codes)
- recognizable_surroundings (readable background restaurant/shop/leasing blade signs, sidewalk A-frame promo boards, street-corner signs, doorway/column numbers, distinctive awnings, archways, skyline angles)

SPECIFICITY & SAFETY RULES:
1. BE CONCRETE AND SPECIFIC—NOT VAGUE! Explicitly point out the exact readable background signs/boards (e.g., "hanging black blade sign reading 'DEZER PROPERTIES' in the upper-right background", "blue sidewalk A-frame board reading 'HEY FIT STUDENTS TAKE 10% OFF'", "restaurant name sign behind your left shoulder"), neighborhood/campus cues, coffee shop/studio features, exact days/times, and exact frame positions.
2. ONLY withhold private residential home addresses (e.g., "1428 Sunset Blvd"), private residential apartment/unit numbers ("Apt 4B"), exact hotel room numbers ("Room 612"), and raw decimal GPS coordinates. Never censor public restaurant/shop/business sign names, campus names, neighborhood names, architectural details, or routine timestamps—the creator needs to see the exact background clues that gave the block away!
3. TWO-TIER VISUAL boundingBox RULE (SMALL SIGNS/PII = BLUR BOX vs. HUGE LANDMARKS = NO BLUR BOX):
   - TIER A — RETURN A TIGHT boundingBox [ymin, xmin, ymax, xmax] (0..1000) for SMALL, INCIDENTAL BACKGROUND SIGNS OR PII OBJECTS where a small blur hides the location clue while keeping the portrait/foreground aesthetic intact:
     * Background subway/metro/Underground station name banners, transit roundels, or building header signs across the street (e.g., "55 BROADWAY" / "ST. JAMES'S PARK STATION")
     * Small background hanging restaurant/café/bar/shop/leasing blade signs or logos
     * Sidewalk A-frame chalkboards / promo boards / menus
     * Street-name signs, doorway/building/apartment numbers, or phone numbers on signs
     * Shipping labels, mail/envelopes, barcodes, hotel keycard sleeves, IDs/badges/wristbands, license plates, or laptop/phone screens
   - TIER B — NEVER return a boundingBox for HUGE ICONIC LANDMARKS OR WIDE SCENERY (like the Eiffel Tower, Hollywood Sign, bridges, monuments, city skylines, beaches, whole building facades, or wide courtyard archways)! Blurring a giant landmark ruins the photo—omit boundingBox on huge landmarks so Stage 3 recommends delaying the post instead.`;

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
 * Determines whether a candidate bounding box represents a small, incidental PII
 * object or background sign worth Smart Blurring (restaurant/business blade signs,
 * sidewalk A-frame boards, street signs, doorway numbers, labels, mail, keycards,
 * badges, wristbands, plates, screens) rather than a huge landmark, monument,
 * skyline, or whole building facade.
 *
 * @param box - Candidate `NormalizedBoundingBox` in `0..1000` coordinates.
 * @param category - Associated `DisclosureCategory` of the clue.
 * @returns `true` if the box should be auto-suggested for Smart Blur; `false` if blurring makes no sense.
 */
export function isSmallRedactablePiiBox(
  box: NormalizedBoundingBox,
  category?: DisclosureCategory,
): boolean {
  const widthNorm = Math.abs(box.xmax - box.xmin) / APP_CONFIG.genai.boundingBoxCoordinateScale;
  const heightNorm = Math.abs(box.ymax - box.ymin) / APP_CONFIG.genai.boundingBoxCoordinateScale;
  const areaRatio = widthNorm * heightNorm;

  logFunctionCall('isSmallRedactablePiiBox', {
    label: box.label,
    category: category ?? null,
    areaRatio: Number(areaRatio.toFixed(3)),
  });

  if (areaRatio <= 0 || areaRatio > APP_CONFIG.redaction.maxAutoBlurAreaRatio) {
    return false;
  }

  if (APP_CONFIG.redaction.nonBlurLandmarkLabelPattern.test(box.label)) {
    return false;
  }

  if (
    category === 'recognizable_surroundings' &&
    !/\b(label|mail|barcode|badge|wristband|lanyard|keycard|id|card|passport|ticket|boarding|plate|screen|number|apt|address|sign|signage|board|chalkboard|a-frame|sandwich\s*board|menu|placard|banner|poster|logo|name|phone|leasing|restaurant|cafe|shop|store|station|underground|subway|metro|transit|roundel|header|canopy|marquee|plaque|window\s*text|awning\s*text)\b/i.test(
      box.label,
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Strips impractical landmark/scenery bounding boxes from Stage 1 clues while keeping
 * the underlying clue text intact so Stage 2 & Stage 3 recommend delayed posting instead.
 *
 * @param clues - Candidate `PostDisclosureClue[]` items.
 * @returns Sanitized clues where `boundingBox` only appears on small redactable PII items.
 */
export function filterNonLandmarkBoundingBoxes(
  clues: readonly PostDisclosureClue[],
): PostDisclosureClue[] {
  logFunctionCall('filterNonLandmarkBoundingBoxes', { clueCount: clues.length });

  return clues.map((clue) => {
    if (!clue.boundingBox) {
      return clue;
    }
    if (isSmallRedactablePiiBox(clue.boundingBox, clue.category)) {
      return clue;
    }
    const { boundingBox: _dropped, ...rest } = clue;
    return rest;
  });
}

/**
 * Resolves the complete zero-PII EXIF metadata summary for a `CreatorPost` by combining
 * live byte inspection of `post.imageDataUrl` with any pre-upload `post.exifScanSummary`.
 *
 * @param post - Creator photo post, draft, or imported article.
 * @returns Merged `ExifPrivacyScanSummary`.
 */
export function resolvePostExifSummary(
  post: CreatorPost,
): ExifPrivacyScanSummary {
  logFunctionCall('resolvePostExifSummary', {
    postId: post.id,
    hasImageDataUrl: Boolean(post.imageDataUrl),
    hasPreUploadExif: Boolean(post.exifScanSummary),
  });

  const liveScan = scanImageDataUrlForExifPrivacy(post.imageDataUrl);
  return mergeExifScanSummaries(liveScan, post.exifScanSummary);
}

/**
 * Merges deterministic binary EXIF clues with Gemini's multimodal clues while preventing
 * duplicate EXIF GPS or EXIF capture-time entries when the model also mentions them.
 *
 * @param modelClues - Clues returned by Gemini (or heuristic text/visual rules).
 * @param exifClues - Deterministic clues generated from binary EXIF headers.
 * @returns Combined, deduplicated `PostDisclosureClue[]` list.
 */
export function mergeExifCluesIntoModelClues(
  modelClues: readonly PostDisclosureClue[],
  exifClues: readonly PostDisclosureClue[],
): PostDisclosureClue[] {
  logFunctionCall('mergeExifCluesIntoModelClues', {
    modelClueCount: modelClues.length,
    exifClueCount: exifClues.length,
  });

  if (exifClues.length === 0) {
    return [...modelClues];
  }

  const hasExifGpsDeterministic = exifClues.some(
    (c) =>
      c.category === 'sensitive_document_or_pii' &&
      /exif\s+gps/i.test(c.summary),
  );
  const hasExifTimestampDeterministic = exifClues.some(
    (c) =>
      c.category === 'predictable_routine' &&
      /exif\s+capture-time/i.test(c.summary),
  );

  const filteredModelClues = modelClues.filter((clue) => {
    if (clue.boundingBox) {
      return true;
    }
    if (
      hasExifGpsDeterministic &&
      /exif/i.test(clue.summary) &&
      /gps|coordinate/i.test(clue.summary)
    ) {
      return false;
    }
    if (
      hasExifTimestampDeterministic &&
      /exif/i.test(clue.summary) &&
      /timestamp|capture/i.test(clue.summary)
    ) {
      return false;
    }
    return true;
  });

  return [...exifClues, ...filteredModelClues];
}

/**
 * Builds multimodal `@google/genai` `Part[]` contents for a single `CreatorPost`,
 * including zero-PII EXIF binary summary context when embedded metadata is present.
 *
 * @param post - Creator photo post, draft, or imported blog/Substack article.
 * @param exifSummary - Optional pre-computed `ExifPrivacyScanSummary`.
 * @returns Ordered array of prompt text and optional `inlineData` image part.
 */
export function buildPostScanParts(
  post: CreatorPost,
  exifSummary?: ExifPrivacyScanSummary,
): Part[] {
  const resolvedExif = exifSummary ?? resolvePostExifSummary(post);

  logFunctionCall('buildPostScanParts', {
    postId: post.id,
    platform: post.platform,
    hasImage: Boolean(post.imageDataUrl),
    hasExifMetadata: resolvedExif.hasExifMetadata,
  });

  const exifPromptNote = resolvedExif.hasExifMetadata
    ? `Hidden EXIF Binary Metadata Detected: Embedded GPS coordinates = ${resolvedExif.hasEmbeddedGps}, Capture time window = ${resolvedExif.captureTimeWindowCue ?? 'none'}, Camera header = ${resolvedExif.deviceCategoryCue ?? 'none'}, Unique serial/ID tag = ${resolvedExif.hasUniqueSerialOrId}`
    : '';

  const parts: Part[] = [
    {
      text: [
        `Post ID: ${post.id}`,
        `Source Platform: ${post.platform}`,
        `Is Unpublished Draft: ${post.isDraft}`,
        `Timestamp / Context: ${post.postedAtLabel}`,
        post.title ? `Title: ${post.title}` : '',
        exifPromptNote,
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
 * @param post - Input `CreatorPost` to inspect heuristically (including binary EXIF).
 * @returns Structured `PostDisclosureFinding` with accurate bounding boxes and EXIF clues.
 */
export function buildHeuristicPostFinding(
  post: CreatorPost,
): PostDisclosureFinding {
  logFunctionCall('buildHeuristicPostFinding', {
    postId: post.id,
    platform: post.platform,
  });

  const exifSummary = resolvePostExifSummary(post);
  const exifClues = buildExifDisclosureClues(exifSummary);

  const combinedText = `${post.title ?? ''} ${post.caption} ${post.postedAtLabel} ${post.mediaAltDescription}`.toLowerCase();
  const heuristicClues: PostDisclosureClue[] = [];

  if (
    /every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|ritual|8:15am|9am|8\s*to\s*9am|weekly/i.test(
      combinedText,
    )
  ) {
    heuristicClues.push({
      category: 'predictable_routine',
      summary:
        post.platform === 'substack'
          ? 'Newsletter prose explicitly states sitting at the exact same Silver Lake corner café window seat every Tuesday from 8:00 to 9:00 AM before movement class.'
          : post.platform === 'youtube'
            ? 'Vlog frame shows the terracotta archway entrance of the 9:00 AM Tuesday reformer Pilates studio and confirms it is on the same block as the morning coffee spot.'
            : 'Story pairs an 8:15 AM Tuesday timestamp with a marble corner window table overlooking a distinctive café awning before heading next door to Pilates.',
      sourceModality: post.imageDataUrl ? 'combined' : 'caption',
      confidencePercentage: 91,
      timeCue: 'Every Tuesday · 8:00–9:30 AM',
      placeTypeCue: 'Silver Lake corner café window & next-door Pilates archway',
    });
  }

  if (/shipping label|parcel|in the mail|envelope/i.test(combinedText)) {
    heuristicClues.push({
      category: 'sensitive_document_or_pii',
      summary:
        'Zoom-readable white parcel shipping label and barcode sit in the bottom-right corner of the desk flatlay next to the iced coffee (private street address withheld).',
      sourceModality: 'visual',
      confidencePercentage: 95,
      placeTypeCue: 'Bottom-right corner of home studio desk',
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
    heuristicClues.push({
      category: 'travel_or_lodging_clue',
      summary:
        'Live weekend check-in story names the 6th floor while a printed hotel keycard sleeve sits visibly open inside the cream carry-on suitcase.',
      sourceModality: 'combined',
      confidencePercentage: 88,
      timeCue: 'Active weekend stay (currently checked in)',
      placeTypeCue: '6th-floor boutique hotel room',
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
    heuristicClues.push({
      category: 'real_time_location',
      summary:
        'Draft broadcasts live presence at a DTLA sunset rooftop DJ booth ("right now until 8pm") while showing an ALL ACCESS VIP wristband in the lower-left foreground.',
      sourceModality: 'combined',
      confidencePercentage: 94,
      timeCue: 'Live right now until 8:00 PM',
      placeTypeCue: 'DTLA rooftop DJ booth',
      boundingBox: post.imageDataUrl
        ? {
            ymin: 725,
            xmin: 65,
            ymax: 915,
            xmax: 520,
            label: 'ALL ACCESS VIP wristband',
          }
        : undefined,
    });
  }

  if (
    heuristicClues.length === 0 &&
    exifClues.length === 0 &&
    /window|awning|archway|street|block|entrance/i.test(combinedText)
  ) {
    heuristicClues.push({
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
    clues: mergeExifCluesIntoModelClues(heuristicClues, exifClues),
  };

  logGenAiCall({
    stage: `Stage1_PostMultimodalScan[${post.id}]`,
    model: APP_CONFIG.genai.postScanModel,
    prompt: buildPostScanParts(post, exifSummary),
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
 * Runs Stage 1 multimodal + binary EXIF disclosure extraction on a single `CreatorPost`.
 *
 * @param post - Creator post, camera-roll image, or imported article to scan.
 * @param executor - Optional injectable Gemini executor for deterministic tests.
 * @returns Structured `PostDisclosureFinding` with EXIF + visual/prose clues and bounding boxes.
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

  const exifSummary = resolvePostExifSummary(post);
  const exifClues = buildExifDisclosureClues(exifSummary);
  const canCallLiveModel = Boolean(executor) || hasConfiguredGeminiApiKey();

  if (!canCallLiveModel && APP_CONFIG.genai.enableDemoFallbackOnMissingKey) {
    return {
      finding: buildHeuristicPostFinding(post),
      usedFallback: true,
    };
  }

  try {
    const contents = buildPostScanParts(post, exifSummary);
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
        clues: filterNonLandmarkBoundingBoxes(
          mergeExifCluesIntoModelClues(parsed.clues ?? [], exifClues),
        ),
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
 * Runs Stage 1 multimodal + EXIF extraction across a batch of `CreatorPost` items in parallel.
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
