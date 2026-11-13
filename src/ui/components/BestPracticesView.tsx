/**
 * @file src/ui/components/BestPracticesView.tsx
 * @description Step 4 Personalized & General Digital Safety Playbook view with
 * ephemeral session checkboxes and one-tap local checklist download.
 *
 * Feature Overview:
 * Matches Unseen's dark-plum + warm-cream Playbook aesthetic, surfacing
 * scan-triggered personalized interventions alongside foundational creator
 * safety habits with live progress counters and zero-persistence local export.
 *
 * Primary Use Cases:
 * 1. Checking off safety steps before publishing across social platforms.
 * 2. Downloading `unseen-safety-checklist.md` locally on iOS, Android, or Mac.
 */

import {
  AlertCircle,
  Check,
  Download,
  FileDown,
  Fingerprint,
  Flame,
  Shield,
} from 'lucide-react';
import React from 'react';
import { BestPracticeRecommendation } from '../../domain/privacyTypes';
import {
  formatBestPracticesChecklist,
  triggerTextFileDownload,
} from '../../features/best-practices/checklistExporter';
import { logFunctionCall } from '../../logging/logger';

/**
 * Props accepted by `<BestPracticesView />`.
 */
export interface BestPracticesViewProps {
  readonly items: readonly BestPracticeRecommendation[];
  readonly checkedIds: ReadonlySet<string>;
  readonly currentExposureScore?: number;
  readonly onToggleChecked: (id: string) => void;
  readonly onResetChecked?: () => void;
}

/**
 * Renders interactive personalized and general safety checklist cards plus download button.
 *
 * @param props - Best-practice items, checked IDs set, and toggle/reset callbacks.
 * @returns Accessible checklist view element.
 */
