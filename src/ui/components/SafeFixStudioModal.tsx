/**
 * @file src/ui/components/SafeFixStudioModal.tsx
 * @description Step 3 Interactive Pre-Post Fixer & Before/After Preview Studio.
 *
 * Feature Overview:
 * Delivers Unseen's hero transformation moment:
 *   1. Highlights Gemini's Stage 1 `[ymin, xmin, ymax, xmax]` bounding boxes over
 *      sensitive labels, room cards, or wristbands and applies real client-side
 *      HTML5 Canvas Smart Blur (`applyRedactionBoxesToImage`).
 *   2. Supports human-in-the-loop oversight by letting the creator click-and-drag
 *      or tap **"Add Custom Blur Region"** anywhere on the photo!
 *   3. Displays Gemini Stage 3's **3 voice-preserving caption rewrites** alongside
 *      publish-timing guidance and a crisp **Before vs. After** comparison toggle.
 *   4. Lets creators **Apply Safe Changes** (resolving the risk & lowering the
 *      `0–100` Exposure Score live!) and **Download Protected Photo** to their
 *      Android phone or Mac.
 *
 * Primary Use Cases:
 * 1. Scene 4 & Scene 5 of the live demo ("Make this post safer" -> Before/After reveal).
 * 2. Exporting a clean, blurred photo + rewritten caption ready to post safely.
 */

