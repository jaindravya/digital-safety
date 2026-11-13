/**
 * @file src/features/exif-scanner/exifMetadataScanner.ts
 * @description Cross-platform binary image metadata scanner detecting hidden EXIF GPS
 * coordinates, capture timestamps, camera device headers, and hardware serial numbers
 * across JPEG, PNG, WebP, and HEIC/HEIF camera-roll files.
 *
 * Feature Overview:
 * Creators frequently share original camera-roll images on blogs, Substack newsletters,
 * Discord communities, or press kits without realizing raw photo files embed invisible
 * EXIF/TIFF/XMP headers containing exact GPS coordinates, capture times, and device IDs.
 *
 * This module inspects image bytes in memory (both in browser/PWA uploads and in Stage 1
 * backend scans) and converts hidden metadata into structured `ExifPrivacyScanSummary`
 * and `PostDisclosureClue` records—while enforcing Unseen's strict anti-doxxing rule:
 * raw coordinates, exact timestamps, and serial strings are NEVER stored or echoed.
 *
 * Primary Use Cases:
 * 1. Scanning uploaded Android/iOS/Mac camera-roll files in `cameraRollReader.ts` before
 *    auto-stripping raw EXIF headers locally.
 * 2. Scanning raw `imageDataUrl` payloads in Stage 1 (`postScanner.ts`) so hidden GPS
 *    and capture-time clues feed into Stage 2 cross-platform synthesis and scoring.
 * 3. Powering `POST /api/scan-exif` for direct metadata auditing.
 */

import { APP_CONFIG } from '../../config/appConfig';
import {
  ExifMetadataFieldKind,
  ExifPrivacyScanSummary,
  PostDisclosureClue,
} from '../../domain/privacyTypes';
import { logFunctionCall } from '../../logging/logger';
import {
  abstractExifTimestampToRoutineWindow,
  ParsedTiffPrivacySignals,
  parseTiffExifBuffer,
} from './tiffIfdParser';

/**
 * Decodes up to `APP_CONFIG.exif.maxScanBytes` from a `data:image/*;base64,...` URL
 * in both Node (`Buffer`) and browser/PWA (`atob`) environments without logging raw bytes.
 *
 * @param dataUrl - Base64 image data URL (`data:image/jpeg;base64,...`).
 * @returns Decoded `Uint8Array` header slice, or `null` if not a valid base64 data URL.
 */
export function decodeImageDataUrlHeaderBytes(
  dataUrl: string,
): Uint8Array | null {
  const commaIdx = dataUrl.indexOf(',');
  const isBase64DataUrl =
    commaIdx > 0 && /^data:image\/[a-zA-Z0-9.+-]+;base64$/i.test(dataUrl.slice(0, commaIdx));

  logFunctionCall('decodeImageDataUrlHeaderBytes', {
    isBase64DataUrl,
    inputLength: dataUrl.length,
  });

  if (!isBase64DataUrl) {
    return null;
  }

  // 4 base64 chars = 3 bytes; align slice to a multiple of 4
  const maxBase64Chars = Math.floor(APP_CONFIG.exif.maxScanBytes / 3) * 4;
  const rawBase64 = dataUrl
    .slice(commaIdx + 1, commaIdx + 1 + maxBase64Chars)
    .replace(/\s+/g, '');
  const alignedLength = rawBase64.length - (rawBase64.length % 4);
  if (alignedLength < 8) {
    return null;
  }
  const cleanBase64 = rawBase64.slice(0, alignedLength);

  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(cleanBase64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  if (typeof atob === 'function') {
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  return null;
}

/**
 * Identifies the binary container format of an image byte buffer from its magic bytes.
 *
 * @param bytes - Leading bytes of the image file.
 * @returns Detected container format (`'jpeg' | 'png' | 'webp' | 'heic' | 'unknown'`).
 */
export function detectImageBinaryFormat(
  bytes: Uint8Array,
): ExifPrivacyScanSummary['scannedFormat'] {
  logFunctionCall('detectImageBinaryFormat', { byteLength: bytes.byteLength });

  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return 'jpeg';
  }

  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }

  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return 'webp';
  }

  if (
    bytes.byteLength >= 12 &&
    bytes[4] === 0x66 && // f
    bytes[5] === 0x74 && // t
    bytes[6] === 0x79 && // y
    bytes[7] === 0x70 // p
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (/^(heic|heix|hevc|mif1|msf1)$/i.test(brand)) {
      return 'heic';
    }
  }

  return 'unknown';
}

