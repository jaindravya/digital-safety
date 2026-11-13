/**
 * @file src/ui/main.tsx
 * @description Browser and Android PWA React root mount entry point for Unseen.
 *
 * Feature Overview:
 * Mounts the responsive `<App />` component tree into `#root` inside `React.StrictMode`
 * and logs initial client boot at `INFO` level.
 *
 * Primary Use Cases:
 * 1. Bootstrapping the Unseen UI on Android Chrome / standalone installed PWA.
 * 2. Bootstrapping the Unseen Creator Studio view on macOS browsers.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { logFunctionCall } from '../logging/logger';
import { App } from './App';

/**
 * Mounts the Unseen React application into the DOM `#root` container.
 */
function mountUnseenApp(): void {
  logFunctionCall('mountUnseenApp', {});
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Missing #root mount element in index.html.');
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

mountUnseenApp();
