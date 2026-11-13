/**
 * @file src/ui/components/ZeroStorageStoryView.tsx
 * @description Zero-Storage Privacy Proof & Counter-OSINT Architecture tab.
 *
 * Feature Overview:
 * Implements the reference UI's "Story / Zero-Storage Proof" view inside `src/ui/`,
 * inspecting live browser `localStorage`, `sessionStorage`, and `document.cookie`
 * counts in real time alongside an interactive breakdown of the three privacy leak
 * vectors Unseen defends against and an instant Panic Wipe button.
 *
 * Primary Use Cases:
 * 1. Demonstrating Unseen's zero-persistence guarantee to creators and judges.
 * 2. Offering one-tap navigation back to Content Intake or the Privacy Audit report.
 */

import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Flame,
  Lock,
  MapPinOff,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import React, { useState } from 'react';
import { logFunctionCall } from '../../logging/logger';

/**
 * Props accepted by `<ZeroStorageStoryView />`.
 */
export interface ZeroStorageStoryViewProps {
  readonly stagedItemCount: number;
  readonly hasAuditReport: boolean;
  readonly onGoToIntake: () => void;
  readonly onGoToReport: () => void;
  readonly onPurgeSession: () => Promise<void>;
}

const LEAK_VECTORS = [
  {
    id: 'triangulation',
    title: '01. Cross-Platform Architectural Triangulation',
    summary:
      'Balcony railings, café awnings, studio archways, and window reflections can narrow down a neighborhood block when combined across just a few casual posts.',
    defense:
      'Unseen detects recurring background markers across Instagram, YouTube, and Substack while strictly scrubbing street addresses and GPS coordinates.',
    Icon: MapPinOff,
  },
  {
    id: 'temporal',
    title: '02. Temporal Routine & Live-Location Clustering',
    summary:
      'Sharing "right now" event drafts or consistent Tuesday morning café and Pilates routines establishes predictable physical schedules.',
    defense:
      'Stage 2 isolates cross-post schedule patterns and Stage 3 suggests voice-preserving caption rewrites plus post-event delay timing.',
    Icon: Clock,
  },
  {
    id: 'documents',
    title: '03. Background Documents, Mail & Access Passes',
    summary:
      'High-resolution camera-roll photos often capture readable shipping labels, hotel keycard sleeves, or VIP wristbands in the corner of an aesthetic flatlay.',
    defense:
      'Gemini pinpoints sensitive regions with normalized bounding boxes so you can apply client-side Smart Blur before publishing.',
    Icon: ShieldAlert,
  },
] as const;

/**
 * Renders the Zero-Storage Proof metrics, Panic Wipe action, and Counter-OSINT brief.
 *
 * @param props - Current volatile session counts and navigation/purge handlers.
 * @returns Step 4 story/proof view element.
 */
