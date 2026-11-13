/**
 * @file src/ui/components/SafeFixStudioModal.tsx
 * @description Step 3 Interactive Pre-Post Fixer & Before/After Preview Studio.
 *
 * Feature Overview:
 * Delivers Unseen's pre-publication safety transformation inside a warm-cream
 * editorial studio modal:
 *   1. Highlights Gemini's Stage 1 `[ymin, xmin, ymax, xmax]` bounding boxes over
 *      sensitive labels, room cards, or wristbands and applies client-side HTML5
 *      Canvas Smart Blur (`applyRedactionBoxesToImage`).
 *   2. Supports human-in-the-loop oversight by letting the creator drag a custom
 *      redaction box directly on the photo.
 *   3. Displays Gemini Stage 3's 3 voice-preserving caption rewrites alongside
 *      publish-timing guidance and a monochrome `Before / After` vs `Safe Only` toggle.
 *   4. Lets creators apply safe changes (updating the report score live) and
 *      download the clean redacted PNG locally.
 *
 * Primary Use Cases:
 * 1. Resolving visual PII, routine, and real-time location risks before publishing.
 * 2. Exporting a clean, blurred photo + rewritten caption ready to post safely.
 */

import {
  Check,
  Clock,
  Download,
  Eye,
  PlusSquare,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import {
  AppliedPostSafetyFix,
  CreatorPost,
  CrossPlatformRisk,
  NormalizedBoundingBox,
  SafePostFixPlan,
} from '../../domain/privacyTypes';
import { applyRedactionBoxesToImage } from '../../features/image-redactor/canvasImageRedactor';
import { logFunctionCall } from '../../logging/logger';

/**
 * Props accepted by `<SafeFixStudioModal />`.
 */
export interface SafeFixStudioModalProps {
  readonly post: CreatorPost;
  readonly risk: CrossPlatformRisk;
  readonly fixPlan: SafePostFixPlan | null;
  readonly isLoadingPlan: boolean;
  readonly existingFix?: AppliedPostSafetyFix;
  readonly onApplyFix: (fix: AppliedPostSafetyFix) => void;
  readonly onClose: () => void;
}

/**
 * Renders the modal Fix Studio with Smart Blur, custom drag-box oversight, caption
 * rewrites, and side-by-side Before/After preview.
 *
 * @param props - Target post, risk, Stage 3 fix plan, and apply/close handlers.
 * @returns Accessible modal dialog element.
 */
export function SafeFixStudioModal(
  props: SafeFixStudioModalProps,
): React.ReactElement {
  const originalImageSrc = props.post.imageDataUrl ?? props.post.mediaAssetPath;

  const [activeBoxes, setActiveBoxes] = useState<NormalizedBoundingBox[]>(
    props.existingFix
      ? [...props.existingFix.appliedRedactionBoxes]
      : [...(props.fixPlan?.suggestedRegionsToRedact ?? [])],
  );
  const [enableBlur, setEnableBlur] = useState(true);
  const [redactedDataUrl, setRedactedDataUrl] = useState<string | undefined>(
    props.existingFix?.redactedImageDataUrl,
  );
  const [selectedCaption, setSelectedCaption] = useState<string>(
    props.existingFix?.updatedCaption ?? props.post.caption,
  );
  const [viewMode, setViewMode] = useState<'after' | 'compare'>('compare');
  const [drawingMode, setDrawingMode] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );

  const imageContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!props.fixPlan || props.existingFix) {
      return;
    }
    setActiveBoxes([...props.fixPlan.suggestedRegionsToRedact]);
    const firstOption = props.fixPlan.captionOptions[0];
    if (firstOption) {
      setSelectedCaption(firstOption.rewrittenCaption);
    }
  }, [props.fixPlan, props.existingFix]);

  useEffect(() => {
    if (!originalImageSrc) {
      setRedactedDataUrl(undefined);
      return;
    }
    if (!enableBlur || activeBoxes.length === 0) {
      setRedactedDataUrl(originalImageSrc);
      return;
    }

    let cancelled = false;
    applyRedactionBoxesToImage(originalImageSrc, activeBoxes)
      .then((url) => {
        if (!cancelled) {
          setRedactedDataUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRedactedDataUrl(originalImageSrc);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [originalImageSrc, activeBoxes, enableBlur]);

  /**
   * Converts a pointer event inside the image preview container into normalized
   * `0..1000` coordinates for human-in-the-loop custom blur box drawing.
   *
   * @param clientX - Pointer X coordinate.
   * @param clientY - Pointer Y coordinate.
   * @returns Normalized `{ x, y }` pair in `0..1000`.
   */
  function pointerToNormalized(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null {
    const el = imageContainerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const normX = Math.round(
      Math.min(1000, Math.max(0, ((clientX - rect.left) / rect.width) * 1000)),
    );
    const normY = Math.round(
      Math.min(1000, Math.max(0, ((clientY - rect.top) / rect.height) * 1000)),
    );
    return { x: normX, y: normY };
  }

  /**
   * Starts drawing a custom redaction box on pointer down when `drawingMode` is active.
   *
   * @param e - React pointer event on the image container.
   */
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (!drawingMode) return;
    const pt = pointerToNormalized(e.clientX, e.clientY);
    if (pt) {
      setDragStart(pt);
    }
  }

  /**
   * Completes custom redaction box creation on pointer up.
   *
   * @param e - React pointer event on the image container.
   */
  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (!drawingMode || !dragStart) return;
    const endPt = pointerToNormalized(e.clientX, e.clientY);
    setDragStart(null);
    setDrawingMode(false);
    if (!endPt) return;

    const ymin = Math.min(dragStart.y, endPt.y);
    const ymax = Math.max(dragStart.y, endPt.y);
    const xmin = Math.min(dragStart.x, endPt.x);
    const xmax = Math.max(dragStart.x, endPt.x);

    if (ymax - ymin > 25 && xmax - xmin > 25) {
      const customBox: NormalizedBoundingBox = {
        ymin,
        xmin,
        ymax,
        xmax,
        label: 'Creator custom redaction',
      };
      logFunctionCall('SafeFixStudioModal.addCustomBlurBox', { customBox });
      setActiveBoxes((prev) => [...prev, customBox]);
      setEnableBlur(true);
    }
  }

  /**
   * Triggers a local PNG download of the blurred/protected photo.
   */
  function handleDownloadProtectedPhoto(): void {
    const targetUrl = redactedDataUrl ?? originalImageSrc;
    if (!targetUrl) return;
    logFunctionCall('SafeFixStudioModal.handleDownloadProtectedPhoto', {
      postId: props.post.id,
    });
    const a = document.createElement('a');
    a.href = targetUrl;
    a.download = `unseen-safe-${props.post.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Commits the selected caption rewrite and image redaction to the session report.
   */
  function handleCommitFix(): void {
    logFunctionCall('SafeFixStudioModal.handleCommitFix', {
      postId: props.post.id,
      riskId: props.risk.id,
      boxCount: enableBlur ? activeBoxes.length : 0,
    });

    props.onApplyFix({
      postId: props.post.id,
      riskId: props.risk.id,
      updatedCaption: selectedCaption,
      redactedImageDataUrl: enableBlur ? redactedDataUrl : originalImageSrc,
      appliedRedactionBoxes: enableBlur ? activeBoxes : [],
      scheduledTimingNote:
        props.fixPlan?.timingRecommendation ??
        'Publish after leaving the location.',
      appliedAtIso: new Date().toISOString(),
    });
  }

  return (
    <div
      className="unseen-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Make This Post Safer Pre-Post Fix Studio"
      onClick={props.onClose}
    >
      <div className="unseen-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <div>
            <span className={`unseen-pill ${props.risk.priority}`}>
              <span className="unseen-pill-dot" />
              Fixing: {props.risk.title}
            </span>
            <h2
              className="unseen-card-title"
              style={{ fontSize: '1.28rem', marginTop: '8px' }}
            >
              Make This Post Safer Before Publishing
            </h2>
          </div>
          <button
            type="button"
            className="unseen-btn unseen-btn-sand unseen-btn-sm"
            onClick={props.onClose}
            aria-label="Close Fix Studio"
          >
            <X size={15} />
            Close
          </button>
        </div>

        {props.isLoadingPlan ? (
          <div style={{ padding: '48px 16px', textAlign: 'center' }}>
            <Sparkles size={28} color="var(--card-plum)" />
            <p style={{ fontWeight: 700, marginTop: '10px', color: 'var(--card-ink)' }}>
              Gemini is crafting voice-preserving rewrites &amp; redaction
              boxes…
            </p>
          </div>
        ) : (
          <div className="unseen-studio-split">
            {/* Left Column: Visual Smart Blur & Before/After Image Preview */}
            <div>
              {originalImageSrc ? (
                <div
                  className="unseen-white-tile"
                  style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <strong style={{ fontSize: '0.84rem', color: 'var(--card-ink)' }}>
                      Visual Privacy Preview
                    </strong>

                    <div className="unseen-mono-track">
                      <button
                        type="button"
                        onClick={() => setViewMode('compare')}
                        className={`unseen-mono-option ${
                          viewMode === 'compare' ? 'active' : ''
                        }`}
                        style={{ minHeight: '30px', padding: '4px 12px', fontSize: '0.72rem' }}
                      >
                        <Eye size={12} />
                        <span>Before / After</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('after')}
                        className={`unseen-mono-option ${
                          viewMode === 'after' ? 'active' : ''
                        }`}
                        style={{ minHeight: '30px', padding: '4px 12px', fontSize: '0.72rem' }}
                      >
                        <span>Safe Only</span>
                      </button>
                    </div>
                  </div>

                  {viewMode === 'compare' ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '10px',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            letterSpacing: '0.05em',
                            color: 'var(--status-high-ink)',
                            marginBottom: '5px',
                          }}
                        >
                          BEFORE (EXPOSED)
                        </div>
                        <div
                          style={{
                            position: 'relative',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            background: 'var(--surface-dim)',
                          }}
                        >
                          <img
                            src={originalImageSrc}
                            alt="Original unredacted post"
                            style={{
                              width: '100%',
                              display: 'block',
                            }}
                          />
                          {activeBoxes.map((box, idx) => (
                            <div
                              key={`${box.label}-${idx}`}
                              title={box.label}
                              style={{
                                position: 'absolute',
                                top: `${box.ymin / 10}%`,
                                left: `${box.xmin / 10}%`,
                                width: `${(box.xmax - box.xmin) / 10}%`,
                                height: `${(box.ymax - box.ymin) / 10}%`,
                                border: '2px dashed #ff5449',
                                borderRadius: '6px',
                                background: 'rgba(255, 84, 73, 0.16)',
                                pointerEvents: 'none',
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <div
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            letterSpacing: '0.05em',
                            color: 'var(--status-low-ink)',
                            marginBottom: '5px',
                          }}
                        >
                          AFTER (SMART BLURRED)
                        </div>
                        <div
                          ref={imageContainerRef}
                          onPointerDown={handlePointerDown}
                          onPointerUp={handlePointerUp}
                          style={{
                            position: 'relative',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            background: 'var(--surface-dim)',
                            cursor: drawingMode ? 'crosshair' : 'default',
                            touchAction: drawingMode ? 'none' : 'auto',
                          }}
                        >
                          <img
                            src={redactedDataUrl ?? originalImageSrc}
                            alt="Protected post with sensitive areas blurred"
                            style={{
                              width: '100%',
                              display: 'block',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      ref={imageContainerRef}
                      onPointerDown={handlePointerDown}
                      onPointerUp={handlePointerUp}
                      style={{
                        position: 'relative',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        background: 'var(--surface-dim)',
                        cursor: drawingMode ? 'crosshair' : 'default',
                        touchAction: drawingMode ? 'none' : 'auto',
                      }}
                    >
                      <img
                        src={redactedDataUrl ?? originalImageSrc}
                        alt="Protected post preview"
                        style={{ width: '100%', display: 'block' }}
                      />
                    </div>
                  )}

                  <div
                    className="unseen-well"
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '7px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: 'var(--card-ink)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={enableBlur}
                        onChange={(e) => setEnableBlur(e.target.checked)}
                        style={{ accentColor: 'var(--card-ink)' }}
                      />
                      Smart Blur ({activeBoxes.length} region
                      {activeBoxes.length === 1 ? '' : 's'})
                    </label>

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className={`unseen-btn unseen-btn-sm ${
                          drawingMode ? 'unseen-btn-dark' : 'unseen-btn-cream'
                        }`}
                        onClick={() => setDrawingMode((v) => !v)}
                      >
                        <PlusSquare size={13} />
                        {drawingMode
                          ? 'Drag across photo now…'
                          : 'Draw Custom Blur Box'}
                      </button>

                      <button
                        type="button"
                        className="unseen-btn unseen-btn-cream unseen-btn-sm"
                        onClick={handleDownloadProtectedPhoto}
                      >
                        <Download size={13} />
                        Download Safe Photo
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '0.75rem',
                      color: 'var(--card-ink-muted)',
                    }}
                  >
                    <ShieldCheck size={15} color="#059669" aria-hidden="true" />
                    <span>
                      Processed ephemerally in local canvas RAM—nothing saved
                      to disk or cloud.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="unseen-white-tile" style={{ padding: '16px' }}>
                  <strong style={{ fontSize: '0.86rem', color: 'var(--card-ink)' }}>
                    Written Article / Newsletter Excerpt
                  </strong>
                  <p
                    className="unseen-well"
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--card-ink-secondary)',
                      marginTop: '10px',
                      marginBottom: 0,
                      lineHeight: 1.55,
                    }}
                  >
                    “{props.post.caption}”
                  </p>
                </div>
              )}
            </div>

            {/* Right Column: Voice-Preserving Caption Rewrites + Timing */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                className="unseen-white-tile"
                style={{
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div>
                  <strong
                    style={{
                      fontSize: '0.82rem',
                      display: 'block',
                      marginBottom: '6px',
                      color: 'var(--card-ink)',
                    }}
                  >
                    Original Caption / Excerpt (Before)
                  </strong>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--status-high-ink)',
                      background: 'var(--status-high-bg)',
                      border: '1px solid var(--status-high-border)',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      lineHeight: 1.45,
                    }}
                  >
                    “{props.post.caption || '(No caption entered)'}”
                  </div>
                </div>

                <div>
                  <strong
                    style={{
                      fontSize: '0.82rem',
                      display: 'block',
                      marginBottom: '8px',
                      color: 'var(--card-ink)',
                    }}
                  >
                    Choose a Voice-Preserving Rewrite (Gemini)
                  </strong>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {(props.fixPlan?.captionOptions ?? []).map((opt) => {
                      const active = selectedCaption === opt.rewrittenCaption;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSelectedCaption(opt.rewrittenCaption)}
                          style={{
                            textAlign: 'left',
                            padding: '10px 12px',
                            borderRadius: '12px',
                            border: active
                              ? '2px solid var(--card-ink)'
                              : '1px solid var(--card-well-border)',
                            background: active ? 'var(--card-cream)' : '#ffffff',
                            cursor: 'pointer',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                color: 'var(--card-plum)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                              }}
                            >
                              {opt.styleLabel}
                            </span>
                            {active && (
                              <span
                                className="unseen-pill low"
                                style={{ padding: '2px 7px', fontSize: '0.66rem' }}
                              >
                                Selected
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: '0.84rem',
                              fontWeight: 700,
                              color: 'var(--card-ink)',
                              margin: '4px 0',
                              lineHeight: 1.4,
                            }}
                          >
                            “{opt.rewrittenCaption}”
                          </div>
                          <div
                            style={{
                              fontSize: '0.74rem',
                              color: 'var(--card-ink-muted)',
                            }}
                          >
                            {opt.whatChanged}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.76rem',
                      fontWeight: 800,
                      marginBottom: '5px',
                      color: 'var(--card-ink)',
                    }}
                  >
                    Final Safer Caption (Editable — You Stay in Control)
                  </label>
                  <textarea
                    rows={3}
                    className="unseen-textarea"
                    value={selectedCaption}
                    onChange={(e) => setSelectedCaption(e.target.value)}
                  />
                </div>
              </div>

              {props.fixPlan && (
                <div
                  className="unseen-well"
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'flex-start',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    color: 'var(--card-ink)',
                  }}
                >
                  <Clock
                    size={16}
                    color="var(--card-plum)"
                    style={{ flexShrink: 0, marginTop: '2px' }}
                    aria-hidden="true"
                  />
                  <span>
                    Recommended Timing: {props.fixPlan.timingRecommendation}
                  </span>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  marginTop: '2px',
                }}
              >
                <button
                  type="button"
                  className="unseen-btn unseen-btn-sand"
                  onClick={props.onClose}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="unseen-btn unseen-btn-dark"
                  onClick={handleCommitFix}
                >
                  <Check size={16} />
                  Apply Safe Fix to Post
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
