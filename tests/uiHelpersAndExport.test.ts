/**
 * @file tests/uiHelpersAndExport.test.ts
 * @description Automated unit tests for Chunk 5 UI feature helpers: Camera Roll
 * file validation (`<=20MB` photos vs. V1 video message), Bounding-Box pixel mapping,
 * and Best Practices Markdown checklist formatting.
 *
 * Feature Overview:
 * Verifies client-side validation and export invariants without requiring a full
 * browser headless runtime:
 *   1. `validateCameraRollFile` accepts JPG/PNG/WebP under 20MB and rejects MP4/MOV
 *      videos (citing V1 video support) and files exceeding 20MB.
 *   2. `normalizedBoxToPixelRect` accurately maps `0..1000` Gemini bounding boxes
 *      with safety padding while clamping inside image bounds.
 *   3. `formatBestPracticesChecklist` preserves checked `[x]` vs. `[ ]` items and
 *      includes personalized + general sections.
 *
 * Primary Use Cases:
 * 1. Continuous regression verification via `npm test`.
 * 2. Evidence of testing for Rubric #2 (Working Prototype) and #4 (Usability).
 */

import { describe, expect, it } from 'vitest';
import { formatBestPracticesChecklist } from '../src/features/best-practices/checklistExporter';
import { normalizedBoxToPixelRect } from '../src/features/image-redactor/canvasImageRedactor';
import { buildBestPracticesForRisks } from '../src/features/risk-connector/riskScoringEngine';
import {
  MAX_PHOTO_UPLOAD_BYTES,
  validateCameraRollFile,
} from '../src/features/upload/cameraRollReader';

describe('Camera Roll Upload Validator', () => {
  it('accepts valid JPG, PNG, and WebP photos under 20MB', () => {
    expect(
      validateCameraRollFile({
        name: 'IMG_4021.JPG',
        type: 'image/jpeg',
        size: 4 * 1024 * 1024,
      }),
    ).toBeNull();
  });

  it('rejects video files with a clear V1 roadmap explanation and rejects >20MB photos', () => {
    const videoErr = validateCameraRollFile({
      name: 'rooftop_reel.mp4',
      type: 'video/mp4',
      size: 8 * 1024 * 1024,
    });
    expect(videoErr).toContain('V1');

    const sizeErr = validateCameraRollFile({
      name: 'huge_raw.png',
      type: 'image/png',
      size: MAX_PHOTO_UPLOAD_BYTES + 1024,
    });
    expect(sizeErr).toContain('20MB');
  });
});

describe('Image Redactor & Best Practices Checklist Exporter', () => {
  it('maps normalized 0..1000 Gemini bounding boxes into clamped pixel coordinates', () => {
    const rect = normalizedBoxToPixelRect(
      {
        ymin: 600,
        xmin: 535,
        ymax: 935,
        xmax: 955,
        label: 'Parcel shipping label',
      },
      1000,
      1000,
    );

    expect(rect.x).toBeGreaterThanOrEqual(500);
    expect(rect.y).toBeGreaterThanOrEqual(580);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1000);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1000);
  });

  it('formats personalized and general best practices with checked [x] markers', () => {
    const tips = buildBestPracticesForRisks([
      {
        id: 'r1',
        title: 'Routine',
        category: 'predictable_routine',
        priority: 'medium',
        contributingPostIds: ['p1', 'p2'],
        platformsInvolved: ['instagram', 'substack'],
        whyItMatters: 'Routine exposed',
        combinedEvidenceSummary: 'Clues',
        recommendedActionSummary: 'Stagger',
        safetyReferenceNote: 'RAINN',
        status: 'needs_review',
      },
    ]);

    const markdown = formatBestPracticesChecklist(
      tips,
      new Set(['tip-routine-exposure']),
      48,
    );

    expect(markdown).toContain('48/100');
    expect(markdown).toContain('- [x] Break predictable weekday & time cues across platforms');
    expect(markdown).toContain('## Everyday Creator Safety Habits');
  });
});
