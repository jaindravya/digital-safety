/**
 * @file src/features/article-import/articleExtractor.ts
 * @description Safe blog and Substack article URL importer extracting readable prose
 * AND inspecting embedded article photos for hidden EXIF GPS & capture-time metadata.
 *
 * Feature Overview:
 * Creators often reveal weekly habits, neighborhood routines, or upcoming event dates
 * in written newsletters (Substack, Medium, personal blogs)—and unlike Instagram, many
 * blogs and newsletter CDNs serve original uploaded photo files with EXIF GPS and
 * `DateTimeOriginal` capture timestamps still intact!
 *
 * Rather than relying on brittle social-media scrapers, this module:
 *   1. Fetches publicly accessible `http`/`https` article pages while blocking local
 *      and private-network SSRF targets (`validatePublicArticleUrl`).
 *   2. Extracts clean titles, readable prose, and the article's primary embedded photo
 *      URL (`<article><img ...>` or `og:image`).
 *   3. Downloads the article's lead image (when available), scans its binary headers
 *      for hidden EXIF GPS, timestamp, and camera metadata (`scanImageBytesForExifPrivacy`),
 *      strips raw EXIF coordinates into a clean `imageDataUrl`, and packages both prose
 *      and photo telemetry into a `CreatorPost` for Stage 1 & Stage 2 analysis.
 *
 * Primary Use Cases:
 * 1. Pasting a Substack or blog post link on Android or Mac to audit both written
 *    routines and hidden EXIF metadata on photos posted inside the article.
 * 2. Blocking unsafe non-HTTP protocols and private/loopback IP ranges (`validatePublicArticleUrl`).
 * 3. Extracting clean titles, body text, and lead image URLs from raw HTML (`extractReadableArticleFromHtml`).
 */

import { APP_CONFIG } from '../../config/appConfig';
import {
  CreatorPlatform,
  CreatorPost,
  ExifPrivacyScanSummary,
} from '../../domain/privacyTypes';
import { logFunctionCall } from '../../logging/logger';
import { scanImageBytesForExifPrivacy } from '../exif-scanner/exifMetadataScanner';
import { stripBinaryMetadataFromBytes } from '../exif-scanner/exifMetadataStripper';

/**
 * Extracted readable content parsed from an HTML blog or newsletter page.
 */
export interface ExtractedArticleContent {
  readonly title: string;
  readonly bodyText: string;
  readonly detectedPlatform: Extract<CreatorPlatform, 'substack' | 'blog'>;
  readonly leadImageUrl?: string;
}

/**
 * Minimal fetch signature allowing dependency injection in automated unit tests.
 */
export type HttpFetchFn = (
  input: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get?: (name: string) => string | null };
  text: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}>;

const PRIVATE_HOSTNAME_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/,
  /\.local$/i,
];

/**
 * Validates that a user-supplied URL uses `http:` or `https:` and does not
 * target loopback, link-local, or private network hosts (SSRF protection).
 *
 * @param rawUrl - Raw URL string entered by the creator or resolved from an article `<img>`.
 * @returns Normalized `URL` object when valid and public.
 * @throws {Error} When the URL is malformed, uses a disallowed protocol, or targets a private host.
 */
export function validatePublicArticleUrl(rawUrl: string): URL {
  logFunctionCall('validatePublicArticleUrl', { rawUrl });

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Please enter a valid public article URL starting with https://.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http:// and https:// article links are supported.');
  }

  const hostname = parsed.hostname.toLowerCase();
  for (const pattern of PRIVATE_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error('Private or local network URLs cannot be imported.');
    }
  }

  return parsed;
}

/**
 * Decodes common HTML entities into plain Unicode characters for clean prompt analysis.
 *
 * @param rawText - Text containing HTML character entities.
 * @returns Decoded plain text string.
 */
export function decodeBasicHtmlEntities(rawText: string): string {
  logFunctionCall('decodeBasicHtmlEntities', { charLength: rawText.length });

  return rawText
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–');
}

/**
 * Infers whether an article URL or HTML document belongs to Substack or a general blog.
 *
 * @param url - Validated public `URL` of the article.
 * @param html - Raw HTML markup of the page.
 * @returns `'substack'` when Substack markers are present, otherwise `'blog'`.
 */
