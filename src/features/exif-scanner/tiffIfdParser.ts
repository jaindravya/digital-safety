/**
 * @file src/features/exif-scanner/tiffIfdParser.ts
 * @description Privacy-preserving binary TIFF / EXIF Image File Directory (IFD) parser.
 *
 * Feature Overview:
 * Parses raw TIFF byte slices (`II*\0` little-endian and `MM\0*` big-endian) embedded
 * inside JPEG `APP1`, PNG `eXIf`, WebP `EXIF`, and HEIC `Exif` containers. Walks
 * `IFD0`, `ExifIFD` (`0x8769`), and `GPSInfoIFD` (`0x8825`) with strict bounds checks
 * (`APP_CONFIG.exif.maxIfdEntries`) to detect hidden location, timing, device, and
 * serial-number metadata.
 *
 * Responsible Design & Anti-Doxxing Guarantee:
 *   - Verifies that `GPSLatitude` (`0x0002`) and `GPSLongitude` (`0x0004`) contain
 *     non-zero rational numbers WITHOUT ever computing, storing, or logging decimal
 *     latitude/longitude coordinates.
 *   - Abstracts `DateTimeOriginal` (`YYYY:MM:DD HH:MM:SS`) into broad weekday +
 *     part-of-day routine windows (e.g., `"Tuesday morning window (8:00–11:59 AM)"`)
 *     without exposing exact dates or timestamps.
 *   - Flags camera serial/owner tags (`0xA430`, `0xA431`, `0xA420`) as booleans without
 *     reading or echoing unique identifier strings.
 *
 * Primary Use Cases:
 * 1. Powering Stage 1 hidden metadata detection across Android, iOS, and camera photos.
 * 2. Enabling Stage 2 routine correlation using safe, abstracted capture time windows.
 * 3. Protecting against malformed or truncated binary headers with zero uncaught throws.
 */

import { APP_CONFIG } from '../../config/appConfig';
import { logFunctionCall } from '../../logging/logger';

const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_DATE_TIME = 0x0132;
const TAG_EXIF_IFD_POINTER = 0x8769;
const TAG_GPS_IFD_POINTER = 0x8825;

const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_DATE_TIME_DIGITIZED = 0x9004;
const TAG_IMAGE_UNIQUE_ID = 0xa420;
const TAG_CAMERA_OWNER_NAME = 0xa430;
const TAG_BODY_SERIAL_NUMBER = 0xa431;
const TAG_LENS_SERIAL_NUMBER = 0xa435;

const TAG_GPS_LATITUDE = 0x0002;
const TAG_GPS_LONGITUDE = 0x0004;

const TIFF_TYPE_BYTE_SIZES: Readonly<Record<number, number>> = Object.freeze({
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL (two LONGs)
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL (two SLONGs)
});

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/**
 * Structured, zero-PII result extracted from a binary TIFF IFD tree.
 */
export interface ParsedTiffPrivacySignals {
  readonly validTiffHeader: boolean;
  readonly hasEmbeddedGps: boolean;
  readonly hasCaptureTimestamp: boolean;
  readonly captureTimeWindowCue?: string;
  readonly hasDeviceMakeOrModel: boolean;
  readonly deviceCategoryCue?: string;
  readonly hasUniqueSerialOrId: boolean;
}

/**
 * Converts an EXIF `YYYY:MM:DD HH:MM:SS` timestamp string into an abstracted
 * weekday + part-of-day routine window without leaking the exact calendar date
 * or down-to-the-second capture time.
 *
 * @param rawExifDate - Raw ASCII EXIF timestamp (`"YYYY:MM:DD HH:MM:SS"`).
 * @returns Abstracted routine window cue, or `undefined` if unparseable.
 */
