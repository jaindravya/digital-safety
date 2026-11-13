/**
 * @file src/ui/components/PhotoNoiseView.tsx
 * @description Tab 4 Photo Noise / Anti-Deepfake Shield view integrating the
 * `python_shield/shield.py` Safety Guardrail Watermark CLI via `UnseenPlatformBridge`.
 *
 * Feature Overview:
 *   - **Photo Uploader:** Reuses `readCameraRollFileToPost` (`JPG`, `PNG`, `WebP`,
 *     `HEIC` up to 20MB) to load a creator portrait strictly into volatile session RAM.
 *   - **Guardrail Controls:** Monochrome preset selector (`Stealth` | `Balanced` | `Max`)
 *     and luminance contrast slider (`--opacity 5..60`, default `20`).
 *   - **CLI Output Preview:** Calls `onApplyShield` -> `POST /api/deepfake-shield/apply`
 *     to execute `shield.py`, displaying `Original`, `Shielded`, and `12× Diff Map` views
 *     plus one-tap PNG download.
 *
 * Primary Use Cases:
 * 1. Uploading any portrait photo and embedding `[UNSEEN_SAFETY_GUARDRAIL_V1]` via `shield.py`.
 * 2. Inspecting the `12×` amplified diff map to verify zero facial pixel noise.
 */

