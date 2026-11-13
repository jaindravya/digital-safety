/**
 * @file src/features/upload/cameraRollReader.ts
 * @description Validator and client-side reader converting original Android/Mac
 * camera-roll photo files into ephemeral `CreatorPost` items.
 *
 * Feature Overview:
 * Enforces Unseen's MVP media rules on uploaded files:
 *   - Accepts original image formats (`image/jpeg`, `image/png`, `image/webp`, `image/heic`).
 *   - Enforces a strict `20MB` per-photo cap.
 *   - Clearly rejects video files (`video/*`) with a friendly note explaining that
 *     short-form video & Reels auditing is planned for V1.
 *
 * Primary Use Cases:
 * 1. Validating files chosen from the Android Gallery / iOS Photo Library / Mac Finder.
 * 2. Reading valid photos into ephemeral in-memory base64 data URLs (`CreatorPost`).
 */

import { CreatorPost } from '../../domain/privacyTypes';
import { logFunctionCall } from '../../logging/logger';

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
 * Reads a browser `File` into a `data:image/*;base64,...` string and constructs a
 * ready-to-edit `CreatorPost` item.
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
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const cleanTitle = file.name.replace(/\.[^.]+$/, '');
      resolve({
        id: `cam-${Date.now()}-${indexOffset}`,
        platform: 'camera_roll',
        title: `Camera Roll · ${cleanTitle}`,
        caption: '',
        postedAtLabel: 'Original photo · Add caption or timing note below',
        isDraft: true,
        imageDataUrl: dataUrl,
        mediaMimeType: file.type || 'image/jpeg',
        mediaAltDescription: `Uploaded camera-roll photo (${file.name})`,
      });
    };
    reader.onerror = () =>
      reject(new Error(`Could not read photo "${file.name}" from device.`));
    reader.readAsDataURL(file);
  });
}