import {
  Check,
  Clock,
  Download,
  Eye,
  PlusSquare,
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

  // Sync Stage 3 suggestions once loaded
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

  // Re-render blurred canvas whenever activeBoxes or enableBlur changes
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
    >
      <div className="unseen-modal-sheet">
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
              Fixing: {props.risk.title}
            </span>
            <h2 className="unseen-serif-h2" style={{ marginTop: '6px' }}>
              Make This Post Safer Before Publishing
            </h2>
          </div>
          <button
            type="button"
            className="unseen-btn unseen-btn-secondary unseen-btn-sm"
            onClick={props.onClose}
            aria-label="Close Fix Studio"
          >
            <X size={16} />
            Close
          </button>
        </div>

        {props.isLoadingPlan ? (
          <div style={{ padding: '48px 16px', textAlign: 'center' }}>
            <Sparkles size={28} color="var(--accent-coral)" />
            <p style={{ fontWeight: 600, marginTop: '10px' }}>
              Gemini is crafting voice-preserving rewrites & redaction boxes…
            </p>
          </div>
        ) : (
          <>
            <div className="unseen-studio-split">
              {/* Left Column: Visual Smart Blur & Before/After Image Preview */}
              <div>
                {originalImageSrc ? (
                  <div className="unseen-card" style={{ padding: '14px', marginBottom: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '10px',
                        flexWrap: 'wrap',
                        gap: '6px',
                      }}
                    >
                      <strong style={{ fontSize: '0.88rem' }}>
                        Visual Privacy Preview
                      </strong>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className={`unseen-btn unseen-btn-sm ${
                            viewMode === 'compare'
                              ? 'unseen-btn-primary'
                              : 'unseen-btn-secondary'
                          }`}
                          onClick={() => setViewMode('compare')}
                        >
                          <Eye size={13} />
                          Before / After
                        </button>
                        <button
                          type="button"
                          className={`unseen-btn unseen-btn-sm ${
                            viewMode === 'after'
                              ? 'unseen-btn-primary'
                              : 'unseen-btn-secondary'
                          }`}
                          onClick={() => setViewMode('after')}
                        >
                          Safe Only
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
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              color: 'var(--status-high-ink)',
                              marginBottom: '4px',
                            }}
                          >
                            BEFORE (Exposed)
                          </div>
                          <div style={{ position: 'relative' }}>
                            <img
                              src={originalImageSrc}
                              alt="Original unredacted post"
                              style={{
                                width: '100%',
                                borderRadius: '10px',
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
                                  border: '2px dashed #d85745',
                                  borderRadius: '6px',
                                  background: 'rgba(216, 87, 69, 0.14)',
                                  pointerEvents: 'none',
                                }}
                              />
                            ))}
                          </div>
                        </div>

                        <div>
                          <div
                            style={{
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              color: 'var(--status-low-ink)',
                              marginBottom: '4px',
                            }}
                          >
                            AFTER (Smart Blurred)
                          </div>
                          <div
                            ref={imageContainerRef}
                            onPointerDown={handlePointerDown}
                            onPointerUp={handlePointerUp}
                            style={{
                              position: 'relative',
                              cursor: drawingMode ? 'crosshair' : 'default',
                              touchAction: drawingMode ? 'none' : 'auto',
                            }}
                          >
                            <img
                              src={redactedDataUrl ?? originalImageSrc}
                              alt="Protected post with sensitive areas blurred"
                              style={{
                                width: '100%',
                                borderRadius: '10px',
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
                          cursor: drawingMode ? 'crosshair' : 'default',
                          touchAction: drawingMode ? 'none' : 'auto',
                        }}
                      >
                        <img
                          src={redactedDataUrl ?? originalImageSrc}
                          alt="Protected post preview"
                          style={{ width: '100%', borderRadius: '12px', display: 'block' }}
                        />
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginTop: '12px',
                        alignItems: 'center',
                      }}
                    >
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={enableBlur}
                          onChange={(e) => setEnableBlur(e.target.checked)}
                        />
                        Smart Blur ({activeBoxes.length} region
                        {activeBoxes.length === 1 ? '' : 's'})
                      </label>

                      <button
                        type="button"
                        className="unseen-btn unseen-btn-secondary unseen-btn-sm"
                        onClick={() => setDrawingMode((v) => !v)}
                      >
                        <PlusSquare size={14} />
                        {drawingMode
                          ? 'Drag across photo now…'
                          : 'Draw Custom Blur Box'}
                      </button>

                      <button
                        type="button"
                        className="unseen-btn unseen-btn-secondary unseen-btn-sm"
                        onClick={handleDownloadProtectedPhoto}
                      >
                        <Download size={14} />
                        Download Safe Photo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="unseen-card" style={{ marginBottom: 0 }}>
                    <strong>Written Article / Newsletter Excerpt</strong>
                    <p
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--ink-secondary)',
                        background: 'var(--bg-subtle)',
                        padding: '12px',
                        borderRadius: '10px',
                      }}
                    >
                      “{props.post.caption}”
                    </p>
                  </div>
                )}
              </div>

              {/* Right Column: Voice-Preserving Caption Rewrites + Timing */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="unseen-card" style={{ padding: '16px', marginBottom: 0 }}>
                  <strong style={{ fontSize: '0.9rem', display: 'block', marginBottom: '6px' }}>
                    Original Caption / Excerpt (Before)
                  </strong>
                  <div
                    style={{
                      fontSize: '0.84rem',
                      color: 'var(--status-high-ink)',
                      background: 'var(--status-high-bg)',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      marginBottom: '14px',
                    }}
                  >
                    “{props.post.caption || '(No caption entered)'}”
                  </div>

                  <strong style={{ fontSize: '0.9rem', display: 'block', marginBottom: '8px' }}>
                    Choose a Voice-Preserving Rewrite (Gemini)
                  </strong>
                  <div style={{ display: 'grid', gap: '8px', marginBottom: '12px' }}>
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
                              ? '2px solid var(--accent-forest)'
                              : '1px solid var(--border-sand)',
                            background: active ? '#f2faf6' : '#ffffff',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--accent-forest)' }}>
                            {opt.styleLabel}
                          </div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 600, margin: '3px 0' }}>
                            “{opt.rewrittenCaption}”
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)' }}>
                            {opt.whatChanged}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      marginBottom: '4px',
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

                {props.fixPlan && (
                  <div
                    className="unseen-card"
                    style={{
                      padding: '14px 16px',
                      marginBottom: 0,
                      background: 'var(--bg-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 700, fontSize: '0.86rem' }}>
                      <Clock size={16} color="var(--accent-forest)" />
                      Recommended Timing: {props.fixPlan.timingRecommendation}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                  <button
                    type="button"
                    className="unseen-btn unseen-btn-secondary"
                    onClick={props.onClose}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="unseen-btn unseen-btn-primary"
                    onClick={handleCommitFix}
                  >
                    <Check size={17} />
                    Apply Safe Fix to Post
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
