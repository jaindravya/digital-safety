/**
 * @file src/ui/components/PhotoNoiseView.tsx
 * @description Tab 4 Photo Noise view allowing creators to upload a photo,
 * choose defensive noise settings, and preview a basic UI before connecting
 * the backend perturbation service.
 *
 * Feature Overview:
 *   - **Photo Uploader:** Reuses `readCameraRollFileToPost` (JPG/PNG/WebP/HEIC
 *     under 20MB) to load a photo strictly into volatile session RAM.
 *   - **Noise Controls:** Basic monochrome mode toggle (`Subtle` | `Cloak`)
 *     and strength slider (`5%`–`100%`).
 *   - **Pluggable Backend Hook:** Accepts an optional `onApplyNoise` prop so a
 *     future `/api/noise` endpoint can replace the built-in client-side
 *     placeholder preview with zero UI restructuring.
 *
 * Primary Use Cases:
 * 1. Prototyping the photo-noise workflow in the 4th tab before backend APIs exist.
 * 2. Connecting a real backend noise/cloaking pipeline via `onApplyNoise`.
 */

import {
  Download,
  Image as ImageIcon,
  RefreshCw,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import { readCameraRollFileToPost } from '../../features/upload/cameraRollReader';
import { logFunctionCall } from '../../logging/logger';

/**
 * Supported defensive noise modes exposed in the UI.
 */
export type PhotoNoiseMode = 'subtle' | 'cloak';

/**
 * Request payload passed to the future backend photo-noise hook.
 */
export interface PhotoNoiseRequest {
  readonly imageDataUrl: string;
  readonly fileName: string;
  readonly strength: number;
  readonly mode: PhotoNoiseMode;
}

/**
 * Props accepted by `<PhotoNoiseView />`.
 */
export interface PhotoNoiseViewProps {
  /**
   * Optional async hook for a future backend noise endpoint. When provided, it
   * should return the processed `data:image/*` URL; when omitted, the UI runs a
   * local canvas noise placeholder preview.
   */
  readonly onApplyNoise?: (request: PhotoNoiseRequest) => Promise<string | void>;
  readonly onNotify?: (message: string) => void;
}

/**
 * Generates a simple client-side canvas noise preview so the UI works end-to-end
 * while backend noise generation is not yet implemented.
 */
async function renderPlaceholderNoisePreview(
  imageDataUrl: string,
  strength: number,
  mode: PhotoNoiseMode,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not initialize canvas preview context.'));
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = frame.data;
      const amplitude =
        mode === 'cloak' ? Math.round(strength * 0.9) : Math.round(strength * 0.45);

      for (let i = 0; i < data.length; i += 4) {
        const deltaR = (Math.random() * 2 - 1) * amplitude;
        const deltaG =
          mode === 'cloak' ? (Math.random() * 2 - 1) * amplitude : deltaR;
        const deltaB =
          mode === 'cloak' ? (Math.random() * 2 - 1) * amplitude : deltaR;
        data[i] = Math.max(0, Math.min(255, data[i] + deltaR));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + deltaG));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + deltaB));
      }

      ctx.putImageData(frame, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Could not decode photo for preview.'));
    img.src = imageDataUrl;
  });
}

/**
 * Renders the basic Photo Noise upload, controls, and preview UI in Tab 4.
 *
 * @param props - Optional backend callback and toast notifier.
 * @returns Tab 4 Photo Noise view element.
 */