export function abstractExifTimestampToRoutineWindow(
  rawExifDate: string,
): string | undefined {
  const match = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(
    rawExifDate.trim(),
  );
  logFunctionCall('abstractExifTimestampToRoutineWindow', {
    matchedFormat: Boolean(match),
  });

  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23
  ) {
    return undefined;
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const weekday = WEEKDAY_NAMES[utcDate.getUTCDay()] ?? 'Weekday';

  let windowLabel: string;
  if (hour >= 5 && hour < 8) {
    windowLabel = 'early morning window (5:00–7:59 AM)';
  } else if (hour >= 8 && hour < 12) {
    windowLabel = 'morning window (8:00–11:59 AM)';
  } else if (hour >= 12 && hour < 17) {
    windowLabel = 'afternoon window (12:00–4:59 PM)';
  } else if (hour >= 17 && hour < 21) {
    windowLabel = 'evening window (5:00–8:59 PM)';
  } else {
    windowLabel = 'late-night window (9:00 PM–4:59 AM)';
  }

  return `${weekday} ${windowLabel}`;
}

/**
 * Classifies camera `Make` / `Model` ASCII strings into a generic device category
 * without echoing exact model identifiers or personal device names.
 *
 * @param makeOrModel - Raw ASCII camera make or model tag content.
 * @returns Broad device category cue safe for reports and logs.
 */
export function classifyCameraDeviceCue(makeOrModel: string): string {
  const normalized = makeOrModel.toLowerCase();
  logFunctionCall('classifyCameraDeviceCue', {
    nonEmpty: normalized.trim().length > 0,
  });

  if (
    /apple|iphone|ipad|samsung|galaxy|google|pixel|oneplus|xiaomi|motorola/i.test(
      normalized,
    )
  ) {
    return 'Smartphone camera EXIF header';
  }
  if (/canon|sony|nikon|fujifilm|leica|panasonic|olympus|ricoh/i.test(normalized)) {
    return 'Dedicated digital camera EXIF header';
  }
  return 'Camera hardware EXIF header';
}

/**
 * Safely reads a bounded ASCII string from a TIFF IFD entry.
 *
 * @param view - `DataView` anchored at the start of the TIFF header (`offset 0`).
 * @param entryOffset - Byte offset of the 12-byte IFD entry.
 * @param count - Number of ASCII bytes declared in the IFD entry.
 * @param littleEndian - Endianness flag (`true` for `II`, `false` for `MM`).
 * @returns Sanitized printable ASCII string (up to 64 chars).
 */
function readTiffAsciiValue(
  view: DataView,
  entryOffset: number,
  count: number,
  littleEndian: boolean,
): string {
  const safeCount = Math.min(Math.max(0, count), 64);
  if (safeCount === 0) {
    return '';
  }

  const valueOffset =
    count <= 4
      ? entryOffset + 8
      : view.getUint32(entryOffset + 8, littleEndian);

  if (valueOffset < 0 || valueOffset + safeCount > view.byteLength) {
    return '';
  }

  let chars = '';
  for (let i = 0; i < safeCount; i += 1) {
    const byte = view.getUint8(valueOffset + i);
    if (byte === 0) {
      break;
    }
    if (byte >= 32 && byte <= 126) {
      chars += String.fromCharCode(byte);
    }
  }
  return chars.trim();
}

/**
 * Checks whether a TIFF `GPSLatitude` or `GPSLongitude` entry contains at least one
 * non-zero rational component (`numerator !== 0 && denominator !== 0`), without
 * computing or returning the actual geographic coordinate.
 *
 * @param view - `DataView` anchored at the start of the TIFF header.
 * @param entryOffset - Byte offset of the 12-byte GPS IFD entry.
 * @param fieldType - TIFF field type (`5` = RATIONAL, `10` = SRATIONAL).
 * @param count - Number of rational components (typically `3` for deg/min/sec).
 * @param littleEndian - Endianness flag.
 * @returns `true` if real non-zero GPS coordinate rationals are stored.
 */