/**
 * Checks an ASCII/UTF-8 XMP metadata packet for embedded GPS and capture-date tags
 * without extracting raw coordinate values.
 *
 * @param packetBytes - Raw XMP packet bytes.
 * @returns Zero-PII privacy signals discovered inside the XMP XML text.
 */
function inspectXmpPacketBytes(
  packetBytes: Uint8Array,
): Partial<ParsedTiffPrivacySignals> {
  const maxInspect = Math.min(packetBytes.byteLength, 65_536);
  let text = '';
  for (let i = 0; i < maxInspect; i += 1) {
    const b = packetBytes[i];
    if (b >= 32 && b <= 126) {
      text += String.fromCharCode(b);
    }
  }

  const hasGps =
    /exif:GPSLatitude\b/i.test(text) && /exif:GPSLongitude\b/i.test(text);
  const isoMatch =
    /(?:DateTimeOriginal|CreateDate|DateCreated)[=">:\s]+(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/i.exec(
      text,
    );

  let captureTimeWindowCue: string | undefined;
  if (isoMatch) {
    const exifStyle = `${isoMatch[1]}:${isoMatch[2]}:${isoMatch[3]} ${isoMatch[4]}:${isoMatch[5]}:${isoMatch[6]}`;
    captureTimeWindowCue = abstractExifTimestampToRoutineWindow(exifStyle);
  }

  const hasSerial = /SerialNumber|BodySerialNumber|CameraOwnerName/i.test(text);

  return {
    validTiffHeader: hasGps || Boolean(isoMatch) || hasSerial,
    hasEmbeddedGps: hasGps,
    hasCaptureTimestamp: Boolean(isoMatch),
    captureTimeWindowCue,
    hasUniqueSerialOrId: hasSerial,
  };
}

/**
 * Extracts TIFF/XMP privacy signals from a JPEG marker stream (`FF D8 ... FF DA`).
 */
function scanJpegExifSignals(bytes: Uint8Array): ParsedTiffPrivacySignals[] {
  const signals: ParsedTiffPrivacySignals[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    // Skip fill 0xFF bytes
    while (offset < bytes.byteLength && bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.byteLength) {
      break;
    }

    const marker = bytes[offset];
    offset += 1;

    // Start of Scan (0xDA) or End of Image (0xD9) ends header metadata markers
    if (marker === 0xda || marker === 0xd9) {
      break;
    }
    // Standalone markers without length
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      continue;
    }

    if (offset + 2 > bytes.byteLength) {
      break;
    }
    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) {
      break;
    }

    const payloadStart = offset + 2;
    const payloadLength = segmentLength - 2;

    if (marker === 0xe1 && payloadLength >= 6) {
      // Check "Exif\0\0"
      if (
        bytes[payloadStart] === 0x45 &&
        bytes[payloadStart + 1] === 0x78 &&
        bytes[payloadStart + 2] === 0x69 &&
        bytes[payloadStart + 3] === 0x66 &&
        bytes[payloadStart + 4] === 0x00 &&
        bytes[payloadStart + 5] === 0x00
      ) {
        const tiffSlice = bytes.subarray(
          payloadStart + 6,
          payloadStart + payloadLength,
        );
        signals.push(parseTiffExifBuffer(tiffSlice));
      } else if (payloadLength >= 29) {
        // Check Adobe XMP APP1 packet
        const xmpSignals = inspectXmpPacketBytes(
          bytes.subarray(payloadStart, payloadStart + payloadLength),
        );
        if (xmpSignals.validTiffHeader) {
          signals.push({
            validTiffHeader: true,
            hasEmbeddedGps: Boolean(xmpSignals.hasEmbeddedGps),
            hasCaptureTimestamp: Boolean(xmpSignals.hasCaptureTimestamp),
            captureTimeWindowCue: xmpSignals.captureTimeWindowCue,
            hasDeviceMakeOrModel: false,
            hasUniqueSerialOrId: Boolean(xmpSignals.hasUniqueSerialOrId),
          });
        }
      }
    }

    offset += segmentLength;
  }

  return signals;
}

/**
 * Extracts TIFF/XMP privacy signals from PNG chunks (`eXIf`, `iTXt`, `tEXt`).
 */
