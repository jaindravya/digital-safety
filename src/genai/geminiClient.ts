/**
 * @file src/genai/geminiClient.ts
 * @description Centralized Google GenAI (`@google/genai`) multimodal client wrapper
 * with automatic `INFO` telemetry logging and `inlineData` image stripping.
 *
 * Feature Overview:
 * Provides a single typed gateway for all Gemini API calls across Stage 1 (per-post
 * multimodal extraction), Stage 2 (cross-content risk synthesis), and Stage 3
 * (voice-preserving caption rewrites). Every request and response is automatically
 * logged via `logGenAiCall`—including model name, prompt contents, generation config,
 * latency, and parsed output—while `stripInlineData` ensures base64 creator photos
 * never enter application logs.
 *
 * Primary Use Cases:
 * 1. Converting `data:image/*;base64,...` strings into `@google/genai` `inlineData` parts.
 * 2. Executing structured JSON multimodal calls against `APP_CONFIG.genai.*` models.
 * 3. Injecting mock executors in unit tests to verify prompts, schemas, and observability.
 */

import { GoogleGenAI, Part, Schema } from '@google/genai';
import { readEnvVariable } from '../config/appConfig';
import { logFunctionCall, logGenAiCall } from '../logging/logger';

/**
 * Parameters accepted by a structured JSON Gemini invocation.
 */
export interface StructuredGenAiRequest {
  readonly stage: string;
  readonly model: string;
  readonly systemInstruction: string;
  readonly contents: readonly Part[];
  readonly temperature: number;
  readonly responseSchema: Schema;
}

/**
 * Injectable executor function signature enabling deterministic unit tests without
 * live network calls while exercising the full prompt/logging pipeline.
 */
export type GenAiStructuredExecutor = (
  request: StructuredGenAiRequest,
) => Promise<string>;

const DATA_URL_EXTRACT_REGEX = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/s;

/**
 * Checks whether a non-placeholder `GEMINI_API_KEY` is configured in the environment.
 *
 * @returns `true` if a usable Gemini API key is present; `false` otherwise.
 */
export function hasConfiguredGeminiApiKey(): boolean {
  const key = readEnvVariable('GEMINI_API_KEY');
  const configured = Boolean(
    key && key !== 'your_gemini_api_key_here' && key.length >= 12,
  );
  logFunctionCall('hasConfiguredGeminiApiKey', { configured });
  return configured;
}

/**
 * Converts a `data:<mimeType>;base64,<payload>` URL into a `@google/genai` `Part`
 * containing `inlineData: { mimeType, data }`.
 *
 * @param imageDataUrl - Base64-encoded image data URL from a camera-roll upload or demo post.
 * @returns `@google/genai` `Part` with `inlineData`, or `null` if the URL is not a valid base64 data URL.
 */
export function dataUrlToGenAiPart(imageDataUrl: string): Part | null {
  logFunctionCall('dataUrlToGenAiPart', { imageDataUrl });

  const match = DATA_URL_EXTRACT_REGEX.exec(imageDataUrl.trim());
  if (!match || !match[1] || !match[2]) {
    return null;
  }

  return {
    inlineData: {
      mimeType: match[1],
      data: match[2],
    },
  };
}

/**
 * Default live executor calling Google's official `@google/genai` SDK.
 *
 * @param request - Structured multimodal request parameters.
 * @returns Raw JSON text returned by the Gemini model.
 */
export async function defaultSdkGenAiExecutor(
  request: StructuredGenAiRequest,
): Promise<string> {
  const apiKey = readEnvVariable('GEMINI_API_KEY');
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const executeWithModel = async (modelName: string) =>
    ai.models.generateContent({
      model: modelName,
      contents: [...request.contents],
      config: {
        systemInstruction: request.systemInstruction,
        temperature: request.temperature,
        responseMimeType: 'application/json',
        responseSchema: request.responseSchema,
      },
    });

  let response;
  try {
    response = await executeWithModel(request.model);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (
      request.model === 'gemini-2.5-flash' &&
      (errMsg.includes('404') || errMsg.includes('NOT_FOUND') || errMsg.includes('no longer available'))
    ) {
      logFunctionCall('defaultSdkGenAiExecutor.modelFallback', {
        fromModel: request.model,
        toModel: 'gemini-3.8-flash',
      });
      response = await executeWithModel('gemini-3.8-flash');
    } else {
      throw err;
    }
  }

  if (!response.text) {
    throw new Error(`Gemini returned an empty response for stage ${request.stage}.`);
  }

  return response.text;
}

/**
 * Executes a structured JSON Gemini call, parses the typed JSON response, and emits
 * a complete `INFO` GenAI telemetry log entry (with `inlineData` stripped).
 *
 * @param request - Stage name, model ID, system instruction, multimodal parts, temperature, and schema.
 * @param executor - Optional custom executor (defaults to `defaultSdkGenAiExecutor`).
 * @returns Parsed JSON response cast to type `T`.
 */
export async function generateStructuredJson<T>(
  request: StructuredGenAiRequest,
  executor: GenAiStructuredExecutor = defaultSdkGenAiExecutor,
): Promise<T> {
  logFunctionCall('generateStructuredJson', {
    stage: request.stage,
    model: request.model,
    partsCount: request.contents.length,
    temperature: request.temperature,
  });

  const startedAt = Date.now();
  const generationConfigSummary = {
    systemInstruction: request.systemInstruction,
    temperature: request.temperature,
    responseMimeType: 'application/json',
    responseSchema: request.responseSchema,
  };

  const rawJsonText = await executor(request);
  const parsedOutput = JSON.parse(rawJsonText) as T;
  const durationMs = Date.now() - startedAt;

  logGenAiCall({
    stage: request.stage,
    model: request.model,
    prompt: request.contents,
    config: generationConfigSummary,
    output: parsedOutput,
    durationMs,
    usedFallback: false,
  });

  return parsedOutput;
}
