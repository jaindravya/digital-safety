/**
 * @file src/ui/components/ConsentBannerCard.tsx
 * @description Account-less, privacy-first Self-Audit Ownership & T&C Attestation card.
 *
 * Feature Overview:
 * Enforces Responsible Design upfront: creators confirm they own or are authorized
 * to manage the photos and blog links submitted in the session, while clarifying
 * Unseen's zero-account, ephemeral in-memory processing guarantee.
 *
 * Primary Use Cases:
 * 1. Requiring explicit opt-in before enabling the Gemini privacy scan button.
 * 2. Communicating anti-surveillance, on-session-only privacy commitments clearly.
 */

import { Check, ShieldCheck } from 'lucide-react';
import React from 'react';
import {
  DEFAULT_ATTESTATION_STATEMENT,
  OwnershipAttestation,
} from '../../features/guardrails/ownershipConsent';
import { logFunctionCall } from '../../logging/logger';

/**
 * Props accepted by `<ConsentBannerCard />`.
 */
export interface ConsentBannerCardProps {
  readonly attestation: OwnershipAttestation;
  readonly onToggleAttestation: (accepted: boolean) => void;
}

/**
 * Renders the self-auditing ownership checkbox and privacy-first T&C summary card.
 *
 * @param props - Current `OwnershipAttestation` and toggle handler.
 * @returns Accessible React card element.
 */
export function ConsentBannerCard(
  props: ConsentBannerCardProps,
): React.ReactElement {
  const { attestation, onToggleAttestation } = props;

  /**
   * Handles checkbox change events and logs consent state transitions.
   *
   * @param event - Native checkbox input change event.
   */
  function handleCheckboxChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ): void {
    const checked = event.target.checked;
    logFunctionCall('ConsentBannerCard.handleCheckboxChange', { checked });
    onToggleAttestation(checked);
  }

  return (
    <section
      className="unseen-cream-card"
      aria-label="Privacy-First Self-Audit Terms and Ownership Attestation"
      style={{
        background: 'var(--card-sand)',
        borderColor: attestation.attestedByCreator
          ? '#a7f3d0'
          : 'var(--card-border)',
      }}
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '999px',
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
          <ShieldCheck size={17} aria-hidden="true" />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '6px',
            }}
          >
            <strong
              style={{
                fontSize: '0.84rem',
                fontWeight: 800,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                color: 'var(--card-ink)',
              }}
            >
              100% Private · Zero Persistent Storage
            </strong>
            <span
              className={`unseen-pill ${
                attestation.attestedByCreator ? 'low' : 'platform'
              }`}
            >
              <span className="unseen-pill-dot" />
              {attestation.attestedByCreator ? 'Consent Verified' : 'Self-Audit Gate'}
            </span>
          </div>

          <p
            style={{
              margin: '0 0 12px',
              fontSize: '0.8rem',
              color: 'var(--card-ink-muted)',
              lineHeight: 1.5,
            }}
          >
            Your original camera-roll photos and article links stay strictly in
            this ephemeral session and are never saved to a database or used to
            infer exact home addresses.
          </p>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              cursor: 'pointer',
              padding: '10px 12px',
              borderRadius: '12px',
              background: '#ffffff',
              border: '1px solid var(--card-well-border)',
            }}
          >
            <span
              style={{
                position: 'relative',
                width: '22px',
                height: '22px',
                borderRadius: '6px',
                background: attestation.attestedByCreator
                  ? 'var(--card-ink)'
                  : '#ffffff',
                border: attestation.attestedByCreator
                  ? '1px solid var(--card-ink)'
                  : '1px solid var(--card-well-border)',
                color: '#faf7f5',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '1px',
                transition: 'background-color 0.15s ease',
              }}
            >
              <input
                type="checkbox"
                checked={attestation.attestedByCreator}
                onChange={handleCheckboxChange}
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0,
                  margin: 0,
                  cursor: 'pointer',
                }}
              />
              {attestation.attestedByCreator && (
                <Check size={14} strokeWidth={2.75} aria-hidden="true" />
              )}
            </span>
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--card-ink)',
                lineHeight: 1.45,
              }}
            >
              {DEFAULT_ATTESTATION_STATEMENT}
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}
