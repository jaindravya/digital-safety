/**
 * @file src/server/httpJsonHelpers.ts
 * @description Lightweight Node `http` request body reader and structured JSON
 * response helpers with configurable payload byte limits.
 *
 * Feature Overview:
 * Supports high-resolution original camera-roll photo uploads (up to 20MB raw /
 * `APP_CONFIG.server.maxJsonBodyBytes` JSON body) from Android and Mac clients
 * without requiring heavyweight framework dependencies, while enforcing strict
 * byte caps and CORS/security headers.
 *
 * Primary Use Cases:
 * 1. Parsing incoming JSON payloads on `/api/audit`, `/api/import-article`, and `/api/fix-post`.
 * 2. Returning standardized JSON responses and HTTP error envelopes.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { APP_CONFIG } from '../config/appConfig';
import { logFunctionCall } from '../logging/logger';

/**
 * Writes a JSON response with standard security and CORS headers.
 *
 * @param res - Node `ServerResponse` stream.
 * @param statusCode - HTTP status code (e.g., `200`, `400`, `403`, `500`).
 * @param payload - Serializable response object.
 */
export function sendJsonResponse(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  logFunctionCall('sendJsonResponse', {
    statusCode,
  });

  const serialized = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(serialized);
}

/**
 * Reads and parses a JSON request body from a Node `IncomingMessage`, rejecting
 * payloads that exceed `maxBytes`.
 *
 * @param req - Incoming HTTP request stream.
 * @param maxBytes - Maximum allowed body size in bytes (defaults to `APP_CONFIG.server.maxJsonBodyBytes`).
 * @returns Parsed JSON body cast to `T`.
 */
export async function readJsonBody<T>(
  req: IncomingMessage,
  maxBytes: number = APP_CONFIG.server.maxJsonBodyBytes,
): Promise<T> {
  logFunctionCall('readJsonBody', {
    method: req.method ?? 'UNKNOWN',
    url: req.url ?? '',
    maxBytes,
  });

  return new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        req.destroy();
        reject(
          new Error(
            'Uploaded photo batch exceeds the maximum payload limit (20MB per photo).',
          ),
        );
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw.trim()) {
          resolve({} as T);
          return;
        }
        resolve(JSON.parse(raw) as T);
      } catch {
        reject(new Error('Invalid JSON request payload.'));
      }
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}