export function detectArticlePlatform(
  url: URL,
  html: string,
): Extract<CreatorPlatform, 'substack' | 'blog'> {
  logFunctionCall('detectArticlePlatform', { hostname: url.hostname });

  if (
    url.hostname.includes('substack.com') ||
    /substackcdn\.com|substack-post-media/i.test(html)
  ) {
    return 'substack';
  }
  return 'blog';
}

/**
 * Extracts and validates a public lead image URL from `<article><img src="...">` or
 * `<meta property="og:image">` markup, ignoring private/loopback or data/svg icons.
 *
 * @param focusHtml - Primary `<article>` / `<main>` HTML region.
 * @param fullHtml - Bounded full page HTML for `og:image` fallback.
 * @param baseUrl - Validated article `URL` used to resolve relative image paths.
 * @returns Validated public image URL string, or `undefined` if none found.
 */
export function extractLeadArticleImageUrl(
  focusHtml: string,
  fullHtml: string,
  baseUrl: URL,
): string | undefined {
  logFunctionCall('extractLeadArticleImageUrl', {
    baseHostname: baseUrl.hostname,
  });

  const inlineImgMatch = /<img[^>]+src=["']([^"']+)["']/i.exec(focusHtml);
  const ogImageMatch =
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(
      fullHtml,
    );

  const rawCandidate = inlineImgMatch?.[1] ?? ogImageMatch?.[1];
  if (!rawCandidate) {
    return undefined;
  }

  const decodedSrc = decodeBasicHtmlEntities(rawCandidate.trim());
  if (decodedSrc.startsWith('data:') || /\.svg(\?|$)/i.test(decodedSrc)) {
    return undefined;
  }

  try {
    const resolved = new URL(decodedSrc, baseUrl);
    const safeUrl = validatePublicArticleUrl(resolved.toString());
    return safeUrl.toString();
  } catch {
    return undefined;
  }
}

/**
 * Strips scripts, styles, navigation chrome, and HTML tags from raw article markup
 * to return a clean title, bounded readable body text, and optional lead image URL.
 *
 * @param html - Raw HTML string downloaded from the article URL.
 * @param sourceUrl - Validated `URL` used for platform detection and fallback title.
 * @returns Structured `ExtractedArticleContent` capped to `APP_CONFIG.articleImport.maxExtractedTextChars`.
 */
