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

import { ShieldCheck } from 'lucide-react';
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
      className="unseen-card"
      aria-label="Privacy-First Self-Audit Terms and Ownership Attestation"
      style={{
        background: attestation.attestedByCreator ? '#f4faf6' : '#ffffff',
        borderColor: attestation.attestedByCreator ? '#b9dec9' : undefined,
      }}
    >
      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '12px',
            background: '#e7f5ee',
            color: '#186844',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ShieldCheck size={20} aria-hidden="true" />
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '4px',
            }}
          >
            <strong style={{ fontSize: '0.96rem' }}>
              Privacy-First · No Account · Zero Persistent Storage
            </strong>
            <span className="unseen-pill low">Self-Audit Only</span>
          </div>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: '0.86rem',
              color: 'var(--ink-secondary)',
              lineHeight: 1.45,
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
              fontSize: '0.88rem',
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              checked={attestation.attestedByCreator}
              onChange={handleCheckboxChange}
              style={{
                width: '18px',
                height: '18px',
                marginTop: '2px',
                accentColor: 'var(--accent-forest)',
              }}
            />
            <span>{DEFAULT_ATTESTATION_STATEMENT}</span>
          </label>
        </div>
      </div>
    </section>
  );
}
