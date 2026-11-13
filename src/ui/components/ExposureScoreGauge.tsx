/**
 * @file src/ui/components/ExposureScoreGauge.tsx
 * @description Robinhood-inspired `0–100` Detected Exposure Index arc gauge paired
 * with live creator audit summary counters.
 *
 * Feature Overview:
 * Visualizes overall cumulative exposure (`0–100`) alongside `Low`, `Medium`, or
 * `High` status pills, reviewed item counts, active vs. addressed pattern counts,
 * and an explicit Responsible Design note clarifying that a low exposure index is
 * not a guarantee of complete anonymity.
 *
 * Primary Use Cases:
 * 1. Anchoring the top of `RiskReportView` with immediate visual hierarchy.
 * 2. Animating downward in real time as the creator applies pre-post fixes!
 */

import React from 'react';
import { RiskPriority } from '../../domain/privacyTypes';
import { logFunctionCall } from '../../logging/logger';

/**
 * Props accepted by `<ExposureScoreGauge />`.
 */
export interface ExposureScoreGaugeProps {
  readonly score: number;
  readonly band: RiskPriority;
  readonly postsReviewedCount: number;
  readonly totalRisksCount: number;
  readonly addressedRisksCount: number;
  readonly limitationsNotice: string;
}

/**
 * Renders the SVG arc gauge and 3-column summary telemetry cards.
 *
 * @param props - Score, severity band, counts, and limitations notice.
 * @returns Accessible overview section.
 */
export function ExposureScoreGauge(
  props: ExposureScoreGaugeProps,
): React.ReactElement {
  logFunctionCall('ExposureScoreGauge.render', {
    score: props.score,
    band: props.band,
    addressedRisksCount: props.addressedRisksCount,
  });

  const clamped = Math.min(100, Math.max(0, Math.round(props.score)));
  const radius = 54;
  const circumference = Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  const strokeColor =
    props.band === 'high'
      ? '#d85745'
      : props.band === 'medium'
        ? '#c97a1e'
        : '#186844';

  const bandLabel =
    props.band === 'high'
      ? 'High Cumulative Exposure'
      : props.band === 'medium'
        ? 'Moderate Cumulative Exposure'
        : 'Low Detected Exposure';

  return (
    <section className="unseen-card" aria-label="Privacy Overview Summary">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '24px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ width: '144px', textAlign: 'center' }}>
            <svg
              viewBox="0 0 140 86"
              width="144"
              height="88"
              role="img"
              aria-label={`Detected Exposure Index ${clamped} out of 100`}
            >
              <path
                d="M 16 74 A 54 54 0 0 1 124 74"
                fill="none"
                stroke="#ebe4d8"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <path
                d="M 16 74 A 54 54 0 0 1 124 74"
                fill="none"
                stroke={strokeColor}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                style={{ transition: 'stroke-dashoffset 0.45s ease, stroke 0.3s ease' }}
              />
              <text
                x="70"
                y="64"
                textAnchor="middle"
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  fill: 'var(--ink-primary)',
                }}
              >
                {clamped}
              </text>
              <text
                x="70"
                y="80"
                textAnchor="middle"
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  fill: 'var(--ink-muted)',
                  letterSpacing: '0.04em',
                }}
              >
                EXPOSURE INDEX
              </text>
            </svg>
          </div>

          <div style={{ maxWidth: '470px' }}>
            <div style={{ marginBottom: '6px' }}>
              <span className={`unseen-pill ${props.band}`}>{bandLabel}</span>
            </div>
            <h2 className="unseen-serif-h2">Your Cross-Content Privacy Mirror</h2>
            <p
              style={{
                margin: 0,
                fontSize: '0.84rem',
                color: 'var(--ink-secondary)',
                lineHeight: 1.45,
              }}
            >
              {props.limitationsNotice}
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(88px, 1fr))',
            gap: '10px',
            minWidth: '280px',
            flex: '1 1 280px',
          }}
        >
          <div
            style={{
              background: 'var(--bg-subtle)',
              borderRadius: '14px',
              padding: '12px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>
              {props.postsReviewedCount}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--ink-secondary)' }}>
              Items Scanned
            </div>
          </div>
          <div
            style={{
              background: 'var(--bg-subtle)',
              borderRadius: '14px',
              padding: '12px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>
              {props.totalRisksCount - props.addressedRisksCount}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--ink-secondary)' }}>
              Open Risks
            </div>
          </div>
          <div
            style={{
              background: '#e7f5ee',
              color: '#186844',
              borderRadius: '14px',
              padding: '12px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>
              {props.addressedRisksCount}
            </div>
            <div style={{ fontSize: '0.76rem', fontWeight: 600 }}>
              Fixes Applied
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
