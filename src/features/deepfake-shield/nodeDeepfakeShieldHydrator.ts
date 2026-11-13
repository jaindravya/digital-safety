/**
 * @file src/features/deepfake-shield/nodeDeepfakeShieldHydrator.ts
 * @description Node/Server helper that hydrates the precomputed clean and JND-protected
 * screenshot PNG assets from `public/demo-media/deepfake-shield/` into base64
 * `data:image/png;base64,...` strings for live `@google/genai` verification calls.
 *
 * Feature Overview:
 * Keeps `deepfakeShieldService.ts` 100% browser- and mobile-portable (zero `node:fs`
 * imports) while allowing the `/api/deepfake-shield/verify` route to automatically
 * read the local screenshot assets when the client does not upload custom base64
 * payloads.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logFunctionCall } from '../../logging/logger';

/**
 * Loads the clean and JND-protected screenshot PNG files from `public/demo-media/deepfake-shield/`
 * as base64 data URLs when present on disk.
 *
 * @param publicRootDir - Workspace `public/` directory root.
 * @returns Object with `cleanScreenshotDataUrl` and `protectedScreenshotDataUrl` (or `undefined` if missing).
 */
export function loadDemoShieldScreenshotsFromPublicDir(
  publicRootDir: string = join(process.cwd(), 'public'),
): {
  readonly cleanScreenshotDataUrl?: string;
  readonly protectedScreenshotDataUrl?: string;
} {
  logFunctionCall('loadDemoShieldScreenshotsFromPublicDir', { publicRootDir });

  const cleanFile = join(
    publicRootDir,
    'demo-media',
    'deepfake-shield',
    'sample_face.jpg',
  );
  const protFile = join(
    publicRootDir,
    'demo-media',
    'deepfake-shield',
    'protected_face.png',
  );

  const cleanScreenshotDataUrl = existsSync(cleanFile)
    ? `data:image/jpeg;base64,${readFileSync(cleanFile).toString('base64')}`
    : undefined;

  const protectedScreenshotDataUrl = existsSync(protFile)
    ? `data:image/png;base64,${readFileSync(protFile).toString('base64')}`
    : undefined;

  return {
    cleanScreenshotDataUrl,
    protectedScreenshotDataUrl,
  };
}
