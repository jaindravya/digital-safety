/**
 * @file src/server/createUnseenServer.ts
 * @description Factory constructing the unified Unseen HTTP server combining `/api/*`
 * Gemini endpoints with Android/Mac static PWA asset serving.
 *
 * Feature Overview:
 * Encapsulates server creation without immediately binding a fixed port so
 * automated integration suites can spin up isolated ephemeral instances (`port: 0`)
 * while `startServer.ts` binds `APP_CONFIG.server.defaultPort` (`3001`) for live use.
 *
 * Primary Use Cases:
 * 1. Running the full-stack Unseen app on a single port for Android tunnels & Mac demos.
 * 2. Executing end-to-end HTTP integration tests in Vitest.
 */

import { createServer, Server } from 'node:http';
import { logFunctionCall } from '../logging/logger';
import { handleApiRequest } from './apiRouter';
import { serveStaticOrSpaAsset } from './staticAssetServer';

/**
 * Instantiates a configured Node `http.Server` handling both `/api/*` routes
 * and static/PWA assets.
 *
 * @param projectRoot - Optional workspace root override for static file lookup.
 * @returns Unbound `http.Server` ready to call `.listen(...)`.
 */
export function createUnseenServer(projectRoot: string = process.cwd()): Server {
  logFunctionCall('createUnseenServer', { projectRoot });

  return createServer(async (req, res) => {
    const handledByApi = await handleApiRequest(req, res);
    if (!handledByApi) {
      serveStaticOrSpaAsset(req, res, projectRoot);
    }
  });
}
