/**
 * @file src/features/image-redactor/canvasImageRedactor.ts
 * @description Client-side HTML5 Canvas image redactor applying Smart Blur and
 * frosted pixelation over normalized Gemini bounding boxes (`0..1000` scale).
 *
 * Feature Overview:
 * When Stage 1 multimodal analysis detects sensitive visual objects (parcel shipping
 * labels, hotel keycards, VIP event wristbands, street signs), it returns normalized
 * `[ymin, xmin, ymax, xmax]` coordinates. This module maps those normalized boxes
 * onto any resolution image in the browser/PWA canvas, applies padding from
 * `APP_CONFIG.redaction`, renders a multi-pass privacy blur + subtle pixelation so
 * underlying barcodes/text cannot be reconstructed, and exports a clean PNG data URL
 * ready for Before/After preview and one-tap download on Android and Mac.
 *
 * Primary Use Cases:
 * 1. Auto-blurring Gemini-detected PII regions in `SafeFixStudioModal`.
 * 2. Applying additional creator-drawn custom bounding boxes (human-in-the-loop oversight).
 * 3. Computing pixel rectangles from normalized `0..1000` coordinates for SVG overlays.
 */

import { APP_CONFIG } from '../../config/appConfig';
import { NormalizedBoundingBox } from '../../domain/privacyTypes';
import { logFunctionCall } from '../../logging/logger';

/**
 * Pixel-space rectangle computed for a specific image width and height.
 */
export interface PixelBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

/**
 * Converts a normalized `0..1000` `NormalizedBoundingBox` into clamped pixel
 * coordinates for an image of dimensions `imageWidth × imageHeight`, applying a
 * small safety padding margin around sensitive text/barcodes.
 *
 * @param box - Normalized `[ymin, xmin, ymax, xmax]` box from Gemini or user drag.
 * @param imageWidth - Natural pixel width of the target image.
 * @param imageHeight - Natural pixel height of the target image.
 * @returns Clamped `PixelBoundingBox` in image pixel coordinates.
 */
export function normalizedBoxToPixelRect(
  box: NormalizedBoundingBox,
  imageWidth: number,
  imageHeight: number,
): PixelBoundingBox {
  logFunctionCall('normalizedBoxToPixelRect', {
    box,
    imageWidth,
    imageHeight,
  });

  const scale = APP_CONFIG.genai.boundingBoxCoordinateScale;
  const padRatio = APP_CONFIG.redaction.boundingBoxPaddingRatio;

  const rawX = (Math.min(box.xmin, box.xmax) / scale) * imageWidth;
  const rawY = (Math.min(box.ymin, box.ymax) / scale) * imageHeight;
  const rawW = (Math.abs(box.xmax - box.xmin) / scale) * imageWidth;
  const rawH = (Math.abs(box.ymax - box.ymin) / scale) * imageHeight;

  const padX = rawW * padRatio;
  const padY = rawH * padRatio;

  const x = Math.max(0, Math.round(rawX - padX));
  const y = Math.max(0, Math.round(rawY - padY));
  const width = Math.min(imageWidth - x, Math.max(8, Math.round(rawW + padX * 2)));
  const height = Math.min(imageHeight - y, Math.max(8, Math.round(rawH + padY * 2)));

  return {
    x,
    y,
    width,
    height,
    label: box.label,
  };
}

/**
 * Loads an image source (`data:` URL or `/demo-media/*.png` path) into an
 * `HTMLImageElement` inside browser/PWA environments.
 *
 * @param imageSrc - Image URL or base64 data URL.
 * @returns Promise resolving to a decoded `HTMLImageElement`.
 */
function loadHtmlImage(imageSrc: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image for redaction.'));
    img.src = imageSrc;
  });
}

/**
 * Renders irreversible pixelation + Gaussian blur over all specified normalized
 * bounding boxes on an image and returns a new `data:image/png;base64,...` URL.
 *
 * @param imageSrc - Source image URL or data URL.
 * @param boxes - Normalized `0..1000` bounding boxes to redact.
 * @param blurRadiusPx - Optional blur intensity override (defaults to `APP_CONFIG.redaction.defaultBlurRadiusPx`).
 * @returns Promise resolving to the redacted PNG data URL.
 */
export async function applyRedactionBoxesToImage(
  imageSrc: string,
  boxes: readonly NormalizedBoundingBox[],
  blurRadiusPx: number = APP_CONFIG.redaction.defaultBlurRadiusPx,
): Promise<string> {
  logFunctionCall('applyRedactionBoxesToImage', {
    boxCount: boxes.length,
    blurRadiusPx,
    imageSrc,
  });

  if (boxes.length === 0) {
    return imageSrc;
  }

  const img = await loadHtmlImage(imageSrc);
  const width = img.naturalWidth || 1000;
  const height = img.naturalHeight || 1000;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.');
  }

  ctx.drawImage(img, 0, 0, width, height);

  // Offscreen downscale canvas guarantees irreversible destruction of small text/barcodes
  // even on mobile WebViews where CSS `ctx.filter` support varies.
  const pixelCanvas = document.createElement('canvas');
  const pixelCtx = pixelCanvas.getContext('2d');

  for (const box of boxes) {
    const rect = normalizedBoxToPixelRect(box, width, height);

    if (pixelCtx) {
      const coarseW = Math.max(6, Math.round(rect.width / 18));
      const coarseH = Math.max(6, Math.round(rect.height / 18));
      pixelCanvas.width = coarseW;
      pixelCanvas.height = coarseH;
      pixelCtx.imageSmoothingEnabled = true;
      pixelCtx.drawImage(
        canvas,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        coarseW,
        coarseH,
      );

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 12);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      if (typeof ctx.filter === 'string') {
        ctx.filter = `blur(${Math.round(blurRadiusPx * 0.6)}px)`;
      }
      ctx.drawImage(
        pixelCanvas,
        0,
        0,
        coarseW,
        coarseH,
        rect.x - 10,
        rect.y - 10,
        rect.width + 20,
        rect.height + 20,
      );
      ctx.filter = 'none';
      ctx.fillStyle = 'rgba(250, 247, 242, 0.22)';
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
    }
  }

  return canvas.toDataURL('image/png');
}
