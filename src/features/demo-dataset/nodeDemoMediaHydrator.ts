/**
 * @file src/features/demo-dataset/nodeDemoMediaHydrator.ts
 * @description Node/Electron helper that hydrates `CreatorPost.mediaAssetPath`
 * references from `/public/demo-media/*` into base64 `imageDataUrl` strings for
 * multimodal Gemini API transmission.
 *
 * Feature Overview:
 * Keeping `mayaCreatorFeed.ts` free of Node `fs` imports preserves 100% portability
 * across web, Capacitor, and React Native targets. When running inside the macOS
 * Electron main process or Node-based integration scripts, this hydrator resolves
 * local demo asset files on disk and attaches `data:image/png;base64,...` strings
 * ready for `@google/genai` `inlineData` inspection.
 *
 * Primary Use Cases:
 * 1. Hydrating Maya's 6 local PNG demo images before invoking Stage 1 Gemini vision.
 * 2. Gracefully returning the unhydrated post if an optional local asset is absent
 *    during lightweight unit tests.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CreatorPost } from '../../domain/privacyTypes';
import { logFunctionCall } from '../../logging/logger';

/**
 * Hydrates a single `CreatorPost` with a base64 `imageDataUrl` loaded from the
 * workspace `public/` directory if `imageDataUrl` is not already populated.
 *
 * @param post - Input `CreatorPost` that may reference `mediaAssetPath`.
 * @param publicRootDir - Absolute path to the workspace `public` asset directory.
 * @returns Copy of `post` with `imageDataUrl` populated when the file exists on disk.
 */
export function hydratePostMediaFromPublicDir(
  post: CreatorPost,
  publicRootDir: string = join(process.cwd(), 'public'),
): CreatorPost {
  logFunctionCall('hydratePostMediaFromPublicDir', {
    postId: post.id,
    mediaAssetPath: post.mediaAssetPath ?? null,
    alreadyHasDataUrl: Boolean(post.imageDataUrl),
  });

  if (post.imageDataUrl || !post.mediaAssetPath) {
    return post;
  }

  const normalizedRelative = post.mediaAssetPath.replace(/^\/+/, '');
  const fullPath = join(publicRootDir, normalizedRelative);

  if (!existsSync(fullPath)) {
    return post;
  }

  const fileBytes = readFileSync(fullPath);
  const mimeType = post.mediaMimeType ?? 'image/png';
  const base64String = fileBytes.toString('base64');

  return {
    ...post,
    imageDataUrl: `data:${mimeType};base64,${base64String}`,
  };
}

/**
 * Hydrates an array of `CreatorPost` items with base64 `imageDataUrl` values from
 * the workspace `public/` directory.
 *
 * @param posts - List of creator posts to hydrate for multimodal analysis.
 * @param publicRootDir - Optional override for the `public` directory root.
 * @returns Hydrated array of `CreatorPost` records.
 */
export function hydratePostsMediaBatch(
  posts: readonly CreatorPost[],
  publicRootDir?: string,
): CreatorPost[] {
  logFunctionCall('hydratePostsMediaBatch', {
    postCount: posts.length,
    publicRootDir: publicRootDir ?? 'default(public)',
  });

  return posts.map((post) => hydratePostMediaFromPublicDir(post, publicRootDir));
}
