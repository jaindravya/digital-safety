/**
 * @file src/features/deepfake-shield/nodeDeepfakeShieldCli.ts
 * @description Ephemeral Node CLI runner invoking `python_shield/shield.py` on
 * uploaded creator photos and returning in-memory base64 PNG outputs.
 *
 * Feature Overview:
 * Bridges Unseen's TypeScript HTTP server to the Python Safety Guardrail Watermark
 * CLI while preserving zero-storage privacy:
 *   1. Decodes a base64 `data:image/*` payload into a unique OS temp directory.
 *   2. Spawns `python_shield/shield.py` cleanly via `execFile` (no shell injection).
 *   3. Reads back `protected.png` and `protected_perturbation_amplified.png`
 *      as base64 data URLs.
 *   4. Immediately deletes the temp directory inside `finally`.
 *
 * Primary Use Cases:
 * 1. Powering `POST /api/deepfake-shield/apply` for the Photo Noise / Shield tab.
 * 2. Allowing creators to inspect both the protected portrait and the 12x diff map.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  DeepfakeShieldApplyResult,
  DeepfakeShieldMode,
} from '../../domain/privacyTypes';
import { logFunctionCall } from '../../logging/logger';

const execFileAsync = promisify(execFile);

const DATA_URL_IMAGE_PATTERN =
  /^data:(image\/(?:png|jpeg|jpg|webp|heic|heif));base64,([A-Za-z0-9+/=\r\n]+)$/i;

const MIME_TO_EXTENSION: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const MODE_DEFAULT_OPACITY: Readonly<Record<DeepfakeShieldMode, number>> = {
  stealth: 20,
  balanced: 32,
  max: 45,
};

/**
 * Clamps requested opacity delta to a safe integer range supported by `shield.py`.
 */
function resolveOpacityDelta(
  mode: DeepfakeShieldMode,
  requestedOpacity?: number,
): number {
  const raw =
    typeof requestedOpacity === 'number' && Number.isFinite(requestedOpacity)
      ? Math.round(requestedOpacity)
      : MODE_DEFAULT_OPACITY[mode];
  return Math.max(5, Math.min(60, raw));
}

/**
 * Invokes `python_shield/shield.py` on an uploaded image data URL using an
 * isolated temp workspace that is deleted immediately after execution.
 *
 * @param params - Uploaded base64 image data URL, preset mode, and optional opacity delta.
 * @returns Protected PNG and 12x perturbation heatmap as base64 data URLs.
 */
export async function applyDeepfakeShieldCli(params: {
  readonly imageDataUrl: string;
  readonly mode?: DeepfakeShieldMode;
  readonly opacityDelta?: number;
  readonly projectRoot?: string;
}): Promise<DeepfakeShieldApplyResult> {
  const mode: DeepfakeShieldMode =
    params.mode === 'balanced' || params.mode === 'max' ? params.mode : 'stealth';
  const opacityDelta = resolveOpacityDelta(mode, params.opacityDelta);
  const projectRoot = params.projectRoot ?? process.cwd();

  const match = DATA_URL_IMAGE_PATTERN.exec(params.imageDataUrl.trim());
  if (!match) {
    throw new Error(
      'Please upload a valid base64 JPG, PNG, WebP, or HEIC image data URL.',
    );
  }

  const mimeType = match[1].toLowerCase();
  const base64Body = match[2].replace(/\s+/g, '');
  const inputBuffer = Buffer.from(base64Body, 'base64');
  if (inputBuffer.byteLength === 0) {
    throw new Error('Uploaded photo payload is empty.');
  }

  logFunctionCall('applyDeepfakeShieldCli', {
    mimeType,
    byteLength: inputBuffer.byteLength,
    mode,
    opacityDelta,
  });

  const scriptPath = join(projectRoot, 'python_shield', 'shield.py');
  if (!existsSync(scriptPath)) {
    throw new Error(`Deepfake shield CLI not found at ${scriptPath}.`);
  }

  const pythonBin = process.env.UNSEEN_PYTHON_BIN?.trim() || 'python3';
  const inputExt = MIME_TO_EXTENSION[mimeType] ?? 'png';
  const workDir = mkdtempSync(join(tmpdir(), 'unseen-shield-'));
  const inputPath = join(workDir, `input.${inputExt}`);
  const outputPath = join(workDir, 'protected.png');
  const diffPath = join(workDir, 'protected_perturbation_amplified.png');

  try {
    writeFileSync(inputPath, inputBuffer);

    try {
      await execFileAsync(
        pythonBin,
        [
          scriptPath,
          '--image',
          inputPath,
          '--output',
          outputPath,
          '--opacity',
          String(opacityDelta),
          '--mode',
          mode,
        ],
        {
          cwd: projectRoot,
          timeout: 25_000,
        },
      );
    } catch (error) {
      const stderrText =
        error && typeof error === 'object' && 'stderr' in error
          ? String((error as { stderr?: unknown }).stderr ?? '')
          : '';
      if (stderrText.includes('ModuleNotFoundError')) {
        throw new Error(
          'Python dependencies (pillow, numpy) are missing for python_shield/shield.py.',
        );
      }
      const message =
        stderrText.trim() ||
        (error instanceof Error ? error.message : 'Python shield CLI failed.');
      throw new Error(`Could not run shield.py: ${message}`);
    }

    if (!existsSync(outputPath) || !existsSync(diffPath)) {
      throw new Error('shield.py finished without writing expected PNG outputs.');
    }

    const protectedB64 = readFileSync(outputPath).toString('base64');
    const diffB64 = readFileSync(diffPath).toString('base64');

    return {
      protectedImageDataUrl: `data:image/png;base64,${protectedB64}`,
      perturbationHeatmapDataUrl: `data:image/png;base64,${diffB64}`,
      opacityDelta,
      mode,
      appliedAtIso: new Date().toISOString(),
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