function scanPngExifSignals(bytes: Uint8Array): ParsedTiffPrivacySignals[] {
  const signals: ParsedTiffPrivacySignals[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;

  while (offset + 12 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, false);
    const chunkType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;

    if (dataEnd + 4 > bytes.byteLength) {
      break;
    }

    if (chunkType === 'eXIf' && chunkLength >= 8) {
      // Some writers include an "Exif\0\0" prefix; standard PNG eXIf starts at II/MM
      const startsWithExifPrefix =
        chunkLength >= 14 &&
        bytes[dataStart] === 0x45 &&
        bytes[dataStart + 1] === 0x78 &&
        bytes[dataStart + 2] === 0x69 &&
        bytes[dataStart + 3] === 0x66;
      const tiffSlice = bytes.subarray(
        startsWithExifPrefix ? dataStart + 6 : dataStart,
        dataEnd,
      );
      signals.push(parseTiffExifBuffer(tiffSlice));
    } else if ((chunkType === 'iTXt' || chunkType === 'tEXt') && chunkLength > 16) {
      const xmpSignals = inspectXmpPacketBytes(bytes.subarray(dataStart, dataEnd));
      if (xmpSignals.validTiffHeader) {
        signals.push({
          validTiffHeader: true,
          hasEmbeddedGps: Boolean(xmpSignals.hasEmbeddedGps),
          hasCaptureTimestamp: Boolean(xmpSignals.hasCaptureTimestamp),
          captureTimeWindowCue: xmpSignals.captureTimeWindowCue,
          hasDeviceMakeOrModel: false,
          hasUniqueSerialOrId: Boolean(xmpSignals.hasUniqueSerialOrId),
        });
      }
    } else if (chunkType === 'IEND') {
      break;
    }

    offset = dataEnd + 4; // skip 4-byte CRC
  }

  return signals;
}

/**
 * Extracts TIFF/XMP privacy signals from WebP RIFF chunks (`EXIF`, `XMP `).
 */
