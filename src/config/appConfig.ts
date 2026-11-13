/**
 * @file src/config/appConfig.ts
 * @description Centralized configuration registry for the PrivacyMirror application.
 *
 * Feature Overview:
 * Consolidates every configurable parameter across PrivacyMirror—including Google
 * Gemini model identifiers, stage-specific generation temperatures, image redaction
 * constants, logging ring-buffer limits, native macOS window dimensions, mobile
 * companion preview sizes, and anti-doxxing guardrail patterns—into one typed module.
 *
 * Primary Use Cases:
 * 1. Ensuring zero hardcoded model strings or magic numbers are scattered across
 *    Gemini pipeline stages, guardrails, or UI views.
 * 2. Allowing environment overrides (e.g., switching Gemini models or toggling
 *    hackathon Wi-Fi fallback mode) from a single validated entry point.
 * 3. Sharing identical configuration defaults between the macOS Electron app today
 *    and iOS/Android mobile builds later.
 */

/**
 * Supported creator content platforms analyzed by PrivacyMirror.
 */
export const SUPPORTED_PLATFORMS = [
  'instagram',
  'youtube',
  'substack',
  'draft',
] as const;

/**
 * Strongly typed configuration contract for the entire PrivacyMirror runtime.
 */
export interface PrivacyMirrorConfig {
  readonly appName: string;
  readonly appVersion: string;
  readonly genai: {
    readonly postScanModel: string;
    readonly riskConnectModel: string;
    readonly captionRewriteModel: string;
    readonly postScanTemperature: number;
    readonly riskConnectTemperature: number;
    readonly captionRewriteTemperature: number;
    readonly boundingBoxCoordinateScale: number;
    readonly enableDemoFallbackOnMissingKey: boolean;
  };
  readonly logging: {
    readonly defaultLevel: 'INFO';
    readonly maxInMemoryEntries: number;
    readonly emitToConsole: boolean;
    readonly maxUnstrippedStringPreviewChars: number;
  };
  readonly redaction: {
    readonly defaultBlurRadiusPx: number;
    readonly boundingBoxPaddingRatio: number;
  };
  readonly guardrails: {
    readonly requireOwnershipAttestation: boolean;
    readonly streetAddressPattern: RegExp;
    readonly gpsCoordinatePattern: RegExp;
    readonly redactedAddressPlaceholder: string;
  };
  readonly viewport: {
    readonly macWindowWidth: number;
    readonly macWindowHeight: number;
    readonly mobileCompanionWidth: number;
    readonly mobileCompanionHeight: number;
  };
}

/**
 * Safely reads an environment variable across Node/Electron and browser/mobile
 * bundler environments without throwing ReferenceError when `process` is absent.
 *
 * @param key - Name of the environment variable to look up.
 * @returns Trimmed string value if defined and non-empty, or `undefined`.
 */
export function readEnvVariable(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    const trimmed = process.env[key]?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

/**
 * Builds the immutable centralized configuration object, applying optional
 * environment variable overrides where supported.
 *
 * @returns Frozen `PrivacyMirrorConfig` instance used across all modules.
 */
export function createAppConfig(): PrivacyMirrorConfig {
  const modelOverride = readEnvVariable('PRIVACY_MIRROR_GEMINI_MODEL');
  const fallbackFlag = readEnvVariable('PRIVACY_MIRROR_ENABLE_DEMO_FALLBACK');
  const defaultModel = modelOverride ?? 'gemini-2.5-flash';

  return Object.freeze({
    appName: 'PrivacyMirror',
    appVersion: '0.1.0',
    genai: Object.freeze({
      postScanModel: defaultModel,
      riskConnectModel: defaultModel,
      captionRewriteModel: defaultModel,
      postScanTemperature: 0.1,
      riskConnectTemperature: 0.2,
      captionRewriteTemperature: 0.65,
      boundingBoxCoordinateScale: 1000,
      enableDemoFallbackOnMissingKey: fallbackFlag !== 'false',
    }),
    logging: Object.freeze({
      defaultLevel: 'INFO' as const,
      maxInMemoryEntries: 250,
      emitToConsole: readEnvVariable('NODE_ENV') !== 'test',
      maxUnstrippedStringPreviewChars: 8000,
    }),
    redaction: Object.freeze({
      defaultBlurRadiusPx: 18,
      boundingBoxPaddingRatio: 0.04,
    }),
    guardrails: Object.freeze({
      requireOwnershipAttestation: true,
      streetAddressPattern:
        /\b\d{2,5}\s+[A-Z][a-zA-Z0-9.\s]{2,30}\s(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b/gi,
      gpsCoordinatePattern:
        /\b-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/g,
      redactedAddressPlaceholder: '[specific location redacted by safety guardrail]',
    }),
    viewport: Object.freeze({
      macWindowWidth: 1320,
      macWindowHeight: 860,
      mobileCompanionWidth: 390,
      mobileCompanionHeight: 844,
    }),
  });
}

/**
 * Singleton centralized application configuration imported by core and UI modules.
 */
export const APP_CONFIG: PrivacyMirrorConfig = createAppConfig();