export function extractReadableArticleFromHtml(
  html: string,
  sourceUrl: URL,
): ExtractedArticleContent {
  logFunctionCall('extractReadableArticleFromHtml', {
    sourceUrl: sourceUrl.toString(),
    htmlLength: html.length,
  });

  const boundedHtml = html.slice(0, APP_CONFIG.articleImport.maxHtmlBytes);
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(boundedHtml);
  const ogTitleMatch =
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(
      boundedHtml,
    );

  const rawTitle = ogTitleMatch?.[1] ?? titleMatch?.[1] ?? sourceUrl.hostname;
  const cleanTitle = decodeBasicHtmlEntities(
    rawTitle.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  );

  const articleRegionMatch = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(boundedHtml);
  const mainRegionMatch = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(boundedHtml);
  const focusHtml = articleRegionMatch?.[1] ?? mainRegionMatch?.[1] ?? boundedHtml;
  const leadImageUrl = extractLeadArticleImageUrl(
    focusHtml,
    boundedHtml,
    sourceUrl,
  );

  const withoutNonContentTags = focusHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<\/(p|div|h1|h2|h3|h4|li|blockquote|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const normalizedBody = decodeBasicHtmlEntities(withoutNonContentTags)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n\n')
    .slice(0, APP_CONFIG.articleImport.maxExtractedTextChars);

  return {
    title: cleanTitle || sourceUrl.hostname,
    bodyText: normalizedBody,
    detectedPlatform: detectArticlePlatform(sourceUrl, boundedHtml),
    leadImageUrl,
  };
}

/**
 * Best-effort fetcher that downloads an article's embedded photo, scans its binary
 * headers for hidden EXIF GPS & capture-time metadata, and returns a stripped base64
 * `imageDataUrl` + `exifScanSummary`. Gracefully returns `null` if image fetch fails.
 */
async function fetchAndInspectArticleLeadImage(
  imageUrl: string,
  fetchImpl: HttpFetchFn,
  signal: AbortSignal,
): Promise<{
  readonly imageDataUrl: string;
  readonly mediaMimeType: string;
  readonly exifScanSummary: ExifPrivacyScanSummary;
} | null> {
  logFunctionCall('fetchAndInspectArticleLeadImage', { imageUrl });

  try {
    const imgRes = await fetchImpl(imageUrl, {
      headers: {
        'User-Agent': APP_CONFIG.articleImport.userAgent,
        Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8',
      },
      signal,
    });

    if (!imgRes.ok || typeof imgRes.arrayBuffer !== 'function') {
      return null;
    }

    const arrayBuf = await imgRes.arrayBuffer();
    if (arrayBuf.byteLength < 12 || arrayBuf.byteLength > 10 * 1024 * 1024) {
      return null;
    }

    const rawBytes = new Uint8Array(arrayBuf);
    const rawScan = scanImageBytesForExifPrivacy(rawBytes);
    const stripped = APP_CONFIG.exif.autoStripOnClientUpload
      ? stripBinaryMetadataFromBytes(rawBytes)
      : { bytes: rawBytes, strippedSegmentsCount: 0 };

    const headerMime = imgRes.headers?.get?.('content-type')?.split(';')[0]?.trim();
    const inferredMime =
      rawScan.scannedFormat === 'png'
        ? 'image/png'
        : rawScan.scannedFormat === 'webp'
          ? 'image/webp'
          : headerMime && headerMime.startsWith('image/')
            ? headerMime
            : 'image/jpeg';

    const base64Str = Buffer.from(
      stripped.bytes.buffer,
      stripped.bytes.byteOffset,
      stripped.bytes.byteLength,
    ).toString('base64');

    return {
      imageDataUrl: `data:${inferredMime};base64,${base64Str}`,
      mediaMimeType: inferredMime,
      exifScanSummary: {
        ...rawScan,
        metadataWasAutoStripped: stripped.strippedSegmentsCount > 0,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Fetches a public blog or Substack URL, extracts its readable text, inspects any
 * embedded lead photo for hidden EXIF GPS/timestamp metadata, and returns a
 * standardized `CreatorPost` item ready for cross-platform privacy analysis.
 *
 * @param rawUrl - Public article URL provided by the creator.
 * @param fetchImpl - Optional fetch implementation override (defaults to global `fetch`).
 * @returns Resolved `CreatorPost` representing the written article and optional photo.
 */
export async function fetchAndExtractArticlePost(
  rawUrl: string,
  fetchImpl: HttpFetchFn = fetch as unknown as HttpFetchFn,
): Promise<CreatorPost> {
  logFunctionCall('fetchAndExtractArticlePost', { rawUrl });

  const validatedUrl = validatePublicArticleUrl(rawUrl);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    APP_CONFIG.articleImport.fetchTimeoutMs,
  );

  try {
    const response = await fetchImpl(validatedUrl.toString(), {
      headers: {
        'User-Agent': APP_CONFIG.articleImport.userAgent,
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Could not read article URL (HTTP ${response.status}). Make sure the post is public.`,
      );
    }

    const html = await response.text();
    const extracted = extractReadableArticleFromHtml(html, validatedUrl);

    if (!extracted.bodyText || extracted.bodyText.length < 20) {
      throw new Error(
        'The article link did not contain enough readable public text to analyze.',
      );
    }

    const inspectedImage = extracted.leadImageUrl
      ? await fetchAndInspectArticleLeadImage(
          extracted.leadImageUrl,
          fetchImpl,
          controller.signal,
        )
      : null;

    let postedAtLabel = `Imported from ${validatedUrl.hostname}`;
    if (inspectedImage?.exifScanSummary.hasEmbeddedGps) {
      postedAtLabel = `Imported from ${validatedUrl.hostname} · Article photo has hidden EXIF GPS & timestamp`;
    } else if (
      inspectedImage?.exifScanSummary.hasCaptureTimestamp &&
      inspectedImage.exifScanSummary.captureTimeWindowCue
    ) {
      postedAtLabel = `Imported from ${validatedUrl.hostname} · Article photo EXIF: ${inspectedImage.exifScanSummary.captureTimeWindowCue}`;
    }

    return {
      id: `article-${Date.now()}`,
      platform: extracted.detectedPlatform,
      title: extracted.title,
      caption: extracted.bodyText,
      postedAtLabel,
      isDraft: false,
      sourceUrl: validatedUrl.toString(),
      imageDataUrl: inspectedImage?.imageDataUrl,
      mediaMimeType: inspectedImage?.mediaMimeType,
      exifScanSummary: inspectedImage?.exifScanSummary,
      mediaAltDescription: `Imported ${extracted.detectedPlatform} article: ${extracted.title}`,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
