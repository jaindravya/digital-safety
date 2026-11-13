/**
 * @file src/ui/components/BestPracticesView.tsx
 * @description Step 4 Personalized & General Digital Safety Checklist view with
 * ephemeral session checkboxes and one-tap local file download.
 *
 * Feature Overview:
 * Surfaces scan-triggered personalized safety recommendations alongside foundational
 * creator safety habits so users can take actionable guidance offline after their
 * zero-storage session ends.
 *
 * Primary Use Cases:
 * 1. Checking off safety steps before publishing across social platforms.
 * 2. Downloading `unseen-safety-checklist.md` locally on Android or Mac.
 */

import { CheckSquare, Download } from 'lucide-react';
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
}

/**
 * Renders interactive personalized and general safety checklist cards plus download button.
 *
 * @param props - Best-practice items, checked IDs set, and toggle callback.
 * @returns Accessible checklist view element.
 */
export function BestPracticesView(
  props: BestPracticesViewProps,
): React.ReactElement {
  const personalized = props.items.filter((i) => i.kind === 'personalized');
  const general = props.items.filter((i) => i.kind === 'general');

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
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '18px',
        }}
      >
        <div>
          <h1 className="unseen-serif-h1" style={{ fontSize: '1.8rem' }}>
            Personalized Creator Safety Checklist
          </h1>
          <p style={{ margin: 0, color: 'var(--ink-secondary)', fontSize: '0.92rem' }}>
            Tick items off during your session and download a copy—nothing is
            retained after you close Unseen.
          </p>
        </div>

        <button
          type="button"
          className="unseen-btn unseen-btn-primary"
          onClick={handleDownload}
        >
          <Download size={16} />
          Download Best Practices
        </button>
      </div>

      {personalized.length > 0 && (
        <section className="unseen-card" aria-label="Personalized Recommendations">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <CheckSquare size={19} color="var(--accent-coral)" />
            <h2 className="unseen-serif-h2" style={{ margin: 0 }}>
              Triggered by Your Audit ({personalized.length})
            </h2>
          </div>

          <div style={{ display: 'grid', gap: '10px' }}>
            {personalized.map((item) => {
              const checked = props.checkedIds.has(item.id);
              return (
                <label
                  key={item.id}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                    padding: '12px 14px',
                    borderRadius: '14px',
                    border: '1px solid var(--border-sand)',
                    background: checked ? '#f2faf6' : '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => props.onToggleChecked(item.id)}
                    style={{
                      width: '18px',
                      height: '18px',
                      marginTop: '3px',
                      accentColor: 'var(--accent-forest)',
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '0.92rem',
                        textDecoration: checked ? 'line-through' : 'none',
                      }}
                    >
                      {item.title}
                    </div>
                    <div style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)', marginTop: '3px' }}>
                      {item.description}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </section>
      )}

      <section className="unseen-card" aria-label="General Digital Safety Habits">
        <h2 className="unseen-serif-h2" style={{ marginBottom: '12px' }}>
          Everyday Creator Safety Habits
        </h2>
        <div style={{ display: 'grid', gap: '10px' }}>
          {general.map((item) => {
            const checked = props.checkedIds.has(item.id);
            return (
              <label
                key={item.id}
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  border: '1px solid var(--border-sand)',
                  background: checked ? '#f2faf6' : 'var(--bg-cream)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => props.onToggleChecked(item.id)}
                  style={{
                    width: '18px',
                    height: '18px',
                    marginTop: '3px',
                    accentColor: 'var(--accent-forest)',
                  }}
                />
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.92rem',
                      textDecoration: checked ? 'line-through' : 'none',
                    }}
                  >
                    {item.title}
                  </div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)', marginTop: '3px' }}>
                    {item.description}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}