export function BestPracticesView(
  props: BestPracticesViewProps,
): React.ReactElement {
  const personalized = props.items.filter((i) => i.kind === 'personalized');
  const general = props.items.filter((i) => i.kind === 'general');
  const totalCompleted = props.items.filter((i) =>
    props.checkedIds.has(i.id),
  ).length;

  /**
   * Formats and downloads the user's current checklist locally.
   */
  function handleDownload(): void {
    logFunctionCall('BestPracticesView.handleDownload', {
      itemCount: props.items.length,
      checkedCount: props.checkedIds.size,
    });
    const text = formatBestPracticesChecklist(
      props.items,
      props.checkedIds,
      props.currentExposureScore,
    );
    triggerTextFileDownload(text);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Editorial Hero Framing */}
      <section className="unseen-hero" style={{ marginBottom: 0 }}>
        <p className="unseen-hero-eyebrow">
          Session Confidential · In-Memory Only
        </p>
        <h1 className="unseen-hero-title">Personalized Safety Playbook</h1>
        <p className="unseen-hero-sub">
          Actionable digital defense habits tailored to your latest scan. Stored
          strictly in your active browser session—download a copy before closing.
        </p>
      </section>

      <div className="unseen-split-grid">
        {/* Left Column: Summary Metrics & Export Controls */}
        <div className="unseen-col-stack">
          <section
            className="unseen-cream-card"
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '10px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'var(--card-well)',
                    border: '1px solid var(--card-well-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--card-ink)',
                    flexShrink: 0,
                  }}
                >
                  <Fingerprint size={18} aria-hidden="true" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.86rem',
                      fontWeight: 800,
                      color: 'var(--card-ink)',
                    }}
                  >
                    Session Defense Progress
                  </div>
                  <div
                    className="unseen-mono-num"
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--card-ink-muted)',
                    }}
                  >
                    {totalCompleted}/{props.items.length} habits fortified
                  </div>
                </div>
              </div>
              <span className="unseen-pill platform">Active Triage</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
              }}
            >
              <div className="unseen-white-tile">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#c53030',
                  }}
                >
                  <AlertCircle size={15} aria-hidden="true" />
                  <span
                    className="unseen-mono-num"
                    style={{
                      fontSize: '1.45rem',
                      fontWeight: 800,
                      color: 'var(--card-ink)',
                    }}
                  >
                    {personalized.length}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    color: 'var(--card-ink-muted)',
                  }}
                >
                  Audit-Triggered
                </span>
              </div>

              <div className="unseen-white-tile">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#059669',
                  }}
                >
                  <Shield size={15} aria-hidden="true" />
                  <span
                    className="unseen-mono-num"
                    style={{
                      fontSize: '1.45rem',
                      fontWeight: 800,
                      color: 'var(--card-ink)',
                    }}
                  >
                    {general.length}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    color: 'var(--card-ink-muted)',
                  }}
                >
                  Baseline Defenses
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownload}
              className="unseen-btn unseen-btn-dark unseen-btn-full"
              style={{ minHeight: '46px' }}
            >
              <Download size={16} aria-hidden="true" />
              <span>Download Best Practices (.md)</span>
            </button>
          </section>

          <section
            className="unseen-cream-card"
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'var(--card-ink)',
                  color: 'var(--on-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <FileDown size={18} aria-hidden="true" />
              </div>
              <div>
                <h3 className="unseen-card-title" style={{ fontSize: '1rem' }}>
                  Take your safety checklist with you
                </h3>
                <span
                  style={{
                    fontSize: '0.74rem',
                    color: 'var(--card-ink-muted)',
                  }}
                >
                  Portable offline defense guide
                </span>
              </div>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: '0.78rem',
                color: 'var(--card-ink-muted)',
                lineHeight: 1.5,
              }}
            >
              When you close this tab, your session and checklist progress are
              immediately erased from memory. Export a local Markdown checklist
              to keep your action plan.
            </p>

            {props.onResetChecked && (
              <button
                type="button"
                onClick={props.onResetChecked}
                className="unseen-btn unseen-btn-danger-soft unseen-btn-full"
                style={{ minHeight: '42px', fontSize: '0.78rem' }}
              >
                <Flame size={15} aria-hidden="true" />
                <span>Burn Checklist State Now</span>
              </button>
            )}
          </section>
        </div>

        {/* Right Column: Audit-Triggered & Everyday Habits */}
        <div className="unseen-col-stack">
          {personalized.length > 0 && (
            <section
              aria-label="Personalized Recommendations"
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div className="unseen-section-head">
                <h2 className="unseen-section-title">
                  Triggered by Your Audit
                </h2>
                <span className="unseen-pill cream unseen-mono-num">
                  {personalized.length} Priority
                </span>
              </div>

              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
              >
                {personalized.map((item) => {
                  const checked = props.checkedIds.has(item.id);
                  return (
                    <article
                      key={item.id}
                      className="unseen-cream-card compact"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                        }}
                      >
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          aria-label={`Mark "${item.title}" as completed`}
                          onClick={() => props.onToggleChecked(item.id)}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            marginTop: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            cursor: 'pointer',
                            background: checked ? 'var(--card-ink)' : '#ffffff',
                            color: checked
                              ? 'var(--on-surface)'
                              : 'var(--card-ink)',
                            border: checked
                              ? '1px solid var(--card-ink)'
                              : '1px solid var(--card-well-border)',
                          }}
                        >
                          {checked && (
                            <Check
                              size={15}
                              strokeWidth={2.5}
                              aria-hidden="true"
                            />
                          )}
                        </button>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          {item.triggeredByCategory && (
                            <div style={{ marginBottom: '5px' }}>
                              <span className="unseen-pill high">
                                <span className="unseen-pill-dot" />
                                {item.triggeredByCategory.replace(/_/g, ' ')}
                              </span>
                            </div>
                          )}
                          <h3
                            className="unseen-card-title"
                            style={{
                              fontSize: '0.95rem',
                              textDecoration: checked ? 'line-through' : 'none',
                              opacity: checked ? 0.55 : 1,
                            }}
                          >
                            {item.title}
                          </h3>
                          <p
                            style={{
                              margin: '5px 0 0',
                              fontSize: '0.8rem',
                              color: 'var(--card-ink-muted)',
                              lineHeight: 1.5,
                            }}
                          >
                            {item.description}
                          </p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <section
            aria-label="General Digital Safety Habits"
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <div className="unseen-section-head">
              <h2 className="unseen-section-title">
                Everyday Creator Safety Habits
              </h2>
              <span
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  color: 'var(--on-surface-variant)',
                }}
              >
                Universal Protocol
              </span>
            </div>

            <div
              className="unseen-cream-card compact"
              style={{
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {general.map((item) => {
                const checked = props.checkedIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => props.onToggleChecked(item.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px',
                      borderRadius: '12px',
                      border: 'none',
                      background: checked ? 'rgba(234, 219, 206, 0.45)' : 'transparent',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        marginTop: '1px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        background: checked ? 'var(--card-ink)' : '#ffffff',
                        color: checked
                          ? 'var(--on-surface)'
                          : 'var(--card-ink)',
                        border: checked
                          ? '1px solid var(--card-ink)'
                          : '1px solid var(--card-well-border)',
                      }}
                    >
                      {checked && (
                        <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                      )}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.88rem',
                          fontWeight: 800,
                          color: 'var(--card-ink)',
                          lineHeight: 1.35,
                          textDecoration: checked ? 'line-through' : 'none',
                          opacity: checked ? 0.55 : 1,
                        }}
                      >
                        {item.title}
                      </div>
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--card-ink-muted)',
                          marginTop: '3px',
                          lineHeight: 1.45,
                        }}
                      >
                        {item.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
