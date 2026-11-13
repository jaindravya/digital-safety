/**
 * @file src/features/exif-scanner/exifMetadataStripper.ts
 * @description Lossless binary EXIF, GPS, XMP, and IPTC metadata stripper for JPEG,
 * PNG, and WebP images across both browser/PWA and Node runtimes.
 *
 * Feature Overview:
 * Removes embedded location (`GPSInfo`), capture-time (`DateTimeOriginal`), camera
 * serial, and XMP/IPTC metadata segments directly from image container bytes without
 * degrading visual quality:
 *   - **JPEG**: Strips `APP1` (EXIF/XMP), `APP2`–`APP13` (IPTC/FlashPix), `APP15`,
 *     and `COM` segments while preserving `APP0` (JFIF), `APP14` (color transform),
 *     quantization/Huffman tables, and the lossless compressed `SOS` scan stream.
 *   - **PNG**: Strips `eXIf`, `tEXt`, `zTXt`, `iTXt`, and `tIME` chunks while keeping
 *     `IHDR`, color-profile chunks, `IDAT` pixel data, and `IEND` intact.
 *   - **WebP**: Strips `EXIF` and `XMP ` RIFF chunks, clears the `VP8X` EXIF/XMP header
 *     bits, and recalculates the container `RIFF` byte length.
 *
 * Primary Use Cases:
 * 1. Auto-stripping hidden EXIF GPS headers locally in `cameraRollReader.ts` the instant
 *    a creator selects a photo from their Android/iOS/Mac camera roll.
 * 2. Ensuring `applyRedactionBoxesToImage` in `canvasImageRedactor.ts` strips metadata
 *    even when zero visual blur boxes are needed (`boxes.length === 0`).
 * 3. Powering `POST /api/scan-exif` lossless server-side metadata sanitization.
 */

import { logFunctionCall } from '../../logging/logger';
import { detectImageBinaryFormat } from './exifMetadataScanner';

/**
 * Result of stripping metadata segments from raw image bytes or a base64 data URL.
 */
export interface StrippedImageResult {
  readonly bytes: Uint8Array;
  readonly strippedSegmentsCount: number;
}

/**
 * Decodes an entire `data:image/*;base64,...` URL into raw bytes + MIME prefix.
 *
 * @param dataUrl - Input base64 image data URL.
 * @returns Parsed `{ mimePrefix, bytes }` or `null` when not a base64 image data URL.
 */
function decodeFullImageDataUrl(
  dataUrl: string,
): { readonly mimePrefix: string; readonly bytes: Uint8Array } | null {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx <= 0) {
    return null;
  }
  const mimePrefix = dataUrl.slice(0, commaIdx);
  if (!/^data:image\/[a-zA-Z0-9.+-]+;base64$/i.test(mimePrefix)) {
    return null;
  }

  const base64Body = dataUrl.slice(commaIdx + 1).replace(/\s+/g, '');
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64Body, 'base64');
    return {
      mimePrefix,
      bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
    };
  }

  if (typeof atob === 'function') {
    const bin = atob(base64Body);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      out[i] = bin.charCodeAt(i);
    }
    return { mimePrefix, bytes: out };
  }

  return null;
}

/**
 * Encodes a `Uint8Array` back into a base64 `data:image/*;base64,...` URL.
 *
 * @param mimePrefix - Original `data:image/...;base64` header prefix.
 * @param bytes - Clean image byte array.
 * @returns Reassembled base64 data URL.
 */
function encodeBytesToDataUrl(mimePrefix: string, bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    const b64 = Buffer.from(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).toString('base64');
    return `${mimePrefix},${b64}`;
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const sub = bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength));
    binary += String.fromCharCode(...sub);
  }
  return `${mimePrefix},${btoa(binary)}`;
}

/**
 * Concatenates an array of `Uint8Array` slices into a single contiguous `Uint8Array`.
 */
function concatUint8Arrays(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let cursor = 0;
  for (const chunk of chunks) {
    combined.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return combined;
}

/**
 * Losslessly strips EXIF/XMP/IPTC/comment segments from JPEG bytes.
 */
function stripJpegMetadataBytes(bytes: Uint8Array): StrippedImageResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const keptChunks: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI (FF D8)
  let strippedSegmentsCount = 0;
  let offset = 2;

  while (offset < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      keptChunks.push(bytes.subarray(offset));
      break;
    }

    const markerStart = offset;
    while (offset < bytes.byteLength && bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.byteLength) {
      keptChunks.push(bytes.subarray(markerStart));
      break;
    }

    const marker = bytes[offset];
    offset += 1;

    // Start of Scan (FF DA) or End of Image (FF D9): copy remainder of compressed scan intact
    if (marker === 0xda || marker === 0xd9) {
      keptChunks.push(bytes.subarray(markerStart));
      break;
    }

    // Standalone markers without length
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      keptChunks.push(bytes.subarray(markerStart, offset));
      continue;
    }

    if (offset + 2 > bytes.byteLength) {
      keptChunks.push(bytes.subarray(markerStart));
      break;
    }

    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) {
      keptChunks.push(bytes.subarray(markerStart));
      break;
    }

    const segmentEnd = offset + segmentLength;
    const isMetadataMarker =
      marker === 0xe1 || // APP1 (EXIF & XMP)
      (marker >= 0xe2 && marker <= 0xed) || // APP2..APP13 (IPTC / FlashPix / Maker)
      marker === 0xef || // APP15
      marker === 0xfe; // COM comment

    if (isMetadataMarker) {
      strippedSegmentsCount += 1;
    } else {
      keptChunks.push(bytes.subarray(markerStart, segmentEnd));
    }

    offset = segmentEnd;
  }

  return {
    bytes:
      strippedSegmentsCount > 0 ? concatUint8Arrays(keptChunks) : bytes,
    strippedSegmentsCount,
  };
}