function scanWebpExifSignals(bytes: Uint8Array): ParsedTiffPrivacySignals[] {
  const signals: ParsedTiffPrivacySignals[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;

  while (offset + 8 <= bytes.byteLength) {
    const fourCc = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;

    if (dataEnd > bytes.byteLength) {
      break;
    }

    if (fourCc === 'EXIF' && chunkSize >= 8) {
      const hasExifPrefix =
        chunkSize >= 14 &&
        bytes[dataStart] === 0x45 &&
        bytes[dataStart + 1] === 0x78 &&
        bytes[dataStart + 2] === 0x69 &&
        bytes[dataStart + 3] === 0x66 &&
        bytes[dataStart + 4] === 0x00 &&
        bytes[dataStart + 5] === 0x00;
      signals.push(
        parseTiffExifBuffer(
          bytes.subarray(hasExifPrefix ? dataStart + 6 : dataStart, dataEnd),
        ),
      );
    } else if (fourCc === 'XMP ' && chunkSize > 16) {
      const xmpSignals = inspectXmpPacketBytes(bytes.subarray(dataStart, dataEnd));
      if (xmpSignals.validTiffHeader) {
        signals.push({
          validTiffHeader: true,
          hasEmbeddedGps: Boolean(xmpSignals.hasEmbeddedGps),
          hasCaptureTimestamp: Boolean(xmpSignals.hasCaptureTimestamp),
          captureTimeWindowCue: xmpSignals.captureTimeWindowCue,
          hasDeviceMakeOrModel: false,
          hasUniqueSerialOrId: Boolean(xmpSignals.hasUniqueSerialOrId),
        });
      }
    }

    // RIFF chunks are padded to even byte boundaries
    offset = dataEnd + (chunkSize % 2);
  }

  return signals;
}

/**
 * Extracts TIFF EXIF signals from HEIC/HEIF ISO-BMFF byte buffers (`"Exif\0\0"` item).
 */
function scanHeicExifSignals(bytes: Uint8Array): ParsedTiffPrivacySignals[] {
  const signals: ParsedTiffPrivacySignals[] = [];

  for (let i = 12; i + 14 < bytes.byteLength; i += 1) {
    if (
      bytes[i] === 0x45 && // E
      bytes[i + 1] === 0x78 && // x
      bytes[i + 2] === 0x69 && // i
      bytes[i + 3] === 0x66 && // f
      bytes[i + 4] === 0x00 &&
      bytes[i + 5] === 0x00
    ) {
      const tiffStart = i + 6;
      const isTiff =
        (bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49) ||
        (bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d);
      if (isTiff) {
        signals.push(parseTiffExifBuffer(bytes.subarray(tiffStart)));
        break;
      }
    }
  }

  return signals;
}

/**
 * Scans raw image bytes (`JPEG`, `PNG`, `WebP`, or `HEIC`) and returns a privacy-safe
 * `ExifPrivacyScanSummary` with zero raw GPS coordinates or serial numbers.
 *
 * @param bytes - Raw leading bytes of the image file.
 * @returns Structured `ExifPrivacyScanSummary`.
 */
export function scanImageBytesForExifPrivacy(
  bytes: Uint8Array,
): ExifPrivacyScanSummary {
  const scannedFormat = detectImageBinaryFormat(bytes);
  logFunctionCall('scanImageBytesForExifPrivacy', {
    scannedFormat,
    byteLength: bytes.byteLength,
  });

  let parsedSignals: ParsedTiffPrivacySignals[] = [];
  if (scannedFormat === 'jpeg') {
    parsedSignals = scanJpegExifSignals(bytes);
  } else if (scannedFormat === 'png') {
    parsedSignals = scanPngExifSignals(bytes);
  } else if (scannedFormat === 'webp') {
    parsedSignals = scanWebpExifSignals(bytes);
  } else if (scannedFormat === 'heic') {
    parsedSignals = scanHeicExifSignals(bytes);
  }

  const validSignals = parsedSignals.filter((s) => s.validTiffHeader);
  const hasEmbeddedGps = validSignals.some((s) => s.hasEmbeddedGps);
  const hasCaptureTimestamp = validSignals.some((s) => s.hasCaptureTimestamp);
  const captureTimeWindowCue = validSignals.find(
    (s) => s.captureTimeWindowCue,
  )?.captureTimeWindowCue;
  const hasDeviceMakeOrModel = validSignals.some((s) => s.hasDeviceMakeOrModel);
  const deviceCategoryCue = validSignals.find(
    (s) => s.deviceCategoryCue,
  )?.deviceCategoryCue;
  const hasUniqueSerialOrId = validSignals.some((s) => s.hasUniqueSerialOrId);

  const detectedFields: ExifMetadataFieldKind[] = [];
  if (hasEmbeddedGps) detectedFields.push('gps_coordinates');
  if (hasCaptureTimestamp) detectedFields.push('capture_timestamp');
  if (hasDeviceMakeOrModel) detectedFields.push('device_make_model');
  if (hasUniqueSerialOrId) detectedFields.push('hardware_serial');

  return {
    scannedFormat,
    hasExifMetadata: validSignals.length > 0 && detectedFields.length > 0,
    hasEmbeddedGps,
    hasCaptureTimestamp,
    captureTimeWindowCue,
    hasDeviceMakeOrModel,
    deviceCategoryCue,
    hasUniqueSerialOrId,
    metadataWasAutoStripped: false,
    detectedFields,
  };
}

/**
 * Scans a base64 `data:image/*;base64,...` string for hidden EXIF/XMP metadata.
 *
 * @param imageDataUrl - Optional base64 image data URL on a `CreatorPost`.
 * @returns Structured `ExifPrivacyScanSummary` (returns clean empty summary when absent).
 */
export function scanImageDataUrlForExifPrivacy(
  imageDataUrl?: string,
): ExifPrivacyScanSummary {
  logFunctionCall('scanImageDataUrlForExifPrivacy', {
    hasDataUrl: Boolean(imageDataUrl),
  });

  if (!imageDataUrl) {
    return {
      scannedFormat: 'unknown',
      hasExifMetadata: false,
      hasEmbeddedGps: false,
      hasCaptureTimestamp: false,
      hasDeviceMakeOrModel: false,
      hasUniqueSerialOrId: false,
      metadataWasAutoStripped: false,
      detectedFields: [],
    };
  }

  const bytes = decodeImageDataUrlHeaderBytes(imageDataUrl);
  if (!bytes) {
    return {
      scannedFormat: 'unknown',
      hasExifMetadata: false,
      hasEmbeddedGps: false,
      hasCaptureTimestamp: false,
      hasDeviceMakeOrModel: false,
      hasUniqueSerialOrId: false,
      metadataWasAutoStripped: false,
      detectedFields: [],
    };
  }

  return scanImageBytesForExifPrivacy(bytes);
}

/**
 * Merges a pre-upload client EXIF scan summary (recorded before local EXIF stripping)
 * with a backend Stage 1 byte scan so neither pre-stripped uploads nor raw API uploads
 * ever lose hidden metadata findings.
 *
 * @param liveByteScan - Result of scanning the current `post.imageDataUrl` bytes.
 * @param preUploadScan - Optional pre-strip summary attached by `cameraRollReader.ts`.
 * @returns Combined `ExifPrivacyScanSummary`.
 */
export function mergeExifScanSummaries(
  liveByteScan: ExifPrivacyScanSummary,
  preUploadScan?: ExifPrivacyScanSummary,
): ExifPrivacyScanSummary {
  logFunctionCall('mergeExifScanSummaries', {
    liveHasExif: liveByteScan.hasExifMetadata,
    preUploadHasExif: preUploadScan?.hasExifMetadata ?? false,
  });

  if (!preUploadScan) {
    return liveByteScan;
  }

  const hasEmbeddedGps =
    liveByteScan.hasEmbeddedGps || preUploadScan.hasEmbeddedGps;
  const hasCaptureTimestamp =
    liveByteScan.hasCaptureTimestamp || preUploadScan.hasCaptureTimestamp;
  const hasDeviceMakeOrModel =
    liveByteScan.hasDeviceMakeOrModel || preUploadScan.hasDeviceMakeOrModel;
  const hasUniqueSerialOrId =
    liveByteScan.hasUniqueSerialOrId || preUploadScan.hasUniqueSerialOrId;

  const detectedSet = new Set<ExifMetadataFieldKind>([
    ...liveByteScan.detectedFields,
    ...preUploadScan.detectedFields,
  ]);

  return {
    scannedFormat:
      preUploadScan.scannedFormat !== 'unknown'
        ? preUploadScan.scannedFormat
        : liveByteScan.scannedFormat,
    hasExifMetadata:
      liveByteScan.hasExifMetadata || preUploadScan.hasExifMetadata,
    hasEmbeddedGps,
    hasCaptureTimestamp,
    captureTimeWindowCue:
      preUploadScan.captureTimeWindowCue ?? liveByteScan.captureTimeWindowCue,
    hasDeviceMakeOrModel,
    deviceCategoryCue:
      preUploadScan.deviceCategoryCue ?? liveByteScan.deviceCategoryCue,
    hasUniqueSerialOrId,
    metadataWasAutoStripped:
      preUploadScan.metadataWasAutoStripped && !liveByteScan.hasExifMetadata,
    detectedFields: [...detectedSet],
  };
}

/**
 * Converts a privacy-safe `ExifPrivacyScanSummary` into deterministic Stage 1
 * `PostDisclosureClue` items ready for Stage 2 cross-platform correlation and
 * `0–100` Exposure Scoring.
 *
 * @param summary - Merged EXIF privacy scan summary for a photo.
 * @returns Array of deterministic `PostDisclosureClue` items (`[]` if file is clean).
 */
export function buildExifDisclosureClues(
  summary: ExifPrivacyScanSummary,
): PostDisclosureClue[] {
  logFunctionCall('buildExifDisclosureClues', {
    hasExifMetadata: summary.hasExifMetadata,
    hasEmbeddedGps: summary.hasEmbeddedGps,
    hasCaptureTimestamp: summary.hasCaptureTimestamp,
    metadataWasAutoStripped: summary.metadataWasAutoStripped,
  });

  if (!summary.hasExifMetadata) {
    return [];
  }

  const clues: PostDisclosureClue[] = [];

  if (summary.hasEmbeddedGps) {
    const protectionNote = summary.metadataWasAutoStripped
      ? 'Unseen automatically stripped the raw GPS headers from your in-app copy—never upload the unedited original file directly to blogs, Substack, Discord, or press kits.'
      : 'Uploading this raw photo file to a blog, Substack, Discord, or press kit allows anyone who downloads it to read the exact capture location unless metadata is stripped.';

    clues.push({
      category: 'sensitive_document_or_pii',
      summary: `Hidden EXIF GPS location coordinates are embedded inside the raw photo file metadata. ${protectionNote}`,
      sourceModality: 'combined',
      confidencePercentage: APP_CONFIG.exif.gpsConfidencePercentage,
      timeCue: summary.captureTimeWindowCue,
      placeTypeCue: 'Embedded EXIF GPS location header in image file',
    });
  }

  if (summary.hasCaptureTimestamp && summary.captureTimeWindowCue) {
    clues.push({
      category: 'predictable_routine',
      summary: `Hidden EXIF capture-time metadata (${summary.captureTimeWindowCue}${
        summary.deviceCategoryCue ? `, ${summary.deviceCategoryCue}` : ''
      }) reveals when this photo was originally taken even if published later.`,
      sourceModality: 'timestamp',
      confidencePercentage: APP_CONFIG.exif.timestampConfidencePercentage,
      timeCue: summary.captureTimeWindowCue,
      placeTypeCue: summary.deviceCategoryCue,
    });
  } else if (!summary.hasEmbeddedGps && summary.hasUniqueSerialOrId) {
    clues.push({
      category: 'sensitive_document_or_pii',
      summary:
        'Hidden EXIF camera serial / unique image ID tags are embedded in the file header, which can link uploads across separate accounts.',
      sourceModality: 'combined',
      confidencePercentage: 90,
      placeTypeCue: summary.deviceCategoryCue ?? 'Embedded camera serial metadata',
    });
  }

  return clues;
}