function hasNonZeroGpsRational(
  view: DataView,
  entryOffset: number,
  fieldType: number,
  count: number,
  littleEndian: boolean,
): boolean {
  if ((fieldType !== 5 && fieldType !== 10) || count < 1) {
    return false;
  }

  const componentsToCheck = Math.min(count, 3);
  const byteSpan = componentsToCheck * 8;
  const valueOffset = view.getUint32(entryOffset + 8, littleEndian);

  if (valueOffset < 8 || valueOffset + byteSpan > view.byteLength) {
    return false;
  }

  for (let i = 0; i < componentsToCheck; i += 1) {
    const rationalOffset = valueOffset + i * 8;
    const numerator =
      fieldType === 10
        ? view.getInt32(rationalOffset, littleEndian)
        : view.getUint32(rationalOffset, littleEndian);
    const denominator =
      fieldType === 10
        ? view.getInt32(rationalOffset + 4, littleEndian)
        : view.getUint32(rationalOffset + 4, littleEndian);

    if (numerator !== 0 && denominator !== 0) {
      return true;
    }
  }

  return false;
}

/**
 * Parses a raw TIFF header slice (`II*\0` or `MM\0*`) to detect embedded GPS
 * coordinates, capture timestamps, camera device headers, and serial identifiers.
 *
 * @param tiffBytes - `Uint8Array` beginning directly at the TIFF byte-order mark (`II` or `MM`).
 * @returns Zero-PII `ParsedTiffPrivacySignals` summary.
 */
