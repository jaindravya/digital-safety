/**
 * @file src/logging/payloadSanitizer.ts
 * @description Recursive sanitizer that strips inline binary and base64 media payloads
 * before function arguments or Google GenAI payloads are written to INFO logs.
 *
 * Feature Overview:
 * Multimodal creator posts and `@google/genai` content parts regularly contain large
 * base64-encoded image buffers (`inlineData.data`, `data:image/...;base64,...`, or
 * `Uint8Array` buffers). Logging raw image payloads bloats observability output and
 * risks retaining sensitive creator photos inside debug logs. This module deeply
 * clones arbitrary payloads while replacing inline media bytes with concise metadata
 * placeholders.
 *
 * Primary Use Cases:
 * 1. Stripping `inlineData` image parts from `@google/genai` `contents` arrays when
 *    logging Gemini prompts and configs at `INFO` level.
 * 2. Stripping base64 data URLs (`imageDataUrl` / `imageBase64`) when logging
 *    function calls that accept `CreatorPost` objects.
 * 3. Safely serializing Errors, RegExps, and nested objects without mutating inputs.
 */

const DATA_URL_PREFIX_PATTERN = /^data:([a-zA-Z0-9/+.-]+);base64,(.*)$/s;
const INLINE_BASE64_KEYS = new Set([
  'imageBase64',
  'base64Data',
  'rawBase64',
]);

/**
 * Checks whether a string is a base64 `data:` URL and returns a stripped summary
 * string if it matches, or `null` when the string is normal text.
 *
 * @param value - Candidate string value to inspect.
 * @returns Sanitized placeholder descriptor if `value` is a base64 data URL; otherwise `null`.
 */
export function summarizeDataUrlIfPresent(value: string): string | null {
  const match = DATA_URL_PREFIX_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const mimeType = match[1] || 'unknown';
  const payloadLength = match[2]?.length ?? 0;
  return `[STRIPPED_INLINE_DATA mimeType=${mimeType} base64Chars=${payloadLength}]`;
}

/**
 * Checks whether a plain object matches the `@google/genai` `inlineData` or
 * `inline_data` shape (`{ mimeType, data }`) and returns a sanitized copy with
 * `data` stripped.
 *
 * @param record - Plain key-value record inside a `Part` object.
 * @returns Sanitized inlineData record keeping `mimeType` and stripping `data`.
 */
export function sanitizeGenAiInlineDataNode(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const mimeType =
    (typeof record.mimeType === 'string' && record.mimeType) ||
    (typeof record.mime_type === 'string' && record.mime_type) ||
    'unknown';
  const rawData = typeof record.data === 'string' ? record.data : '';

  return {
    ...record,
    data: `[STRIPPED_INLINE_DATA mimeType=${mimeType} base64Chars=${rawData.length}]`,
  };
}

/**
 * Recursively clones an arbitrary value and strips all `inlineData` blobs,
 * base64 data URLs, explicit base64 fields, and binary byte buffers so the
 * resulting structure is completely safe and compact for `INFO` logging.
 *
 * @param payload - Arbitrary function argument, GenAI prompt, config, or model output.
 * @param seen - Internal WeakSet tracking visited object references to prevent cycles.
 * @returns Deeply sanitized copy of `payload` with inline binary data stripped.
 */
export function stripInlineData<T = unknown>(
  payload: T,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (typeof payload === 'string') {
    return summarizeDataUrlIfPresent(payload) ?? payload;
  }

  if (
    typeof payload === 'number' ||
    typeof payload === 'boolean' ||
    typeof payload === 'bigint'
  ) {
    return payload;
  }

  if (typeof payload === 'function') {
    return `[Function ${payload.name || 'anonymous'}]`;
  }

  if (payload instanceof RegExp) {
    return payload.toString();
  }

  if (payload instanceof Date) {
    return payload.toISOString();
  }

  if (payload instanceof Error) {
    return {
      name: payload.name,
      message: payload.message,
    };
  }

  if (payload instanceof Uint8Array) {
    return `[STRIPPED_INLINE_DATA binaryBytes=${payload.byteLength}]`;
  }

  if (payload instanceof ArrayBuffer) {
    return `[STRIPPED_INLINE_DATA binaryBytes=${payload.byteLength}]`;
  }

  if (typeof payload === 'object') {
    if (seen.has(payload as object)) {
      return '[Circular]';
    }
    seen.add(payload as object);

    if (Array.isArray(payload)) {
      return payload.map((item) => stripInlineData(item, seen));
    }

    const inputRecord = payload as Record<string, unknown>;
    const sanitizedRecord: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(inputRecord)) {
      if (
        (key === 'inlineData' || key === 'inline_data') &&
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        sanitizedRecord[key] = sanitizeGenAiInlineDataNode(
          value as Record<string, unknown>,
        );
      } else if (INLINE_BASE64_KEYS.has(key) && typeof value === 'string') {
        sanitizedRecord[key] = `[STRIPPED_INLINE_DATA field=${key} base64Chars=${value.length}]`;
      } else {
        sanitizedRecord[key] = stripInlineData(value, seen);
      }
    }

    return sanitizedRecord;
  }

  return String(payload);
}