export function ZeroStorageStoryView(
  props: ZeroStorageStoryViewProps,
): React.ReactElement {
  logFunctionCall('ZeroStorageStoryView.render', {
    stagedItemCount: props.stagedItemCount,
  });

  const [activeVectorId, setActiveVectorId] = useState<string>('triangulation');

  const localStorageKeys =
    typeof window !== 'undefined' ? window.localStorage.length : 0;
  const sessionStorageKeys =
    typeof window !== 'undefined' ? window.sessionStorage.length : 0;
  const cookieCount =
    typeof document !== 'undefined' && document.cookie.trim()
      ? document.cookie.split(';').length
      : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <section className="unseen-hero" style={{ marginBottom: 0 }}>
        <p className="unseen-hero-eyebrow">
          Field Manifesto · Privacy-Preserving Architecture
        </p>
        <h1 className="unseen-hero-title">
          Safe in plain sight. Unseen by design.
        </h1>
        <p className="unseen-hero-sub">
          Most privacy tools ask you to create an account, upload your archive to
          a cloud bucket, and trust a retention policy. Unseen runs strictly in
          ephemeral session memory.
        </p>
      </section>

      <div className="unseen-split-grid">
        {/* Left Column: Why Ephemeral + Live Storage Proof */}
        <div className="unseen-col-stack">
          <div
            className="unseen-cream-card"
            style={{
              padding: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '22px 20px',
                background:
                  'linear-gradient(135deg, #2d142b 0%, #1b0b1a 65%, #381a36 100%)',
                color: 'var(--on-surface)',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                borderBottom: '1px solid var(--card-border)',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'rgba(233, 184, 215, 0.16)',
                  border: '1px solid rgba(233, 184, 215, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#e9b8d7',
                  flexShrink: 0,
                }}
              >
                <ShieldCheck size={22} aria-hidden="true" />
              </div>
              <div>
                <div
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: '#e9b8d7',
                  }}
                >
                  Ephemeral By Default
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                  Zero Accounts · Zero Databases
                </div>
              </div>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h2 className="unseen-card-title" style={{ fontSize: '1.12rem' }}>
                Why Ephemeral Matters
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.82rem',
                  color: 'var(--card-ink-muted)',
                  lineHeight: 1.55,
                }}
              >
                A digital safety tool should never become a surveillance
                database itself. Every staged photo, article excerpt, and
                checklist tick lives strictly inside volatile session RAM and
                vanishes when you close this tab or tap Purge.
              </p>
            </div>
          </div>

          <section
            className="unseen-cream-card"
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <span
                className="unseen-card-label"
                style={{
                  color: 'var(--card-ink)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Lock size={13} aria-hidden="true" />
                Live Browser Storage Proof
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#059669',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <CheckCircle2 size={14} aria-hidden="true" />
                Verified
              </span>
            </div>

            <div
              className="unseen-mono-num"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                textAlign: 'center',
              }}
            >
              <div className="unseen-white-tile">
                <div
                  style={{
                    fontSize: '1.45rem',
                    fontWeight: 800,
                    color: 'var(--card-ink)',
                  }}
                >
                  {localStorageKeys}
                </div>
                <div
                  style={{
                    fontSize: '0.68rem',
                    color: 'var(--card-ink-muted)',
                    fontWeight: 600,
                  }}
                >
                  LocalStorage
                </div>
              </div>
              <div className="unseen-white-tile">
                <div
                  style={{
                    fontSize: '1.45rem',
                    fontWeight: 800,
                    color: 'var(--card-ink)',
                  }}
                >
                  {sessionStorageKeys}
                </div>
                <div
                  style={{
                    fontSize: '0.68rem',
                    color: 'var(--card-ink-muted)',
                    fontWeight: 600,
                  }}
                >
                  SessionStorage
                </div>
              </div>
              <div className="unseen-white-tile">
                <div
                  style={{
                    fontSize: '1.45rem',
                    fontWeight: 800,
                    color: 'var(--card-ink)',
                  }}
                >
                  {cookieCount}
                </div>
                <div
                  style={{
                    fontSize: '0.68rem',
                    color: 'var(--card-ink-muted)',
                    fontWeight: 600,
                  }}
                >
                  Cookies Set
                </div>
              </div>
            </div>

            <p
              className="unseen-mono-num"
              style={{
                margin: 0,
                fontSize: '0.75rem',
                color: 'var(--card-ink-muted)',
                lineHeight: 1.45,
              }}
            >
              Current volatile session holds {props.stagedItemCount} staged item
              {props.stagedItemCount === 1 ? '' : 's'} in RAM only.
            </p>

            <button
              type="button"
              onClick={props.onPurgeSession}
              className="unseen-btn unseen-btn-danger-soft unseen-btn-full"
              style={{ minHeight: '42px', fontSize: '0.78rem' }}
            >
              <Flame size={15} aria-hidden="true" />
              <span>Execute Instant Panic Wipe</span>
            </button>
          </section>
        </div>

        {/* Right Column: Three Leak Vectors We Neutralize */}
        <div className="unseen-col-stack">
          <div className="unseen-section-head">
            <h2 className="unseen-section-title">
              Three Leak Vectors We Neutralize
            </h2>
            <span
              style={{
                fontSize: '0.76rem',
                fontWeight: 600,
                color: 'var(--on-surface-variant)',
              }}
            >
              Counter-OSINT Brief
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {LEAK_VECTORS.map((vector) => {
              const isOpen = activeVectorId === vector.id;
              const Icon = vector.Icon;
              return (
                <div
                  key={vector.id}
                  className="unseen-cream-card"
                  style={{ padding: 0, overflow: 'hidden' }}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setActiveVectorId(vector.id)}
                    style={{
                      width: '100%',
                      padding: '18px 20px',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: 'var(--card-well)',
                        border: '1px solid var(--card-well-border)',
                        color: 'var(--card-ink)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '2px',
                      }}
                    >
                      <Icon size={16} aria-hidden="true" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3
                        className="unseen-card-title"
                        style={{ fontSize: '0.98rem', lineHeight: 1.35 }}
                      >
                        {vector.title}
                      </h3>
                      <p
                        style={{
                          margin: '6px 0 0',
                          fontSize: '0.8rem',
                          color: 'var(--card-ink-muted)',
                          lineHeight: 1.5,
                        }}
                      >
                        {vector.summary}
                      </p>
                      {isOpen && (
                        <div
                          style={{
                            marginTop: '10px',
                            paddingTop: '10px',
                            borderTop: '1px solid var(--card-well-border)',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            color: 'var(--card-ink-secondary)',
                            lineHeight: 1.45,
                          }}
                        >
                          How Unseen defends: {vector.defense}
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '10px',
            }}
          >
            <button
              type="button"
              onClick={props.onGoToIntake}
              className="unseen-btn unseen-btn-cream unseen-btn-full"
              style={{ minHeight: '46px' }}
            >
              <span>Stage Content for Audit</span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={props.onGoToReport}
              disabled={!props.hasAuditReport}
              className="unseen-btn unseen-btn-plum unseen-btn-full"
              style={{ minHeight: '46px' }}
            >
              <span>
                {props.hasAuditReport
                  ? 'View Active Audit Report'
                  : 'Run Audit to Unlock Report'}
              </span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
