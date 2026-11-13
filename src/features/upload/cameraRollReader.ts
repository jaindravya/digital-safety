/**
 * @file src/features/upload/cameraRollReader.ts
 * @description Validator, client-side EXIF privacy inspector, and local metadata
 * auto-stripper converting original Android/iOS/Mac camera-roll photo files into
 * ephemeral `CreatorPost` items.
 *
 * Feature Overview:
 * Enforces Unseen's MVP media and Responsible Design rules on uploaded files:
 *   - Accepts original image formats (`image/jpeg`, `image/png`, `image/webp`, `image/heic`).
 *   - Enforces a strict `20MB` per-photo cap.
 *   - Clearly rejects video files (`video/*`) with a friendly note explaining that
 *     short-form video & Reels auditing is planned for V1.
 *   - Inspects raw uploaded photo bytes for hidden EXIF GPS coordinates, capture
 *     timestamps, and hardware serial tags (`scanImageDataUrlForExifPrivacy`), records
 *     a zero-PII `exifScanSummary` for Stage 1 & Stage 2 auditing, and immediately
 *     strips raw EXIF headers in memory (`stripBinaryMetadataFromDataUrl`) so raw GPS
 *     coordinates never leave the creator's device or persist in exported downloads.
 *
 * Primary Use Cases:
 * 1. Validating files chosen from the Android Gallery / iOS Photo Library / Mac Finder.
 * 2. Reading valid photos into sanitized in-memory data URLs (`CreatorPost`) with
 *    preserved zero-PII EXIF risk telemetry.
 */

import { APP_CONFIG } from '../../config/appConfig';
import { CreatorPost, ExifPrivacyScanSummary } from '../../domain/privacyTypes';
import { logFunctionCall } from '../../logging/logger';
import { scanImageDataUrlForExifPrivacy } from '../exif-scanner/exifMetadataScanner';
import { stripBinaryMetadataFromDataUrl } from '../exif-scanner/exifMetadataStripper';

/**
 * Maximum allowed raw photo size in bytes (`20MB`).
 */
export const MAX_PHOTO_UPLOAD_BYTES = 20 * 1024 * 1024;

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/**
 * Minimal file metadata shape enabling pure unit testing without browser `File` globals.
 */
export interface UploadFileDescriptor {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

/**
 * Validates whether a candidate file from the user's camera roll is an accepted
 * image under `20MB`, returning `null` if valid or a user-facing error message.
 *
 * @param file - File metadata (`name`, `type`, `size`).
 * @returns `null` when valid; human-readable validation message when rejected.
 */
export function validateCameraRollFile(
  file: UploadFileDescriptor,
): string | null {
  logFunctionCall('validateCameraRollFile', {
    name: file.name,
    type: file.type,
    size: file.size,
  });

  const lowerType = file.type.toLowerCase();
  if (lowerType.startsWith('video/') || /\.(mp4|mov|webm|avi)$/i.test(file.name)) {
    return `"${file.name}" is a video file. Unseen MVP audits photos and blog articles—short-form video & Reels scanning is coming in V1!`;
  }

  if (!ALLOWED_IMAGE_MIMES.has(lowerType) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
    return `"${file.name}" is not a supported image format. Please choose a JPG, PNG, or WebP photo from your camera roll.`;
  }

  if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
    return `"${file.name}" exceeds the 20MB photo limit. Please choose a photo under 20MB.`;
  }

  return null;
}

/**
 * Inspects a raw camera-roll base64 data URL for hidden EXIF GPS and capture-time
 * metadata, then auto-strips binary EXIF/XMP segments when enabled in `APP_CONFIG.exif`.
 *
 * @param rawDataUrl - Raw base64 data URL read from the user's selected photo file.
 * @returns Sanitized `imageDataUrl`, zero-PII `exifScanSummary`, and user-facing `postedAtLabel`.
 */
export function inspectAndSanitizeUploadedDataUrl(rawDataUrl: string): {
  readonly sanitizedDataUrl: string;
  readonly exifScanSummary: ExifPrivacyScanSummary;
  readonly postedAtLabel: string;
} {
  logFunctionCall('inspectAndSanitizeUploadedDataUrl', {
    inputLength: rawDataUrl.length,
  });

  const rawScan = scanImageDataUrlForExifPrivacy(rawDataUrl);

  let sanitizedDataUrl = rawDataUrl;
  let strippedSegmentsCount = 0;

  if (APP_CONFIG.exif.autoStripOnClientUpload && rawScan.hasExifMetadata) {
    const stripped = stripBinaryMetadataFromDataUrl(rawDataUrl);
    sanitizedDataUrl = stripped.cleanDataUrl;
    strippedSegmentsCount = stripped.strippedSegmentsCount;
  }

  const exifScanSummary: ExifPrivacyScanSummary = {
    ...rawScan,
    metadataWasAutoStripped: strippedSegmentsCount > 0,
  };

  let postedAtLabel = 'Original photo · Add caption or timing note below';
  if (exifScanSummary.hasEmbeddedGps) {
    postedAtLabel = exifScanSummary.metadataWasAutoStripped
      ? 'Original photo · Hidden EXIF GPS metadata detected & auto-stripped'
      : 'Original photo · Hidden EXIF GPS metadata detected in file';
  } else if (
    exifScanSummary.hasCaptureTimestamp &&
    exifScanSummary.captureTimeWindowCue
  ) {
    postedAtLabel = `Original photo · EXIF capture window: ${exifScanSummary.captureTimeWindowCue}`;
  }

  return {
    sanitizedDataUrl,
    exifScanSummary,
    postedAtLabel,
  };
}

/**
 * Reads a browser `File` into a `data:image/*;base64,...` string, inspects & strips
 * hidden EXIF GPS/capture metadata locally, and constructs a ready-to-audit `CreatorPost`.
 *
 * @param file - Validated browser `File` object from an `<input type="file">`.
 * @param indexOffset - Numeric index used to generate a stable ephemeral ID.
 * @returns Promise resolving to an in-memory `CreatorPost`.
 */
export function readCameraRollFileToPost(
  file: File,
  indexOffset = 0,
): Promise<CreatorPost> {
  logFunctionCall('readCameraRollFileToPost', {
    name: file.name,
    type: file.type,
    size: file.size,
  });

  return new Promise((resolve, reject) => {
    const validationError = validateCameraRollFile(file);
    if (validationError) {
      reject(new Error(validationError));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
      const { sanitizedDataUrl, exifScanSummary, postedAtLabel } =
        inspectAndSanitizeUploadedDataUrl(rawDataUrl);
      const cleanTitle = file.name.replace(/\.[^.]+$/, '');
      resolve({
        id: `cam-${Date.now()}-${indexOffset}`,
        platform: 'camera_roll',
        title: `Camera Roll · ${cleanTitle}`,
        caption: '',
        postedAtLabel,
        isDraft: true,
        imageDataUrl: sanitizedDataUrl,
        mediaMimeType: file.type || 'image/jpeg',
        mediaAltDescription: `Uploaded camera-roll photo (${file.name})`,
        exifScanSummary,
      });
    };
    reader.onerror = () =>
      reject(new Error(`Could not read photo "${file.name}" from device.`));
    reader.readAsDataURL(file);
  });
}