import {
  Download,
  Image as ImageIcon,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import {
  DeepfakeShieldApplyResult,
  DeepfakeShieldMode,
} from '../../domain/privacyTypes';
import { readCameraRollFileToPost } from '../../features/upload/cameraRollReader';
import { logFunctionCall } from '../../logging/logger';

/**
 * Request payload sent from `<PhotoNoiseView />` to `bridge.applyDeepfakeShield`.
 */
export interface PhotoShieldApplyRequest {
  readonly imageDataUrl: string;
  readonly fileName: string;
  readonly mode: DeepfakeShieldMode;
  readonly opacityDelta: number;
}

/**
 * Props accepted by `<PhotoNoiseView />`.
 */
export interface PhotoNoiseViewProps {
  readonly onApplyShield?: (
    request: PhotoShieldApplyRequest,
  ) => Promise<DeepfakeShieldApplyResult>;
  readonly onNotify?: (message: string) => void;
}

type PreviewTab = 'original' | 'protected' | 'diff';

const PRESET_OPACITY: Readonly<Record<DeepfakeShieldMode, number>> = {
  stealth: 20,
  balanced: 32,
  max: 45,
};

/**
 * Renders Tab 4 Photo Noise / Anti-Deepfake Shield powered by `python_shield/shield.py`.
 *
 * @param props - Backend bridge callback and optional toast notifier.
 * @returns Tab 4 Photo Noise Shield element.
 */
export function PhotoNoiseView(
  props: PhotoNoiseViewProps,
): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string>('');
  const [originalDataUrl, setOriginalDataUrl] = useState<string | null>(null);
  const [shieldResult, setShieldResult] =
    useState<DeepfakeShieldApplyResult | null>(null);
  const [shieldMode, setShieldMode] = useState<DeepfakeShieldMode>('stealth');
  const [opacityDelta, setOpacityDelta] = useState<number>(
    PRESET_OPACITY.stealth,
  );
  const [viewMode, setViewMode] = useState<PreviewTab>('protected');
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  /**
   * Handles selecting a portrait image into volatile session RAM.
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
      setShieldResult(null);
      setViewMode('original');
      props.onNotify?.(`Loaded "${file.name}" into volatile RAM.`);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Could not load selected photo.',
      );
    }
  }

  function handleSelectMode(nextMode: DeepfakeShieldMode): void {
    setShieldMode(nextMode);
    setOpacityDelta(PRESET_OPACITY[nextMode]);
  }

  /**
   * Invokes `python_shield/shield.py` through `POST /api/deepfake-shield/apply`.
   */
  async function handleApplyShield(): Promise<void> {
    if (!originalDataUrl || !props.onApplyShield) return;

    logFunctionCall('PhotoNoiseView.handleApplyShield', {
      mode: shieldMode,
      opacityDelta,
    });
    setLocalError(null);
    setIsApplying(true);

    try {
      const result = await props.onApplyShield({
        imageDataUrl: originalDataUrl,
        fileName: fileName || 'portrait.png',
        mode: shieldMode,
        opacityDelta,
      });

      setShieldResult(result);
      setViewMode('protected');
      props.onNotify?.(
        `Applied safety guardrail watermark (opacity ±${result.opacityDelta}).`,
      );
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Failed to run deepfake shield CLI.',
      );
    } finally {
      setIsApplying(false);
    }
  }

  function handleClearPhoto(): void {
    setFileName('');
    setOriginalDataUrl(null);
    setShieldResult(null);
    setLocalError(null);
    setViewMode('original');
  }

  function getDisplayedImageUrl(): string | null {
    if (!shieldResult) return originalDataUrl;
    if (viewMode === 'diff') return shieldResult.perturbationHeatmapDataUrl;
    if (viewMode === 'protected') return shieldResult.protectedImageDataUrl;
    return originalDataUrl;
  }

  function handleDownloadCurrent(): void {
    const activeUrl = getDisplayedImageUrl();
    if (!activeUrl) return;
    const baseName = (fileName || 'unseen-photo').replace(/\.[^.]+$/, '');
    const suffix =
      viewMode === 'diff'
        ? '-guardrail-12x-diff'
        : shieldResult && viewMode === 'protected'
          ? '-shielded'
          : '-original';
    const anchor = document.createElement('a');
    anchor.href = activeUrl;
    anchor.download = `${baseName}${suffix}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  const displayedUrl = getDisplayedImageUrl();

  return (
    <section aria-label="Photo Noise & Anti-Deepfake Shield">
      <div className="unseen-hero">
        <p className="unseen-hero-eyebrow">Anti-Deepfake Guardrail CLI</p>
        <h2 className="unseen-hero-title">
          Shield Your Portraits Before Posting.
        </h2>
        <p className="unseen-hero-sub">
          Embeds luminance-adaptive Safety Guardrail watermarks across background
          perimeter zones using <code>python_shield/shield.py</code> while keeping
          facial pixels untouched.
        </p>
      </div>

      <div className="unseen-split-grid">
        {/* Left column: Upload & CLI Options */}
        <div className="unseen-col-stack">
          <div className="unseen-cream-card">
            <div className="unseen-section-head" style={{ marginBottom: '12px' }}>
              <h3 className="unseen-card-title">1. Upload Portrait</h3>
              <span className="unseen-pill low">
                <span className="unseen-pill-dot" />
                CLI Connected
              </span>
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
                JPG, PNG, WebP, or HEIC · Up to 20MB · Ephemeral processing only
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
                <span className="unseen-card-label">2. Guardrail Preset</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--card-ink-subtle)',
                    fontWeight: 600,
                  }}
                >
                  Zero face/neck pixel edits
                </span>
              </div>

              <div
                className="unseen-mono-track full"
                role="tablist"
                aria-label="Guardrail Preset"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={shieldMode === 'stealth'}
                  className={`unseen-mono-option ${
                    shieldMode === 'stealth' ? 'active' : ''
                  }`}
                  onClick={() => handleSelectMode('stealth')}
                >
                  Stealth
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={shieldMode === 'balanced'}
                  className={`unseen-mono-option ${
                    shieldMode === 'balanced' ? 'active' : ''
                  }`}
                  onClick={() => handleSelectMode('balanced')}
                >
                  Balanced
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={shieldMode === 'max'}
                  className={`unseen-mono-option ${
                    shieldMode === 'max' ? 'active' : ''
                  }`}
                  onClick={() => handleSelectMode('max')}
                >
                  Max
                </button>
              </div>
            </div>

            <div style={{ marginTop: '18px' }}>
              <div className="unseen-section-head" style={{ marginBottom: '6px' }}>
                <label htmlFor="shield-opacity-range" className="unseen-card-label">
                  <Sliders
                    size={12}
                    style={{ verticalAlign: 'middle', marginRight: '5px' }}
                  />
                  3. Luminance Delta (--opacity)
                </label>
                <span
                  className="unseen-mono-num"
                  style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--card-ink)' }}
                >
                  ±{opacityDelta}
                </span>
              </div>

              <input
                id="shield-opacity-range"
                type="range"
                min={5}
                max={60}
                step={1}
                value={opacityDelta}
                className="unseen-range"
                onChange={(e) => setOpacityDelta(Number(e.target.value))}
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
                <span>±5 (Faint)</span>
                <span>±20 (CLI Default)</span>
                <span>±60 (High Contrast)</span>
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
                disabled={!originalDataUrl || isApplying || !props.onApplyShield}
                onClick={handleApplyShield}
              >
                {isApplying ? (
                  <RefreshCw size={15} className="unseen-spin" aria-hidden="true" />
                ) : (
                  <Sparkles size={15} aria-hidden="true" />
                )}
                <span>
                  {isApplying
                    ? 'Running shield.py…'
                    : shieldResult
                      ? 'Re-run Safety Shield'
                      : 'Apply Safety Shield'}
                </span>
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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <ShieldCheck
                size={16}
                color="var(--card-plum)"
                style={{ flexShrink: 0, marginTop: '2px' }}
                aria-hidden="true"
              />
              <p
                style={{
                  margin: 0,
                  fontSize: '0.76rem',
                  lineHeight: 1.5,
                  color: 'var(--card-ink-muted)',
                }}
              >
                <code>POST /api/deepfake-shield/apply</code> runs{' '}
                <code>python_shield/shield.py</code> in a disposable temp folder that is
                wiped immediately after returning the PNG outputs—zero photos are stored.
              </p>
            </div>
          </div>
        </div>

        {/* Right column: Original / Shielded / 12× Diff Map Preview */}
        <div className="unseen-col-stack">
          <div className="unseen-cream-card">
            <div className="unseen-section-head" style={{ marginBottom: '14px' }}>
              <div>
                <h3 className="unseen-card-title">Shield Output Preview</h3>
                <p
                  style={{
                    margin: '3px 0 0',
                    fontSize: '0.76rem',
                    color: 'var(--card-ink-muted)',
                  }}
                >
                  {shieldResult
                    ? `Processed via shield.py (${shieldResult.mode}, opacity ±${shieldResult.opacityDelta})`
                    : originalDataUrl
                      ? 'Photo staged. Click "Apply Safety Shield" to embed guardrails.'
                      : 'No photo uploaded yet.'}
                </p>
              </div>

              {shieldResult && (
                <div className="unseen-mono-track" role="group" aria-label="Output Comparison">
                  <button
                    type="button"
                    className={`unseen-mono-option ${viewMode === 'original' ? 'active' : ''}`}
                    onClick={() => setViewMode('original')}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    className={`unseen-mono-option ${viewMode === 'protected' ? 'active' : ''}`}
                    onClick={() => setViewMode('protected')}
                  >
                    Shielded
                  </button>
                  <button
                    type="button"
                    className={`unseen-mono-option ${viewMode === 'diff' ? 'active' : ''}`}
                    onClick={() => setViewMode('diff')}
                  >
                    12× Diff Map
                  </button>
                </div>
              )}
            </div>

            {displayedUrl ? (
              <div className="unseen-noise-preview-frame">
                <img
                  src={displayedUrl}
                  alt={
                    viewMode === 'diff'
                      ? '12x amplified guardrail perturbation map showing protected face mask'
                      : viewMode === 'protected' && shieldResult
                        ? 'Portrait protected with Unseen Safety Guardrail watermark'
                        : 'Original uploaded portrait'
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
                  Upload a portrait photo to compare the Original, Shielded, and 12×
                  Guardrail Map outputs.
                </p>
              </div>
            )}

            {shieldResult && (
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
                  Face Pixels 100% Untouched
                </span>
                <button
                  type="button"
                  className="unseen-btn unseen-btn-sand unseen-btn-sm"
                  onClick={handleDownloadCurrent}
                >
                  <Download size={14} aria-hidden="true" />
                  <span>
                    {viewMode === 'diff'
                      ? 'Download 12× Diff PNG'
                      : 'Download Shielded PNG'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
