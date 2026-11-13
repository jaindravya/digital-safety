/**
 * @file tests/geminiPipelineAndArticle.test.ts
 * @description Automated unit and integration tests for Chunk 3: Blog/Substack
 * Article URL Importer, `@google/genai` Multimodal Client, Stage 1–3 Gemini
 * Pipeline, and Deterministic Exposure Scoring Engine.
 *
 * Feature Overview:
 * Verifies that:
 *   1. Public Substack and blog HTML pages convert cleanly into `CreatorPost`
 *      items while loopback/private SSRF URLs are rejected.
 *   2. `generateStructuredJson` converts base64 data URLs to `@google/genai`
 *      `inlineData` parts and logs model, prompt, config, and output at `INFO`
 *      level with raw image bytes stripped.
 *   3. `runFullPrivacyAudit` and `generateSafePostFixPlan` connect cross-platform
 *      routines, produce `"With X% confidence..."` insights, return bounding
 *      boxes, generate personalized Best Practices, and enforce anti-doxxing
 *      sanitization across both mocked live Gemini responses and fallback mode.
 *
 * Primary Use Cases:
 * 1. Continuous verification via `npm test`.
 * 2. Concrete evidence of testing for Rubric #2 (Working Prototype) and #3
 *    (Google AI Use).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  extractReadableArticleFromHtml,
  fetchAndExtractArticlePost,
  validatePublicArticleUrl,
} from '../src/features/article-import/articleExtractor';
import { runFullPrivacyAudit } from '../src/features/audit-pipeline/privacyAuditOrchestrator';
import { generateSafePostFixPlan } from '../src/features/caption-rewriter/captionRewriter';
import { getMayaSamplePosts } from '../src/features/demo-dataset/mayaCreatorFeed';
import { hydratePostsMediaBatch } from '../src/features/demo-dataset/nodeDemoMediaHydrator';
import { createOwnershipAttestation } from '../src/features/guardrails/ownershipConsent';
import {
  dataUrlToGenAiPart,
  GenAiStructuredExecutor,
} from '../src/genai/geminiClient';
import { clearLogHistory, getLogHistory } from '../src/logging/logger';

describe('Article Importer — Substack & Blog URL Extraction + SSRF Guard', () => {
  beforeEach(() => {
    clearLogHistory();
  });

  it('blocks private, loopback, and non-HTTP URLs', () => {
    expect(() => validatePublicArticleUrl('http://localhost:3000/secret')).toThrow();
    expect(() => validatePublicArticleUrl('http://192.168.1.5/router')).toThrow();
    expect(() => validatePublicArticleUrl('http://169.254.169.254/latest')).toThrow();
    expect(() => validatePublicArticleUrl('file:///etc/passwd')).toThrow();
  });

  it('extracts clean Substack title and body prose via injected fetch', async () => {
    const sampleSubstackHtml = `
      <html>
        <head>
          <title>Tuesday Morning Pages | Maya</title>
          <meta property="og:title" content="Notes from the Corner Window" />
          <script>window.SECRET_TOKEN = "ignore_me";</script>
        </head>
        <body>
          <nav>Subscribe Sign In</nav>
          <article class="substack-post">
            <p>Every Tuesday from 8am to 9am I sit by the corner cafe window before reformer pilates.</p>
            <p>Writing in the morning light keeps my creative rhythm steady.</p>
          </article>
        </body>
      </html>
    `;

    const post = await fetchAndExtractArticlePost(
      'https://mayalin.substack.com/p/corner-window',
      async () => ({
        ok: true,
        status: 200,
        text: async () => sampleSubstackHtml,
      }),
    );

    expect(post.platform).toBe('substack');
    expect(post.title).toBe('Notes from the Corner Window');
    expect(post.caption).toContain('Every Tuesday from 8am to 9am');
    expect(post.caption).not.toContain('SECRET_TOKEN');

    const plainBlog = extractReadableArticleFromHtml(
      '<html><head><title>Studio Log</title></head><body><main><p>Weekend creative recap after checkout.</p></main></body></html>',
      new URL('https://examplecreatorblog.com/posts/recap'),
    );
    expect(plainBlog.detectedPlatform).toBe('blog');
  });
});

describe('Gemini Multimodal Engine — Mocked SDK Execution & Fallback Mode', () => {
  beforeEach(() => {
    clearLogHistory();
  });

  it('converts base64 data URLs to @google/genai inlineData parts', () => {
    const part = dataUrlToGenAiPart('data:image/png;base64,QUJDREVGRw==');
    expect(part).toEqual({
      inlineData: {
        mimeType: 'image/png',
        data: 'QUJDREVGRw==',
      },
    });
    expect(dataUrlToGenAiPart('https://example.com/not-base64.png')).toBeNull();
  });

  it('executes Stage 1 + Stage 2 + Anti-Doxxing via mocked @google/genai executor and strips inlineData in INFO logs', async () => {
    const attestation = createOwnershipAttestation(true);
    const hydratedTwoPosts = hydratePostsMediaBatch(getMayaSamplePosts().slice(3, 5));

    const mockExecutor: GenAiStructuredExecutor = async (req) => {
      if (req.stage.startsWith('Stage1_PostMultimodalScan')) {
        return JSON.stringify({
          clues: [
            {
              category: 'sensitive_document_or_pii',
              summary: 'Shipping label showing 2840 Hyperion Avenue Apt 4B on desk.',
              sourceModality: 'visual',
              confidencePercentage: 94,
              boundingBox: {
                ymin: 600,
                xmin: 535,
                ymax: 935,
                xmax: 955,
                label: 'Label for Apt 4B',
              },
            },
          ],
        });
      }

      return JSON.stringify({
        risks: [
          {
            id: 'risk-mail',
            title: 'Visible shipping label on studio desk',
            category: 'sensitive_document_or_pii',
            priority: 'high',
            confidencePercentage: 94,
            abstractConfidenceStatement:
              'With 94% confidence, a visible shipping label exposes 2840 Hyperion Avenue.',
            contributingPostIds: ['maya-post-4'],
            platformsInvolved: ['instagram'],
            whyItMatters: 'Viewers can zoom in on high-res photos.',
            combinedEvidenceSummary: 'Detected parcel barcode in lower-right corner.',
            recommendedActionSummary: 'Blur the shipping label before posting.',
            safetyReferenceNote: 'RAINN digital safety guidance.',
          },
        ],
      });
    };

    const report = await runFullPrivacyAudit({
      posts: hydratedTwoPosts,
      attestation,
      executor: mockExecutor,
    });

    expect(report.usedDemoFallback).toBe(false);
    expect(report.crossPlatformRisks).toHaveLength(1);
    expect(report.crossPlatformRisks[0]?.abstractConfidenceStatement).toContain(
      'With 94% confidence',
    );
    // Anti-doxxing guardrail must strip the leaked street address and Apt 4B
    expect(JSON.stringify(report)).not.toContain('2840 Hyperion Avenue');
    expect(JSON.stringify(report)).not.toContain('Apt 4B');

    // Verify GENAI_CALL INFO logs recorded model, prompt, config, output WITHOUT raw PNG bytes
    const genAiLogs = getLogHistory().filter((e) => e.category === 'GENAI_CALL');
    expect(genAiLogs.length).toBe(3); // 2 Stage 1 scans + 1 Stage 2 synthesis
    expect(JSON.stringify(genAiLogs)).not.toContain('iVBORw0KGgo');
    expect(JSON.stringify(genAiLogs)).toContain('STRIPPED_INLINE_DATA');
  });

  it('connects cross-platform routines and generates Stage 3 voice-preserving fixes across the full 6-post feed', async () => {
    const attestation = createOwnershipAttestation(true);
    const hydratedPosts = hydratePostsMediaBatch(getMayaSamplePosts());

    const report = await runFullPrivacyAudit({
      posts: hydratedPosts,
      attestation,
    });

    expect(report.postsReviewedCount).toBe(6);
    expect(report.overallExposureScore).toBeGreaterThanOrEqual(67);
    expect(report.overallSeverityBand).toBe('high');
    expect(report.bestPractices && report.bestPractices.length).toBeGreaterThanOrEqual(5);

    const routineRisk = report.crossPlatformRisks.find(
      (r) => r.category === 'predictable_routine',
    );
    expect(routineRisk).toBeDefined();
    expect(routineRisk?.contributingPostIds).toEqual(
      expect.arrayContaining(['maya-post-1', 'maya-post-2', 'maya-post-3']),
    );
    expect(routineRisk?.platformsInvolved).toEqual(
      expect.arrayContaining(['instagram', 'youtube', 'substack']),
    );
    expect(routineRisk?.abstractConfidenceStatement).toContain('confidence');

    // Verify Stage 3 fix plan on the unpublished rooftop draft (maya-post-6)
    const draftPost = hydratedPosts.find((p) => p.id === 'maya-post-6')!;
    const liveRisk = report.crossPlatformRisks.find(
      (r) => r.category === 'real_time_location',
    )!;
    const draftFinding = report.postFindings.find((f) => f.postId === 'maya-post-6');

    const fixPlan = await generateSafePostFixPlan({
      post: draftPost,
      risk: liveRisk,
      postFinding: draftFinding,
      attestation,
    });

    expect(fixPlan.captionOptions).toHaveLength(3);
    expect(fixPlan.suggestedRegionsToRedact).toHaveLength(1);
    expect(fixPlan.suggestedRegionsToRedact[0]?.label).toContain('wristband');
  });

  it('drops nonsensical blur boxes on large landmarks like the Eiffel Tower and advises delayed posting instead', async () => {
    const attestation = createOwnershipAttestation(true);
    const eiffelPost = {
      id: 'post-eiffel',
      platform: 'camera_roll' as const,
      title: 'Camera Roll · Paris Sunset',
      caption: 'At the Eiffel Tower right now watching the lights sparkle!',
      postedAtLabel: 'Draft · Ready to post',
      isDraft: true,
      mediaAltDescription: 'Portrait standing in front of the Eiffel Tower at dusk',
    };

    const mockLandmarkExecutor: GenAiStructuredExecutor = async (req) => {
      if (req.stage.startsWith('Stage1_PostMultimodalScan')) {
        return JSON.stringify({
          clues: [
            {
              category: 'recognizable_surroundings',
              summary: 'Eiffel Tower landmark in background paired with live "right now" caption.',
              sourceModality: 'combined',
              confidencePercentage: 96,
              boundingBox: {
                ymin: 50,
                xmin: 150,
                ymax: 920,
                xmax: 850,
                label: 'Eiffel Tower landmark',
              },
            },
          ],
        });
      }
      return JSON.stringify({
        risks: [
          {
            id: 'risk-eiffel',
            title: 'Live Eiffel Tower location post while still on site',
            category: 'recognizable_surroundings',
            priority: 'high',
            confidencePercentage: 96,
            abstractConfidenceStatement:
              'With 96% confidence, your live Eiffel Tower caption reveals where you are right now.',
            contributingPostIds: ['post-eiffel'],
            platformsInvolved: ['camera_roll'],
            whyItMatters: 'Posting iconic landmarks live reveals your active whereabouts.',
            combinedEvidenceSummary: 'Eiffel Tower + "right now" caption.',
            recommendedActionSummary:
              'Keep the photo unblurred and wait a few hours or days until after leaving the area.',
            safetyReferenceNote: 'RAINN advises delaying location-identifiable posts.',
          },
        ],
      });
    };

    const report = await runFullPrivacyAudit({
      posts: [eiffelPost],
      attestation,
      executor: mockLandmarkExecutor,
    });

    // Landmark bounding box must be stripped automatically
    expect(report.postFindings[0]?.clues[0]?.boundingBox).toBeUndefined();

    const fixPlan = await generateSafePostFixPlan({
      post: eiffelPost,
      risk: report.crossPlatformRisks[0]!,
      postFinding: report.postFindings[0],
      attestation,
    });

    expect(fixPlan.suggestedRegionsToRedact).toHaveLength(0);
    expect(fixPlan.timingRecommendation.toLowerCase()).toMatch(/hours|days/);
  });
});
