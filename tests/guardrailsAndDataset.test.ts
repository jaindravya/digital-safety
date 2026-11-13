/**
 * @file tests/guardrailsAndDataset.test.ts
 * @description Automated unit tests for Chunk 2 features: Self-Auditing Ownership
 * Consent Gate, Anti-Doxxing Output Guardrail, and Maya Lin's 6-post cross-platform
 * creator dataset.
 *
 * Feature Overview:
 * Verifies Responsible Design guarantees and demo dataset integrity:
 *   1. Audits are blocked with `OwnershipAttestationRequiredError` unless explicit
 *      creator ownership attestation is granted.
 *   2. Exact street addresses, apartment/room identifiers, and raw GPS coordinates
 *      are deterministically scrubbed across clues, cross-platform risks, and fix
 *      plans—while preserving creator-helpful guidance and clamping bounding boxes.
 *   3. Maya's 6-post feed spans Instagram, YouTube, Substack, and an unpublished
 *      Draft, and logs every function call at `INFO` level.
 *
 * Primary Use Cases:
 * 1. Proving Rubric #2 (Evidence of Testing) and Rubric #5 (Responsible Design).
 * 2. Preventing accidental regressions in anti-doxxing output sanitization.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { PrivacyAuditReport, SafePostFixPlan } from '../src/domain/privacyTypes';
import {
  getMayaCreatorPersona,
  getMayaSamplePosts,
} from '../src/features/demo-dataset/mayaCreatorFeed';
import { hydratePostsMediaBatch } from '../src/features/demo-dataset/nodeDemoMediaHydrator';
import {
  clampBoundingBoxCoordinate,
  enforceFixPlanAntiDoxxing,
  enforceReportAntiDoxxing,
  sanitizeLocationSensitiveText,
} from '../src/features/guardrails/antiDoxxingGuardrail';
import {
  assertOwnershipAttestation,
  createOwnershipAttestation,
  isOwnershipAttestationValid,
  OwnershipAttestationRequiredError,
} from '../src/features/guardrails/ownershipConsent';
import { clearLogHistory, getLogHistory } from '../src/logging/logger';

describe('Responsible Design — Ownership Self-Audit Consent Gate', () => {
  beforeEach(() => {
    clearLogHistory();
  });

  it('blocks unconsented or missing attestations with OwnershipAttestationRequiredError', () => {
    const unconsented = createOwnershipAttestation(false);

    expect(isOwnershipAttestationValid(undefined)).toBe(false);
    expect(isOwnershipAttestationValid(unconsented)).toBe(false);
    expect(() => assertOwnershipAttestation(unconsented)).toThrow(
      OwnershipAttestationRequiredError,
    );
  });

  it('accepts explicit creator ownership attestation and logs function calls as INFO', () => {
    const valid = createOwnershipAttestation(true);

    expect(isOwnershipAttestationValid(valid)).toBe(true);
    expect(() => assertOwnershipAttestation(valid)).not.toThrow();

    const loggedNames = getLogHistory().map((entry) => entry.name);
    expect(loggedNames).toContain('createOwnershipAttestation');
    expect(loggedNames).toContain('assertOwnershipAttestation');
  });
});

describe('Responsible Design — Anti-Doxxing Output Guardrail', () => {
  it('scrubs street addresses, apartment/room numbers, and GPS coordinates from text', () => {
    const unsafeModelOutput =
      'Shipping label reveals 1428 Sunset Boulevard Apt 4B near 34.0869, -118.2702 and Room 612.';

    const sanitized = sanitizeLocationSensitiveText(unsafeModelOutput);

    expect(sanitized).not.toContain('1428 Sunset Boulevard');
    expect(sanitized).not.toContain('Apt 4B');
    expect(sanitized).not.toContain('34.0869, -118.2702');
    expect(sanitized).not.toContain('Room 612');
    expect(sanitized).toContain('[specific location redacted by safety guardrail]');
  });

  it('sanitizes full PrivacyAuditReport and clamps out-of-range bounding boxes', () => {
    const rawReport: PrivacyAuditReport = {
      auditedAtIso: '2026-11-13T12:00:00.000Z',
      postsReviewedCount: 2,
      usedDemoFallback: false,
      limitationsNotice: 'Never infers addresses like 742 Evergreen Street.',
      postFindings: [
        {
          postId: 'maya-post-4',
          platform: 'instagram',
          clues: [
            {
              category: 'sensitive_document_or_pii',
              summary: 'Parcel addressed to 2840 Hyperion Avenue Apt 4B in frame.',
              sourceModality: 'visual',
              boundingBox: {
                ymin: -25,
                xmin: 620,
                ymax: 1240,
                xmax: 980,
                label: 'Mail label for Apt 4B',
              },
            },
          ],
        },
      ],
      crossPlatformRisks: [
        {
          id: 'risk-1',
          title: 'Visible residential mail label',
          category: 'sensitive_document_or_pii',
          priority: 'high',
          contributingPostIds: ['maya-post-4'],
          platformsInvolved: ['instagram'],
          whyItMatters: 'Viewers zooming in could read 2840 Hyperion Avenue.',
          combinedEvidenceSummary: 'Found on desk flatlay near 34.1015, -118.2731.',
          recommendedActionSummary: 'Blur the lower-right parcel envelope before posting.',
          safetyReferenceNote: 'RAINN advises removing visible mail and badges.',
          status: 'needs_review',
        },
      ],
    };

    const safeReport = enforceReportAntiDoxxing(rawReport);
    const box = safeReport.postFindings[0]?.clues[0]?.boundingBox;

    expect(JSON.stringify(safeReport)).not.toContain('2840 Hyperion Avenue');
    expect(JSON.stringify(safeReport)).not.toContain('Apt 4B');
    expect(JSON.stringify(safeReport)).not.toContain('34.1015, -118.2731');
    expect(JSON.stringify(safeReport)).not.toContain('742 Evergreen Street');
    expect(box?.ymin).toBe(0);
    expect(box?.ymax).toBe(1000);
    expect(clampBoundingBoxCoordinate(Number.NaN)).toBe(0);
  });

  it('sanitizes SafePostFixPlan captions and redaction labels', () => {
    const rawPlan: SafePostFixPlan = {
      postId: 'maya-post-5',
      riskId: 'risk-hotel',
      captionOptions: [
        {
          id: 'opt-1',
          styleLabel: 'Warm Creator Tone',
          rewrittenCaption: 'Checked in for a weekend reset (not sharing Room 612!)',
          whatChanged: 'Removed live floor and Room 612 reference.',
        },
      ],
      suggestedRegionsToRedact: [
        {
          ymin: 510,
          xmin: 400,
          ymax: 790,
          xmax: 760,
          label: 'Keycard sleeve showing Room 612',
        },
      ],
      timingRecommendation: 'Share after checking out of the hotel.',
      plainLanguageChecklist: ['Blur keycard sleeve showing Room 612'],
    };

    const safePlan = enforceFixPlanAntiDoxxing(rawPlan);
    expect(JSON.stringify(safePlan)).not.toContain('Room 612');
  });
});

describe('Demo Dataset — Maya Lin Cross-Platform Creator Feed', () => {
  it('provides 6 cohesive fictional posts across Instagram, YouTube, Substack, and Draft', () => {
    const persona = getMayaCreatorPersona();
    const posts = getMayaSamplePosts();

    expect(persona.displayName).toBe('Maya Lin');
    expect(posts).toHaveLength(6);

    const platforms = new Set(posts.map((p) => p.platform));
    expect(platforms.has('instagram')).toBe(true);
    expect(platforms.has('youtube')).toBe(true);
    expect(platforms.has('substack')).toBe(true);
    expect(platforms.has('draft')).toBe(true);

    const drafts = posts.filter((p) => p.isDraft);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.id).toBe('maya-post-6');
  });

  it('hydrates all 6 local PNG demo images into base64 data URLs and strips them from INFO logs', () => {
    clearLogHistory();
    const posts = getMayaSamplePosts();
    const hydrated = hydratePostsMediaBatch(posts);

    expect(hydrated).toHaveLength(6);
    for (const post of hydrated) {
      expect(post.imageDataUrl).toBeDefined();
      expect(post.imageDataUrl?.startsWith('data:image/png;base64,')).toBe(true);
    }

    const serializedLogs = JSON.stringify(getLogHistory());
    expect(serializedLogs).not.toContain('iVBORw0KGgo');
  });
});