/**
 * Losslessly strips `eXIf`, `tEXt`, `zTXt`, `iTXt`, and `tIME` metadata chunks from PNG bytes.
 */
function stripPngMetadataBytes(bytes: Uint8Array): StrippedImageResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const keptChunks: Uint8Array[] = [bytes.subarray(0, 8)]; // 8-byte PNG signature
  let strippedSegmentsCount = 0;
  let offset = 8;

  while (offset + 12 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, false);
    const chunkType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    const chunkEnd = offset + 12 + chunkLength;
    if (chunkEnd > bytes.byteLength) {
      keptChunks.push(bytes.subarray(offset));
      break;
    }

    const isPrivateMetadataChunk =
      chunkType === 'eXIf' ||
      chunkType === 'tEXt' ||
      chunkType === 'zTXt' ||
      chunkType === 'iTXt' ||
      chunkType === 'tIME';

    if (isPrivateMetadataChunk) {
      strippedSegmentsCount += 1;
    } else {
      keptChunks.push(bytes.subarray(offset, chunkEnd));
    }

    offset = chunkEnd;
    if (chunkType === 'IEND') {
      break;
    }
  }

  return {
    bytes:
      strippedSegmentsCount > 0 ? concatUint8Arrays(keptChunks) : bytes,
    strippedSegmentsCount,
  };
}

/**
 * Losslessly strips `EXIF` and `XMP ` RIFF chunks from WebP bytes and updates headers.
 */
function stripWebpMetadataBytes(bytes: Uint8Array): StrippedImageResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerCopy = new Uint8Array(bytes.subarray(0, 12));
  const keptChunks: Uint8Array[] = [headerCopy];
  let strippedSegmentsCount = 0;
  let offset = 12;

  while (offset + 8 <= bytes.byteLength) {
    const fourCc = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const paddedSize = chunkSize + (chunkSize % 2);
    const chunkEnd = offset + 8 + paddedSize;

    if (offset + 8 + chunkSize > bytes.byteLength) {
      keptChunks.push(bytes.subarray(offset));
      break;
    }

    const clampedEnd = Math.min(chunkEnd, bytes.byteLength);

    if (fourCc === 'EXIF' || fourCc === 'XMP ') {
      strippedSegmentsCount += 1;
    } else if (fourCc === 'VP8X' && chunkSize >= 10) {
      const vp8xCopy = new Uint8Array(bytes.subarray(offset, clampedEnd));
      // Clear EXIF (0x08) and XMP (0x04) flag bits in VP8X flags byte (offset 8)
      vp8xCopy[8] = vp8xCopy[8] & ~0x0c;
      keptChunks.push(vp8xCopy);
    } else {
      keptChunks.push(bytes.subarray(offset, clampedEnd));
    }

    offset = clampedEnd;
  }

  if (strippedSegmentsCount === 0) {
    return { bytes, strippedSegmentsCount: 0 };
  }

  const rebuilt = concatUint8Arrays(keptChunks);
  const rebuiltView = new DataView(
    rebuilt.buffer,
    rebuilt.byteOffset,
    rebuilt.byteLength,
  );
  rebuiltView.setUint32(4, Math.max(0, rebuilt.byteLength - 8), true);

  return {
    bytes: rebuilt,
    strippedSegmentsCount,
  };
}

/**
 * Strips binary EXIF/GPS/XMP/IPTC metadata segments from raw JPEG, PNG, or WebP bytes.
 *
 * @param bytes - Input image byte buffer.
 * @returns `StrippedImageResult` containing cleaned bytes and count of removed segments.
 */
export function stripBinaryMetadataFromBytes(
  bytes: Uint8Array,
): StrippedImageResult {
  const format = detectImageBinaryFormat(bytes);
  logFunctionCall('stripBinaryMetadataFromBytes', {
    format,
    inputByteLength: bytes.byteLength,
  });

  if (format === 'jpeg') {
    return stripJpegMetadataBytes(bytes);
  }
  if (format === 'png') {
    return stripPngMetadataBytes(bytes);
  }
  if (format === 'webp') {
    return stripWebpMetadataBytes(bytes);
  }

  return { bytes, strippedSegmentsCount: 0 };
}

/**
 * Strips binary EXIF/GPS/XMP/IPTC metadata segments from a `data:image/*;base64,...` URL.
 *
 * @param dataUrl - Input base64 data URL (or static asset path, passed through safely).
 * @returns Cleaned `cleanDataUrl` and `strippedSegmentsCount`.
 */
export function stripBinaryMetadataFromDataUrl(dataUrl: string): {
  readonly cleanDataUrl: string;
  readonly strippedSegmentsCount: number;
} {
  logFunctionCall('stripBinaryMetadataFromDataUrl', {
    inputLength: dataUrl.length,
    isDataUrl: dataUrl.startsWith('data:image/'),
  });

  const decoded = decodeFullImageDataUrl(dataUrl);
  if (!decoded) {
    return { cleanDataUrl: dataUrl, strippedSegmentsCount: 0 };
  }

  const result = stripBinaryMetadataFromBytes(decoded.bytes);
  if (result.strippedSegmentsCount === 0) {
    return { cleanDataUrl: dataUrl, strippedSegmentsCount: 0 };
  }

  return {
    cleanDataUrl: encodeBytesToDataUrl(decoded.mimePrefix, result.bytes),
    strippedSegmentsCount: result.strippedSegmentsCount,
  };
}
