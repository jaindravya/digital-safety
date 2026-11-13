/**
 * @file src/features/guardrails/ownershipConsent.ts
 * @description Self-auditing ownership attestation and consent enforcement module.
 *
 * Feature Overview:
 * Unseen is strictly a self-auditing digital safety assistant—never a third-party
 * investigation, stalking, or OSINT tool. Before any multimodal post scan or cross-platform
 * analysis can execute, the user must explicitly attest that they own or are authorized
 * to manage every piece of content submitted in the session.
 *
 * Primary Use Cases:
 * 1. Blocking audit execution in the core pipeline whenever ownership attestation is
 *    missing or revoked (`assertOwnershipAttestation`).
 * 2. Creating immutable, timestamped consent records (`createOwnershipAttestation`) for
 *    session observability without persisting personal identity to external storage.
 * 3. Enforcing Responsible Design rubric requirements at both UI and engine boundaries.
 */

import { APP_CONFIG } from '../../config/appConfig';
import { logFunctionCall } from '../../logging/logger';

/**
 * Immutable consent state confirming creator ownership/authorization for an audit session.
 */
export interface OwnershipAttestation {
  readonly attestedByCreator: boolean;
  readonly attestedAtIso: string | null;
  readonly scopeStatement: string;
}

/**
 * Error thrown when an audit or fix operation is attempted without valid creator
 * ownership attestation.
 */
export class OwnershipAttestationRequiredError extends Error {
  /**
   * Constructs a typed `OwnershipAttestationRequiredError`.
   *
   * @param message - Human-readable explanation suitable for creator UI display.
   */
  constructor(
    message = 'Please confirm that you own or are authorized to manage these posts before running Unseen.',
  ) {
    super(message);
    this.name = 'OwnershipAttestationRequiredError';
  }
}

/**
 * Standard creator-facing attestation statement displayed in the Consent Gate.
 */
export const DEFAULT_ATTESTATION_STATEMENT =
  'I confirm that I am the creator or authorized manager of the uploaded content and am using Unseen solely for defensive self-auditing.';

/**
 * Creates an immutable `OwnershipAttestation` object recording whether the creator
 * accepted the self-audit ownership confirmation.
 *
 * @param attestedByCreator - Boolean flag indicating explicit user confirmation.
 * @param customStatement - Optional override for the attestation scope statement.
 * @returns Frozen `OwnershipAttestation` value object.
 */
export function createOwnershipAttestation(
  attestedByCreator: boolean,
  customStatement: string = DEFAULT_ATTESTATION_STATEMENT,
): OwnershipAttestation {
  logFunctionCall('createOwnershipAttestation', {
    attestedByCreator,
    customStatement,
  });

  return Object.freeze({
    attestedByCreator,
    attestedAtIso: attestedByCreator ? new Date().toISOString() : null,
    scopeStatement: customStatement,
  });
}

/**
 * Validates whether an `OwnershipAttestation` satisfies the configured Responsible AI
 * policy in `APP_CONFIG.guardrails.requireOwnershipAttestation`.
 *
 * @param attestation - Attestation record supplied by the caller, if any.
 * @returns `true` if auditing is permitted; `false` otherwise.
 */
export function isOwnershipAttestationValid(
  attestation?: OwnershipAttestation | null,
): boolean {
  logFunctionCall('isOwnershipAttestationValid', {
    hasAttestation: Boolean(attestation),
    attestedByCreator: attestation?.attestedByCreator ?? false,
  });

  if (!APP_CONFIG.guardrails.requireOwnershipAttestation) {
    return true;
  }

  return Boolean(
    attestation &&
      attestation.attestedByCreator === true &&
      typeof attestation.attestedAtIso === 'string' &&
      attestation.attestedAtIso.length > 0,
  );
}

/**
 * Guards pipeline entry points by throwing `OwnershipAttestationRequiredError`
 * whenever creator ownership attestation is required and has not been granted.
 *
 * @param attestation - Attestation record supplied with an audit or rewrite request.
 * @throws {OwnershipAttestationRequiredError} When attestation is missing or false.
 */
export function assertOwnershipAttestation(
  attestation?: OwnershipAttestation | null,
): void {
  logFunctionCall('assertOwnershipAttestation', {
    hasAttestation: Boolean(attestation),
    attestedByCreator: attestation?.attestedByCreator ?? false,
  });

  if (!isOwnershipAttestationValid(attestation)) {
    throw new OwnershipAttestationRequiredError();
  }
}
