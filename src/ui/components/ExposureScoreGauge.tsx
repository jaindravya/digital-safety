/**
 * @file src/ui/components/ExposureScoreGauge.tsx
 * @description Precision curved semi-circular speedometer arc gauge (`0–100`
 * Detected Exposure Index) paired with live creator audit summary counters.
 *
 * Feature Overview:
 * Visualizes overall cumulative exposure (`0–100`) using a dual-segment coral/emerald
 * semi-circular SVG arc, status pill (`EXPOSURE DETECTED`, `PATTERN CUES`, or
 * `FORTIFIED`), symmetric threshold markers, 3 white telemetry cards, and an explicit
 * Responsible Design notice clarifying AI limitations.
 *
 * Primary Use Cases:
 * 1. Anchoring the left diagnostic column of `RiskReportView` with immediate visual hierarchy.
 * 2. Animating downward in real time as the creator applies pre-post fixes.
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
 * Converts polar coordinates into SVG Cartesian coordinates for arc construction.
 *
 * @param cx - Center X coordinate.
 * @param cy - Center Y coordinate.
 * @param r - Arc radius.
 * @param angleDeg - Angle in degrees (`180` = left, `0` = right).
 * @returns Rounded `{ x, y }` coordinates.
 */
function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): { readonly x: number; readonly y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Number((cx + r * Math.cos(rad)).toFixed(2)),
    y: Number((cy - r * Math.sin(rad)).toFixed(2)),
  };
}

/**
 * Builds an SVG arc path string between two angles on a semi-circle.
 *
 * @param cx - Center X coordinate.
 * @param cy - Center Y coordinate.
 * @param r - Arc radius.
 * @param startAngleDeg - Start angle in degrees.
 * @param endAngleDeg - End angle in degrees.
 * @returns SVG path `d` attribute string.
 */
function describeSemiArc(
  cx: number,
  cy: number,
  r: number,
  startAngleDeg: number,
  endAngleDeg: number,
): string {
  const start = polarToCartesian(cx, cy, r, startAngleDeg);
  const end = polarToCartesian(cx, cy, r, endAngleDeg);
  const largeArc = Math.abs(startAngleDeg - endAngleDeg) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * Renders the dual-segment semi-circular speedometer arc gauge and 3-column counters.
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

  const clampedScore = Math.min(100, Math.max(0, Math.round(props.score)));
  const splitAngle = 180 - (clampedScore / 100) * 180;
  const gapDeg = clampedScore > 4 && clampedScore < 96 ? 6 : 0;
  const riskArcEnd = Math.max(0, splitAngle + gapDeg);
  const safeArcStart = Math.max(0, splitAngle - gapDeg);

  const badgeText =
    props.band === 'high'
      ? 'EXPOSURE DETECTED'
      : props.band === 'medium'
        ? 'PATTERN CUES'
        : 'FORTIFIED';

  const thresholdCaption =
    props.band === 'high'
      ? 'High Risk Threshold'
      : props.band === 'medium'
        ? 'Moderate Risk Threshold'
        : 'Fortified Threshold';

  const thresholdCaptionColor =
    props.band === 'high'
      ? '#8c232a'
      : props.band === 'medium'
        ? '#92400e'
        : '#065f46';

  return (
    <section
      className="unseen-cream-card"
      aria-label="Privacy Overview Summary"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '10px',
      }}
    >
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <span className="unseen-card-label">Exposure Risk Level</span>
        <span className={`unseen-pill ${props.band}`}>
          <span className="unseen-pill-dot" />
          {badgeText}
        </span>
      </div>

      {/* Curved Semi-Circular Arc Speedometer Gauge */}
      <div
        style={{
          position: 'relative',
          width: '264px',
          height: '150px',
          marginTop: '4px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          userSelect: 'none',
        }}
      >
        <svg
          width="264"
          height="140"
          viewBox="0 0 280 145"
          role="img"
          aria-label={`Detected Exposure Index ${clampedScore} out of 100`}
          style={{
            overflow: 'visible',
            filter: 'drop-shadow(0 0 12px rgba(255, 84, 73, 0.18))',
          }}
        >
          <path
            d={describeSemiArc(140, 130, 105, 180, 0)}
            fill="none"
            stroke="#e0d7d0"
            strokeLinecap="round"
            strokeWidth="18"
          />
          {clampedScore > 2 && (
            <path
              d={describeSemiArc(140, 130, 105, 180, riskArcEnd)}
              fill="none"
              stroke="#ff5449"
              strokeLinecap="round"
              strokeWidth="18"
            />
          )}
          {clampedScore < 98 && (
            <path
              d={describeSemiArc(140, 130, 105, safeArcStart, 0)}
              fill="none"
              stroke="#158064"
              strokeLinecap="round"
              strokeWidth="18"
            />
          )}
        </svg>

        <div
          style={{
            position: 'absolute',
            bottom: '6px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <span
            className="unseen-mono-num"
            style={{
              fontSize: '44px',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: 'var(--card-ink)',
              lineHeight: 1,
            }}
          >
            {clampedScore}%
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: thresholdCaptionColor,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginTop: '5px',
            }}
          >
            {thresholdCaption}
          </span>
        </div>
      </div>

      {/* Symmetric Threshold Markers */}
      <div
        className="unseen-mono-num"
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: 'var(--card-ink-muted)',
          padding: '8px 4px 0',
          borderTop: '1px solid var(--card-border)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontWeight: 700,
            color: '#059669',
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#34d399',
              display: 'inline-block',
            }}
          />
          0 (Fortified)
        </span>
        <span style={{ fontWeight: 600 }}>50 (Moderate)</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontWeight: 700,
            color: '#c53030',
          }}
        >
          100 (Exposed)
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#ff6b6b',
              display: 'inline-block',
            }}
          />
        </span>
      </div>

      {/* Telemetry Counters */}
      <div
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '8px',
          marginTop: '4px',
        }}
      >
        <div className="unseen-white-tile" style={{ padding: '10px 8px' }}>
          <div
            className="unseen-mono-num"
            style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--card-ink)' }}
          >
            {props.postsReviewedCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--card-ink-muted)', fontWeight: 600 }}>
            Items Scanned
          </div>
        </div>
        <div className="unseen-white-tile" style={{ padding: '10px 8px' }}>
          <div
            className="unseen-mono-num"
            style={{ fontSize: '1.35rem', fontWeight: 800, color: '#c53030' }}
          >
            {props.totalRisksCount - props.addressedRisksCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--card-ink-muted)', fontWeight: 600 }}>
            Open Risks
          </div>
        </div>
        <div
          className="unseen-white-tile"
          style={{
            padding: '10px 8px',
            background: '#ecfdf5',
            borderColor: '#a7f3d0',
          }}
        >
          <div
            className="unseen-mono-num"
            style={{ fontSize: '1.35rem', fontWeight: 800, color: '#065f46' }}
          >
            {props.addressedRisksCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#065f46', fontWeight: 700 }}>
            Fixes Applied
          </div>
        </div>
      </div>

      <p
        style={{
          margin: '4px 0 0',
          fontSize: '0.75rem',
          color: 'var(--card-ink-muted)',
          lineHeight: 1.5,
          textAlign: 'left',
          width: '100%',
        }}
      >
        {props.limitationsNotice}
      </p>
    </section>
  );
}