export function parseTiffExifBuffer(
  tiffBytes: Uint8Array,
): ParsedTiffPrivacySignals {
  logFunctionCall('parseTiffExifBuffer', {
    byteLength: tiffBytes.byteLength,
  });

  const emptyResult: ParsedTiffPrivacySignals = {
    validTiffHeader: false,
    hasEmbeddedGps: false,
    hasCaptureTimestamp: false,
    hasDeviceMakeOrModel: false,
    hasUniqueSerialOrId: false,
  };

  if (tiffBytes.byteLength < 8) {
    return emptyResult;
  }

  const view = new DataView(
    tiffBytes.buffer,
    tiffBytes.byteOffset,
    tiffBytes.byteLength,
  );

  const byteOrder = view.getUint16(0, false);
  const littleEndian =
    byteOrder === 0x4949 ? true : byteOrder === 0x4d4d ? false : null;

  if (littleEndian === null) {
    return emptyResult;
  }

  const tiffMagic = view.getUint16(2, littleEndian);
  if (tiffMagic !== 0x002a) {
    return emptyResult;
  }

  const ifd0Offset = view.getUint32(4, littleEndian);
  if (ifd0Offset < 8 || ifd0Offset + 2 > view.byteLength) {
    return emptyResult;
  }

  let exifIfdOffset: number | null = null;
  let gpsIfdOffset: number | null = null;
  let rawMakeModel = '';
  let rawPrimaryTimestamp = '';
  let hasUniqueSerialOrId = false;

  const maxEntries = APP_CONFIG.exif.maxIfdEntries;

  /**
   * Walks a general TIFF IFD (`IFD0` or `ExifIFD`) with strict bounds validation.
   */
  const walkStandardIfd = (dirOffset: number): void => {
    if (dirOffset < 8 || dirOffset + 2 > view.byteLength) {
      return;
    }
    const entryCount = Math.min(
      view.getUint16(dirOffset, littleEndian),
      maxEntries,
    );

    for (let i = 0; i < entryCount; i += 1) {
      const entryOffset = dirOffset + 2 + i * 12;
      if (entryOffset + 12 > view.byteLength) {
        break;
      }

      const tag = view.getUint16(entryOffset, littleEndian);
      const fieldType = view.getUint16(entryOffset + 2, littleEndian);
      const count = view.getUint32(entryOffset + 4, littleEndian);

      if (!TIFF_TYPE_BYTE_SIZES[fieldType]) {
        continue;
      }

      if (tag === TAG_EXIF_IFD_POINTER && (fieldType === 4 || fieldType === 3)) {
        exifIfdOffset =
          fieldType === 3
            ? view.getUint16(entryOffset + 8, littleEndian)
            : view.getUint32(entryOffset + 8, littleEndian);
      } else if (
        tag === TAG_GPS_IFD_POINTER &&
        (fieldType === 4 || fieldType === 3)
      ) {
        gpsIfdOffset =
          fieldType === 3
            ? view.getUint16(entryOffset + 8, littleEndian)
            : view.getUint32(entryOffset + 8, littleEndian);
      } else if (
        (tag === TAG_MAKE || tag === TAG_MODEL) &&
        fieldType === 2 &&
        count > 1
      ) {
        const text = readTiffAsciiValue(view, entryOffset, count, littleEndian);
        if (text) {
          rawMakeModel = `${rawMakeModel} ${text}`.trim();
        }
      } else if (
        (tag === TAG_DATE_TIME_ORIGINAL ||
          tag === TAG_DATE_TIME_DIGITIZED ||
          tag === TAG_DATE_TIME) &&
        fieldType === 2 &&
        count >= 10
      ) {
        const ts = readTiffAsciiValue(view, entryOffset, count, littleEndian);
        // Prefer DateTimeOriginal over generic DateTime
        if (ts && (tag === TAG_DATE_TIME_ORIGINAL || !rawPrimaryTimestamp)) {
          rawPrimaryTimestamp = ts;
        }
      } else if (
        (tag === TAG_BODY_SERIAL_NUMBER ||
          tag === TAG_LENS_SERIAL_NUMBER ||
          tag === TAG_CAMERA_OWNER_NAME ||
          tag === TAG_IMAGE_UNIQUE_ID) &&
        count > 1
      ) {
        hasUniqueSerialOrId = true;
      }
    }
  };

  walkStandardIfd(ifd0Offset);
  if (exifIfdOffset !== null && exifIfdOffset !== ifd0Offset) {
    walkStandardIfd(exifIfdOffset);
  }

  let hasLat = false;
  let hasLng = false;

  if (
    gpsIfdOffset !== null &&
    gpsIfdOffset >= 8 &&
    gpsIfdOffset + 2 <= view.byteLength
  ) {
    const gpsEntryCount = Math.min(
      view.getUint16(gpsIfdOffset, littleEndian),
      maxEntries,
    );
    for (let i = 0; i < gpsEntryCount; i += 1) {
      const entryOffset = gpsIfdOffset + 2 + i * 12;
      if (entryOffset + 12 > view.byteLength) {
        break;
      }
      const tag = view.getUint16(entryOffset, littleEndian);
      const fieldType = view.getUint16(entryOffset + 2, littleEndian);
      const count = view.getUint32(entryOffset + 4, littleEndian);

      if (
        tag === TAG_GPS_LATITUDE &&
        hasNonZeroGpsRational(view, entryOffset, fieldType, count, littleEndian)
      ) {
        hasLat = true;
      } else if (
        tag === TAG_GPS_LONGITUDE &&
        hasNonZeroGpsRational(view, entryOffset, fieldType, count, littleEndian)
      ) {
        hasLng = true;
      }
    }
  }

  const hasEmbeddedGps = hasLat && hasLng;
  const hasCaptureTimestamp = rawPrimaryTimestamp.length > 0;
  const captureTimeWindowCue = hasCaptureTimestamp
    ? abstractExifTimestampToRoutineWindow(rawPrimaryTimestamp)
    : undefined;
  const hasDeviceMakeOrModel = rawMakeModel.length > 0;
  const deviceCategoryCue = hasDeviceMakeOrModel
    ? classifyCameraDeviceCue(rawMakeModel)
    : undefined;

  return {
    validTiffHeader: true,
    hasEmbeddedGps,
    hasCaptureTimestamp,
    captureTimeWindowCue,
    hasDeviceMakeOrModel,
    deviceCategoryCue,
    hasUniqueSerialOrId,
  };
}