export function PhotoNoiseView(
  props: PhotoNoiseViewProps,
): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string>('');
  const [originalDataUrl, setOriginalDataUrl] = useState<string | null>(null);
  const [noisyDataUrl, setNoisyDataUrl] = useState<string | null>(null);
  const [noiseMode, setNoiseMode] = useState<PhotoNoiseMode>('subtle');
  const [strength, setStrength] = useState<number>(35);
  const [viewMode, setViewMode] = useState<'original' | 'noisy'>('noisy');
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  /**
   * Handles selecting a photo from the user's device into volatile RAM.
   */
  async function handleFileSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.item(0);
    event.target.value = '';
    if (!file) return;

    logFunctionCall('PhotoNoiseView.handleFileSelected', { name: file.name });
    setLocalError(null);

    try {
      const post = await readCameraRollFileToPost(file, 0);
      setFileName(file.name);
      setOriginalDataUrl(post.imageDataUrl ?? null);
      setNoisyDataUrl(null);
      setViewMode('original');
      props.onNotify?.(`Loaded "${file.name}" into RAM.`);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Could not load selected photo.',
      );
    }
  }

  /**
   * Triggers either the plugged-in backend callback or the basic local placeholder.
   */
  async function handleApplyNoise(): Promise<void> {
    if (!originalDataUrl) return;

    logFunctionCall('PhotoNoiseView.handleApplyNoise', {
      mode: noiseMode,
      strength,
      hasBackendHook: Boolean(props.onApplyNoise),
    });
    setLocalError(null);
    setIsApplying(true);

    try {
      let resultUrl: string | void = undefined;
      if (props.onApplyNoise) {
        resultUrl = await props.onApplyNoise({
          imageDataUrl: originalDataUrl,
          fileName: fileName || 'photo.png',
          strength,
          mode: noiseMode,
        });
      }

      const nextUrl =
        typeof resultUrl === 'string' && resultUrl.length > 0
          ? resultUrl
          : await renderPlaceholderNoisePreview(originalDataUrl, strength, noiseMode);

      setNoisyDataUrl(nextUrl);
      setViewMode('noisy');
      props.onNotify?.(
        props.onApplyNoise
          ? 'Defensive noise applied.'
          : 'UI placeholder noise preview ready (backend pending).',
      );
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Failed to apply noise preview.',
      );
    } finally {
      setIsApplying(false);
    }
  }

  function handleClearPhoto(): void {
    setFileName('');
    setOriginalDataUrl(null);
    setNoisyDataUrl(null);
    setLocalError(null);
    setViewMode('original');
  }

  function handleDownloadPreview(): void {
    const activeUrl = noisyDataUrl ?? originalDataUrl;
    if (!activeUrl) return;
    const baseName = (fileName || 'unseen-photo').replace(/\.[^.]+$/, '');
    const anchor = document.createElement('a');
    anchor.href = activeUrl;
    anchor.download = `${baseName}-noisy-preview.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  const displayedUrl =
    viewMode === 'noisy' && noisyDataUrl ? noisyDataUrl : originalDataUrl;

  return (
    <section aria-label="Photo Noise Shield">
      <div className="unseen-hero">
        <p className="unseen-hero-eyebrow">Photo Noise Studio (Basic UI)</p>
        <h2 className="unseen-hero-title">Add Noise Before You Post.</h2>
        <p className="unseen-hero-sub">
          Upload a photo and tune a noise strength level. This lightweight frontend
          shell is ready for your backend perturbation service to plug into later.
        </p>
      </div>

      <div className="unseen-split-grid">
        {/* Left column: Upload & Noise Controls */}
        <div className="unseen-col-stack">
          <div className="unseen-cream-card">
            <div className="unseen-section-head" style={{ marginBottom: '12px' }}>
              <h3 className="unseen-card-title">1. Upload Photo</h3>
              <span className="unseen-pill platform">UI Placeholder</span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              style={{ display: 'none' }}
              onChange={handleFileSelected}
            />

            <button
              type="button"
              className="unseen-upload-dropzone"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={20} aria-hidden="true" />
              <span style={{ fontWeight: 700, fontSize: '0.86rem' }}>
                {fileName ? `Replace Photo (${fileName})` : 'Choose Photo from Device'}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--card-ink-subtle)' }}>
                JPG, PNG, WebP, or HEIC · Up to 20MB · Volatile RAM only
              </span>
            </button>

            {localError && (
              <div
                role="alert"
                className="unseen-well"
                style={{
                  marginTop: '12px',
                  background: 'var(--status-high-bg)',
                  borderColor: 'var(--status-high-border)',
                  color: 'var(--status-high-ink)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                }}
              >
                {localError}
              </div>
            )}

            <div style={{ marginTop: '18px' }}>
              <div className="unseen-section-head" style={{ marginBottom: '8px' }}>
                <span className="unseen-card-label">2. Noise Mode</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--card-ink-subtle)',
                    fontWeight: 600,
                  }}
                >
                  Backend hook ready
                </span>
              </div>

              <div className="unseen-mono-track full" role="tablist" aria-label="Noise Mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={noiseMode === 'subtle'}
                  className={`unseen-mono-option ${noiseMode === 'subtle' ? 'active' : ''}`}
                  onClick={() => setNoiseMode('subtle')}
                >
                  Subtle Grain
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={noiseMode === 'cloak'}
                  className={`unseen-mono-option ${noiseMode === 'cloak' ? 'active' : ''}`}
                  onClick={() => setNoiseMode('cloak')}
                >
                  Adversarial Cloak
                </button>
              </div>
            </div>

            <div style={{ marginTop: '18px' }}>
              <div className="unseen-section-head" style={{ marginBottom: '6px' }}>
                <label htmlFor="noise-strength-range" className="unseen-card-label">
                  <Sliders size={12} style={{ verticalAlign: 'middle', marginRight: '5px' }} />
                  3. Noise Strength
                </label>
                <span
                  className="unseen-mono-num"
                  style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--card-ink)' }}
                >
                  {strength}%
                </span>
              </div>

              <input
                id="noise-strength-range"
                type="range"
                min={5}
                max={100}
                step={5}
                value={strength}
                className="unseen-range"
                onChange={(e) => setStrength(Number(e.target.value))}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.7rem',
                  color: 'var(--card-ink-subtle)',
                  marginTop: '4px',
                }}
              >
                <span>5% (Minimal)</span>
                <span>50% (Balanced)</span>
                <span>100% (Heavy)</span>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                marginTop: '20px',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                className="unseen-btn unseen-btn-dark"
                style={{ flex: 1 }}
                disabled={!originalDataUrl || isApplying}
                onClick={handleApplyNoise}
              >
                {isApplying ? (
                  <RefreshCw size={15} className="unseen-spin" aria-hidden="true" />
                ) : (
                  <Sparkles size={15} aria-hidden="true" />
                )}
                <span>{noisyDataUrl ? 'Re-apply Noise' : 'Add Noise'}</span>
              </button>

              {originalDataUrl && (
                <button
                  type="button"
                  className="unseen-btn unseen-btn-sand"
                  onClick={handleClearPhoto}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          <div className="unseen-cream-card compact">
            <p
              style={{
                margin: 0,
                fontSize: '0.76rem',
                lineHeight: 1.5,
                color: 'var(--card-ink-muted)',
              }}
            >
              <strong>Backend plug-in point:</strong> Pass{' '}
              <code>onApplyNoise</code> into <code>&lt;PhotoNoiseView /&gt;</code> in{' '}
              <code>src/ui/App.tsx</code> to send{' '}
              <code>&#123; imageDataUrl, strength, mode &#125;</code> to the server once
              implemented. Until then, clicking <strong>Add Noise</strong> renders a
              basic local canvas preview.
            </p>
          </div>
        </div>

        {/* Right column: Preview Panel */}
        <div className="unseen-col-stack">
          <div className="unseen-cream-card">
            <div className="unseen-section-head" style={{ marginBottom: '14px' }}>
              <div>
                <h3 className="unseen-card-title">Photo Preview</h3>
                <p
                  style={{
                    margin: '3px 0 0',
                    fontSize: '0.76rem',
                    color: 'var(--card-ink-muted)',
                  }}
                >
                  {noisyDataUrl
                    ? `Previewing ${noiseMode === 'cloak' ? 'Adversarial Cloak' : 'Subtle Grain'} at ${strength}% strength`
                    : originalDataUrl
                      ? 'Photo staged. Click "Add Noise" to generate a preview.'
                      : 'No photo uploaded yet.'}
                </p>
              </div>

              {noisyDataUrl && (
                <div className="unseen-mono-track" role="group" aria-label="Comparison">
                  <button
                    type="button"
                    className={`unseen-mono-option ${viewMode === 'original' ? 'active' : ''}`}
                    onClick={() => setViewMode('original')}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    className={`unseen-mono-option ${viewMode === 'noisy' ? 'active' : ''}`}
                    onClick={() => setViewMode('noisy')}
                  >
                    Noisy
                  </button>
                </div>
              )}
            </div>

            {displayedUrl ? (
              <div className="unseen-noise-preview-frame">
                <img
                  src={displayedUrl}
                  alt={
                    viewMode === 'noisy' && noisyDataUrl
                      ? 'Photo with defensive noise preview applied'
                      : 'Original uploaded photo preview'
                  }
                />
              </div>
            ) : (
              <div className="unseen-noise-empty-state">
                <ImageIcon size={32} strokeWidth={1.6} aria-hidden="true" />
                <p style={{ margin: '8px 0 0', fontWeight: 700, fontSize: '0.88rem' }}>
                  Preview will appear here
                </p>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '0.76rem',
                    color: 'var(--card-ink-subtle)',
                    maxWidth: '280px',
                  }}
                >
                  Select an image on the left to test the photo noise flow.
                </p>
              </div>
            )}

            {noisyDataUrl && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  marginTop: '14px',
                  flexWrap: 'wrap',
                }}
              >
                <span className="unseen-pill addressed">
                  <span className="unseen-pill-dot" />
                  Client Preview Ready
                </span>
                <button
                  type="button"
                  className="unseen-btn unseen-btn-sand unseen-btn-sm"
                  onClick={handleDownloadPreview}
                >
                  <Download size={14} aria-hidden="true" />
                  <span>Download Preview PNG</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
