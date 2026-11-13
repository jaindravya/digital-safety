/**
 * @file src/ui/App.tsx
 * @description Root application shell connecting Unseen's React UI to `UnseenPlatformBridge`.
 *
 * Feature Overview:
 * Provides the top-level responsive shell shared by both Android standalone PWA
 * installations and macOS Studio viewports. Initializes the `httpPlatformAdapter`
 * and displays live engine connectivity status (Expanded into full multi-step
 * Camera Roll + Article + Audit + Fix Studio screens in Chunk 5).
 *
 * Primary Use Cases:
 * 1. Verifying end-to-end Vite production bundling (`npm run build`) and PWA shell loading.
 * 2. Hosting the top-level layout and platform bridge instance.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { logFunctionCall } from '../logging/logger';
import { createHttpPlatformBridge } from '../platform/httpPlatformAdapter';
import { EngineHealthStatus } from '../platform/platformBridge';

/**
 * Renders the top-level Unseen application shell.
 *
 * @returns React element tree for Unseen.
 */
export function App(): React.ReactElement {
  logFunctionCall('App.render', {});

  const bridge = useMemo(() => createHttpPlatformBridge(), []);
  const [health, setHealth] = useState<EngineHealthStatus | null>(null);

  useEffect(() => {
    bridge
      .getHealth()
      .then((status) => setHealth(status))
      .catch(() => setHealth(null));
  }, [bridge]);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Unseen</h1>
      <p>Your AI digital safety assistant for creators.</p>
      {health && (
        <p>
          Engine ready ({health.model})
        </p>
      )}
    </main>
  );
}
