/**
 * @file src/features/article-import/articleExtractor.ts
 * @description Safe blog and Substack article URL importer and readable text extractor.
 *
 * Feature Overview:
 * Creators often reveal weekly habits, neighborhood routines, or upcoming event dates
 * in written newsletters (Substack, Medium, personal blogs) that combine with their
 * camera-roll photos to expose sensitive patterns. Rather than relying on brittle
 * social-media scrapers, this module fetches publicly accessible `http`/`https`
 * article pages, blocks local/private SSRF targets, extracts clean readable prose
 * from HTML, and packages the article into a `CreatorPost` ready for Gemini Stage 1
 * and Stage 2 cross-content analysis.
 *
 * Primary Use Cases:
 * 1. Pasting a Substack or blog post link alongside camera-roll photos on Android or Mac.
 * 2. Blocking unsafe non-HTTP protocols and private/loopback IP ranges (`validatePublicArticleUrl`).
 * 3. Extracting clean titles and body text from raw HTML (`extractReadableArticleFromHtml`).
 */

import { APP_CONFIG } from '../../config/appConfig';
import { CreatorPlatform, CreatorPost } from '../../domain/privacyTypes';
import { logFunctionCall } from '../../logging/logger';

/**
 * Extracted readable content parsed from an HTML blog or newsletter page.
 */
export interface ExtractedArticleContent {
  readonly title: string;
  readonly bodyText: string;
  readonly detectedPlatform: Extract<CreatorPlatform, 'substack' | 'blog'>;
}

/**
 * Minimal fetch signature allowing dependency injection in automated unit tests.
 */
export type HttpFetchFn = (
  input: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

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
 * Validates that a user-supplied article URL uses `http:` or `https:` and does not
 * target loopback, link-local, or private network hosts (SSRF protection).
 *
 * @param rawUrl - Raw URL string entered by the creator.
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
 * Strips scripts, styles, navigation chrome, and HTML tags from raw article markup
 * to return a clean title and bounded readable body text.
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
  };
}

/**
 * Fetches a public blog or Substack URL, extracts its readable text, and returns a
 * standardized `CreatorPost` item ready for cross-platform privacy analysis.
 *
 * @param rawUrl - Public article URL provided by the creator.
 * @param fetchImpl - Optional fetch implementation override (defaults to global `fetch`).
 * @returns Resolved `CreatorPost` representing the written article.
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

    return {
      id: `article-${Date.now()}`,
      platform: extracted.detectedPlatform,
      title: extracted.title,
      caption: extracted.bodyText,
      postedAtLabel: `Imported from ${validatedUrl.hostname}`,
      isDraft: false,
      sourceUrl: validatedUrl.toString(),
      mediaAltDescription: `Imported ${extracted.detectedPlatform} article: ${extracted.title}`,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
