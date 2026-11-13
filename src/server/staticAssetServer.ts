/**
 * @file src/server/staticAssetServer.ts
 * @description Safe static asset and Progressive Web App (PWA) shell responder.
 *
 * Feature Overview:
 * Serves compiled frontend bundles (`dist/`) as well as static PWA manifest,
 * service worker, app icons, and demo media (`public/`) from a single unified
 * port—allowing any Android phone or Mac browser to load and install Unseen
 * without configuring a second web server. Strictly prevents directory traversal.
 *
 * Primary Use Cases:
 * 1. Serving `manifest.webmanifest`, `sw.js`, and `/demo-media/*.png` with proper MIME types.
 * 2. Serving the production SPA `index.html` fallback on client routes.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { logFunctionCall } from '../logging/logger';

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
});

/**
 * Safely resolves a requested URL pathname inside a candidate root directory,
 * returning `null` if traversal outside `rootDir` is attempted or the file is missing.
 *
 * @param rootDir - Trusted base directory (`dist` or `public`).
 * @param urlPathname - URL pathname requested by the client.
 * @returns Resolved absolute file path if present and regular file; otherwise `null`.
 */
export function resolveSafeStaticFile(
  rootDir: string,
  urlPathname: string,
): string | null {
  logFunctionCall('resolveSafeStaticFile', { rootDir, urlPathname });

  const resolvedRoot = resolve(rootDir);
  const decodedPath = decodeURIComponent(urlPathname);
  const safeRelative = normalize(decodedPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const candidate = resolve(join(resolvedRoot, safeRelative));

  if (!candidate.startsWith(resolvedRoot)) {
    return null;
  }

  if (!existsSync(candidate)) {
    return null;
  }

  const stat = statSync(candidate);
  return stat.isFile() ? candidate : null;
}

/**
 * Serves static files from `dist/` or `public/`, falling back to `dist/index.html`
 * or `index.html` for SPA navigation routes.
 *
 * @param req - Incoming HTTP request.
 * @param res - Outgoing HTTP response.
 * @param projectRoot - Workspace root directory containing `public/` and `dist/`.
 */
export function serveStaticOrSpaAsset(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string = process.cwd(),
): void {
  const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
  const pathname = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;

  logFunctionCall('serveStaticOrSpaAsset', { pathname });

  const distDir = join(projectRoot, 'dist');
  const publicDir = join(projectRoot, 'public');

  const matchedPath =
    resolveSafeStaticFile(distDir, pathname) ??
    resolveSafeStaticFile(publicDir, pathname) ??
    resolveSafeStaticFile(distDir, '/index.html') ??
    resolveSafeStaticFile(projectRoot, '/index.html');

  if (!matchedPath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Asset not found');
    return;
  }

  const ext = extname(matchedPath).toLowerCase();
  const contentType = MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
  const fileBuffer = readFileSync(matchedPath);

  res.writeHead(200, {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(fileBuffer);
}
