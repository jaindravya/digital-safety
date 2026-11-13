/**
 * @file src/server/apiRouter.ts
 * @description Modular `/api/*` request router connecting HTTP clients (Android PWA
 * and Mac Studio view) to Unseen's platform-agnostic core pipeline.
 *
 * Feature Overview:
 * Exposes clean, ephemeral JSON endpoints with zero persistent user storage:
 *   - `GET  /api/health`         -> Runtime health, Gemini model ID, live-key status.
 *   - `GET  /api/demo-feed`      -> Persona + 6 sample creator posts for 1-tap demo.
 *   - `POST /api/import-article` -> Fetches & extracts prose from a public blog/Substack URL.
 *   - `POST /api/scan-exif`      -> Inspects image bytes for hidden EXIF GPS/time & optionally strips.
 *   - `POST /api/audit`          -> Hydrates local demo assets, checks T&C consent, runs Stage 1 + 2.
 *   - `POST /api/fix-post`       -> Runs Stage 3 caption rewriter + redaction planner.
 *   - `POST /api/feedback`       -> Records anonymous Thumbs Up / Thumbs Down rating.
 *   - `GET  /api/logs`           -> Returns `INFO` function & GenAI logs (`inlineData` stripped).
 *   - `POST /api/logs/clear`     -> Wipes ephemeral in-memory observability buffer.
 *
 * Primary Use Cases:
 * 1. Powering single-origin API calls from both Mac localhost and Android HTTPS tunnels.
 * 2. Translating `OwnershipAttestationRequiredError` cleanly to HTTP `403`.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { APP_CONFIG } from '../config/appConfig';
import {
  CreatorPost,
  CrossPlatformRisk,
  PostDisclosureFinding,
} from '../domain/privacyTypes';
import { fetchAndExtractArticlePost } from '../features/article-import/articleExtractor';
import { runFullPrivacyAudit } from '../features/audit-pipeline/privacyAuditOrchestrator';
import { generateSafePostFixPlan } from '../features/caption-rewriter/captionRewriter';
import {
  getMayaCreatorPersona,
  getMayaSamplePosts,
} from '../features/demo-dataset/mayaCreatorFeed';
import { hydratePostsMediaBatch } from '../features/demo-dataset/nodeDemoMediaHydrator';
import {
  buildExifDisclosureClues,
  scanImageDataUrlForExifPrivacy,
} from '../features/exif-scanner/exifMetadataScanner';
import { stripBinaryMetadataFromDataUrl } from '../features/exif-scanner/exifMetadataStripper';
import {
  AccuracyRating,
  getAnonymousFeedbackSummary,
  recordAnonymousFeedback,
} from '../features/feedback/accuracyFeedbackStore';
import {
  OwnershipAttestation,
  OwnershipAttestationRequiredError,
} from '../features/guardrails/ownershipConsent';
import { hasConfiguredGeminiApiKey } from '../genai/geminiClient';
import {
  clearLogHistory,
  getLogHistory,
  logFunctionCall,
} from '../logging/logger';
import { readJsonBody, sendJsonResponse } from './httpJsonHelpers';

/**
 * Attempts to route an `/api/*` request. Returns `true` when the pathname matched
 * an `/api` endpoint, or `false` so static/PWA serving can handle the request.
 *
 * @param req - Incoming Node HTTP request.
 * @param res - Outgoing Node HTTP response.
 * @returns `true` if handled as an API route; otherwise `false`.
 */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const method = req.method ?? 'GET';
  const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
  const pathname = parsedUrl.pathname;

  if (!pathname.startsWith('/api/')) {
    return false;
  }

  logFunctionCall('handleApiRequest', { method, pathname });

  if (method === 'OPTIONS') {
    sendJsonResponse(res, 200, { ok: true });
    return true;
  }

  try {
    if (method === 'GET' && pathname === '/api/health') {
      sendJsonResponse(res, 200, {
        status: 'ok',
        appName: APP_CONFIG.appName,
        version: APP_CONFIG.appVersion,
        model: APP_CONFIG.genai.postScanModel,
        liveGeminiKeyConfigured: hasConfiguredGeminiApiKey(),
      });
      return true;
    }

    if (method === 'GET' && pathname === '/api/demo-feed') {
      sendJsonResponse(res, 200, {
        persona: getMayaCreatorPersona(),
        posts: getMayaSamplePosts(),
      });
      return true;
    }

    if (method === 'POST' && pathname === '/api/import-article') {
      const body = await readJsonBody<{ url?: string }>(req);
      if (!body.url || typeof body.url !== 'string') {
        sendJsonResponse(res, 400, {
          error: 'Please enter a public blog or Substack URL.',
        });
        return true;
      }
      const post = await fetchAndExtractArticlePost(body.url);
      sendJsonResponse(res, 200, { post });
      return true;
    }

    if (method === 'POST' && pathname === '/api/scan-exif') {
      const body = await readJsonBody<{
        imageDataUrl?: string;
        stripMetadata?: boolean;
      }>(req);

      if (!body.imageDataUrl || typeof body.imageDataUrl !== 'string') {
        sendJsonResponse(res, 400, {
          error: 'imageDataUrl is required for EXIF privacy scanning.',
        });
        return true;
      }

      const exifSummary = scanImageDataUrlForExifPrivacy(body.imageDataUrl);
      const clues = buildExifDisclosureClues(exifSummary);

      if (body.stripMetadata) {
        const stripped = stripBinaryMetadataFromDataUrl(body.imageDataUrl);
        sendJsonResponse(res, 200, {
          exifSummary: {
            ...exifSummary,
            metadataWasAutoStripped: stripped.strippedSegmentsCount > 0,
          },
          clues,
          cleanImageDataUrl: stripped.cleanDataUrl,
          strippedSegmentsCount: stripped.strippedSegmentsCount,
        });
        return true;
      }

      sendJsonResponse(res, 200, { exifSummary, clues });
      return true;
    }

    if (method === 'POST' && pathname === '/api/audit') {
      const body = await readJsonBody<{
        posts?: CreatorPost[];
        attestation?: OwnershipAttestation;
      }>(req);

      const rawPosts = Array.isArray(body.posts) ? body.posts : [];
      const hydratedPosts = hydratePostsMediaBatch(rawPosts);
      const report = await runFullPrivacyAudit({
        posts: hydratedPosts,
        attestation: body.attestation as OwnershipAttestation,
      });
      sendJsonResponse(res, 200, { report });
      return true;
    }

    if (method === 'POST' && pathname === '/api/fix-post') {
      const body = await readJsonBody<{
        post?: CreatorPost;
        risk?: CrossPlatformRisk;
        postFinding?: PostDisclosureFinding;
        attestation?: OwnershipAttestation;
      }>(req);

      if (!body.post || !body.risk) {
        sendJsonResponse(res, 400, {
          error: 'Both post and risk are required to generate a fix plan.',
        });
        return true;
      }

      const plan = await generateSafePostFixPlan({
        post: body.post,
        risk: body.risk,
        postFinding: body.postFinding,
        attestation: body.attestation as OwnershipAttestation,
      });
      sendJsonResponse(res, 200, { plan });
      return true;
    }

    if (method === 'POST' && pathname === '/api/feedback') {
      const body = await readJsonBody<{
        rating?: AccuracyRating;
        comment?: string;
      }>(req);

      if (body.rating !== 'thumbs_up' && body.rating !== 'thumbs_down') {
        sendJsonResponse(res, 400, {
          error: 'Rating must be thumbs_up or thumbs_down.',
        });
        return true;
      }

      const record = recordAnonymousFeedback(body.rating, body.comment);
      const summary = getAnonymousFeedbackSummary();
      sendJsonResponse(res, 200, {
        record,
        thumbsUpCount: summary.thumbsUpCount,
        thumbsDownCount: summary.thumbsDownCount,
      });
      return true;
    }

    if (method === 'GET' && pathname === '/api/logs') {
      sendJsonResponse(res, 200, {
        entries: getLogHistory(),
      });
      return true;
    }

    if (method === 'POST' && pathname === '/api/logs/clear') {
      clearLogHistory();
      sendJsonResponse(res, 200, { cleared: true });
      return true;
    }

    sendJsonResponse(res, 404, { error: `Unknown API endpoint: ${pathname}` });
    return true;
  } catch (error) {
    if (error instanceof OwnershipAttestationRequiredError) {
      sendJsonResponse(res, 403, { error: error.message });
      return true;
    }
    const message =
      error instanceof Error ? error.message : 'Unexpected server error.';
    sendJsonResponse(res, 400, { error: message });
    return true;
  }
}
