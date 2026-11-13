/**
 * @file src/logging/logger.ts
 * @description Centralized `INFO` observability logger for all function invocations
 * and Google GenAI multimodal calls across Unseen.
 *
 * Feature Overview:
 * Enforces project-wide auditability and debugging clarity by logging:
 *   1. Every application function call alongside its sanitized input parameters.
 *   2. Every `@google/genai` model invocation alongside the model identifier,
 *      sanitized prompt/contents, generation config (temperature, responseSchema,
 *      systemInstruction), execution duration, and structured model output—always
 *      stripping raw `inlineData` media bytes via `stripInlineData`.
 *
 * In addition to standard console output, entries are stored in a bounded ring buffer
 * with pub/sub listeners so the macOS Creator Studio UI can display a live,
 * transparent "AI Audit & Observability Log" drawer for creators and judges.
 *
 * Primary Use Cases:
 * 1. Tracing multi-stage Gemini reasoning (Post Scan -> Cross-Post Risk Synthesis ->
 *    Safe Caption Rewrite) without leaking base64 creator photos into logs.
 * 2. Verifying parameter propagation across core modules in automated unit tests.
 * 3. Surfacing transparent AI execution traces in the Responsible Design inspector.
 */

import { APP_CONFIG } from '../config/appConfig';
import { stripInlineData } from './payloadSanitizer';

/**
 * Categories of structured `INFO` log records emitted by Unseen.
 */
export type LogEntryCategory = 'FUNCTION_CALL' | 'GENAI_CALL';

/**
 * Input payload required when recording a Google GenAI model invocation.
 */
export interface GenAiCallLogInput {
  readonly stage: string;
  readonly model: string;
  readonly prompt: unknown;
  readonly config?: unknown;
  readonly output?: unknown;
  readonly durationMs?: number;
  readonly usedFallback?: boolean;
}

/**
 * Immutable structured `INFO` log entry stored in the observability ring buffer.
 */
export interface StructuredLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly level: 'INFO';
  readonly category: LogEntryCategory;
  readonly name: string;
  readonly details: Record<string, unknown>;
}

/**
 * Listener callback invoked whenever a new `StructuredLogEntry` is recorded.
 */
export type LogSubscriber = (entry: StructuredLogEntry) => void;

const logBuffer: StructuredLogEntry[] = [];
const subscribers = new Set<LogSubscriber>();
let sequenceCounter = 0;

/**
 * Appends a structured entry to the bounded in-memory ring buffer, optionally
 * writes formatted `INFO` JSON to stdout, and notifies live UI subscribers.
 *
 * @param category - Whether the record represents a function call or GenAI call.
 * @param name - Function identifier or Gemini pipeline stage name.
 * @param details - Sanitized structured payload to attach to the entry.
 * @returns Newly created `StructuredLogEntry`.
 */
function appendStructuredEntry(
  category: LogEntryCategory,
  name: string,
  details: Record<string, unknown>,
): StructuredLogEntry {
  sequenceCounter += 1;
  const entry: StructuredLogEntry = Object.freeze({
    id: `log-${sequenceCounter}`,
    timestamp: new Date().toISOString(),
    level: APP_CONFIG.logging.defaultLevel,
    category,
    name,
    details,
  });

  logBuffer.push(entry);
  if (logBuffer.length > APP_CONFIG.logging.maxInMemoryEntries) {
    logBuffer.shift();
  }

  if (APP_CONFIG.logging.emitToConsole) {
    console.info(
      `[INFO][${entry.category}][${entry.name}]`,
      JSON.stringify(entry.details),
    );
  }

  for (const listener of subscribers) {
    listener(entry);
  }

  return entry;
}

/**
 * Logs an application function call at `INFO` level together with its input
 * parameters, automatically stripping any inline image/binary data.
 *
 * @param functionName - Fully qualified or descriptive name of the called function.
 * @param params - Key-value map of input arguments passed to the function.
 * @returns Recorded `StructuredLogEntry` with sanitized parameters.
 */
export function logFunctionCall(
  functionName: string,
  params: Record<string, unknown> = {},
): StructuredLogEntry {
  const sanitizedParams = stripInlineData(params) as Record<string, unknown>;
  return appendStructuredEntry('FUNCTION_CALL', functionName, {
    params: sanitizedParams,
  });
}

/**
 * Logs a Google GenAI call at `INFO` level with its model name, prompt/contents,
 * generation config, and returned output—automatically stripping `inlineData`
 * buffers from both inputs and outputs.
 *
 * @param input - Metadata, inputs, config, and outputs of the Gemini invocation.
 * @returns Recorded `StructuredLogEntry` containing sanitized GenAI telemetry.
 */
export function logGenAiCall(input: GenAiCallLogInput): StructuredLogEntry {
  return appendStructuredEntry('GENAI_CALL', input.stage, {
    model: input.model,
    prompt: stripInlineData(input.prompt),
    config: stripInlineData(input.config ?? {}),
    output: stripInlineData(input.output ?? null),
    durationMs: input.durationMs ?? null,
    usedFallback: Boolean(input.usedFallback),
  });
}

/**
 * Returns a snapshot of all structured `INFO` log entries currently retained in
 * the bounded ring buffer.
 *
 * @returns Read-only array of `StructuredLogEntry` items ordered oldest-to-newest.
 */
export function getLogHistory(): readonly StructuredLogEntry[] {
  return [...logBuffer];
}

/**
 * Subscribes a listener function to receive real-time `StructuredLogEntry` events.
 *
 * @param listener - Callback invoked on every subsequent `INFO` log event.
 * @returns Unsubscribe function that removes the listener cleanly.
 */
export function subscribeToLogs(listener: LogSubscriber): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

/**
 * Clears all retained entries from the in-memory ring buffer (used between tests
 * or when a creator wipes their ephemeral audit session).
 */
export function clearLogHistory(): void {
  logBuffer.length = 0;
}
