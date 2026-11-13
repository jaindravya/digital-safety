/**
 * @file src/server/startServer.ts
 * @description CLI entry point that loads local `.env` / `.env.local` variables and
 * starts the unified Unseen server for Mac and Android clients.
 *
 * Feature Overview:
 * Reads optional `.env` and `.env.local` files from the workspace root (so teammates
 * can drop in `GEMINI_API_KEY` without extra dotenv packages), constructs the unified
 * HTTP server, and listens on `0.0.0.0:3001` (or `PORT`).
 *
 * Primary Use Cases:
 * 1. Running `npm run dev:api` alongside Vite HMR during UI development.
 * 2. Running `npm start` after `npm run build` to serve the entire Android PWA + API
 *    over a single port or HTTPS tunnel.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_CONFIG } from '../config/appConfig';
import { hasConfiguredGeminiApiKey } from '../genai/geminiClient';
import { logFunctionCall } from '../logging/logger';
import { createUnseenServer } from './createUnseenServer';

/**
 * Parses simple `KEY=VALUE` lines from `.env` and `.env.local` into `process.env`
 * without overwriting environment variables already set in the shell.
 *
 * @param rootDir - Workspace root directory to check for `.env` files.
 */
export function loadDotEnvFilesIfPresent(rootDir: string = process.cwd()): void {
  logFunctionCall('loadDotEnvFilesIfPresent', { rootDir });

  for (const filename of ['.env.local', '.env']) {
    const fullPath = join(rootDir, filename);
    if (!existsSync(fullPath)) {
      continue;
    }

    const content = readFileSync(fullPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed
        .slice(eqIdx + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

loadDotEnvFilesIfPresent();

const server = createUnseenServer();
const port = APP_CONFIG.server.defaultPort;
const host = APP_CONFIG.server.bindHost;

server.listen(port, host, () => {
  console.info(
    `[INFO][UnseenServer] Listening on http://localhost:${port} (Gemini live key: ${hasConfiguredGeminiApiKey()})`,
  );
});
