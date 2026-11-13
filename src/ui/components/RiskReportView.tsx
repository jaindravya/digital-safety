/**
 * @file src/ui/components/RiskReportView.tsx
 * @description Step 2 Cross-Content Privacy Audit Report displaying the `0–100`
 * Exposure Index speedometer gauge, `"With X% confidence..."` insight cards,
 * connected multi-platform evidence thumbnails, and anonymous feedback controls.
 *
 * Feature Overview:
 * Turns Stage 1 + Stage 2 Gemini findings into an editorial dark-plum & cream
 * diagnostic workspace. Connects contributing photos and articles across
 * platforms, explains why disclosures compound without revealing raw addresses,
 * cites RAINN guidance, and launches `SafeFixStudioModal` on any flagged post.
 *
 * Primary Use Cases:
 * 1. Reviewing cumulative routine, live-location, and visual PII risks on iOS, Android, or Mac.
 * 2. Launching `SafeFixStudioModal` and watching the Exposure Index drop live.
 */

import {
  ArrowRight,
  CheckCircle2,
  Eye,
  FileText,
  RefreshCw,
  Shield,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  Wand2,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import {
  AppliedPostSafetyFix,
  CreatorPost,
  CrossPlatformRisk,
  PrivacyAuditReport,
} from '../../domain/privacyTypes';
import { AccuracyRating } from '../../features/feedback/accuracyFeedbackStore';
import { calculateOverallExposureScore } from '../../features/risk-connector/riskScoringEngine';
import { logFunctionCall } from '../../logging/logger';
import { ExposureScoreGauge } from './ExposureScoreGauge';

/**
 * Props accepted by `<RiskReportView />`.
 */
export interface RiskReportViewProps {
  readonly report: PrivacyAuditReport;
  readonly posts: readonly CreatorPost[];
  readonly appliedFixesByPostId: Readonly<Record<string, AppliedPostSafetyFix>>;
  readonly isRescanning: boolean;
  readonly onOpenFixStudio: (post: CreatorPost, risk: CrossPlatformRisk) => void;
  readonly onRescan: () => Promise<void>;
  readonly onSubmitFeedback: (
    rating: AccuracyRating,
    comment?: string,
  ) => Promise<void>;
  readonly onGoToBestPractices: () => void;
}

/**
 * Renders the 2-column Privacy Audit Report, connected evidence cards, and feedback bar.
 *
 * @param props - Audit report, staged posts, applied fixes, and action callbacks.
 * @returns Step 2 report view element.
 */
export function RiskReportView(
  props: RiskReportViewProps,
): React.ReactElement {
  const [feedbackSent, setFeedbackSent] = useState<AccuracyRating | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [selectedPreview, setSelectedPreview] = useState<{
    readonly post: CreatorPost;
    readonly risk: CrossPlatformRisk;
    readonly src: string;
  } | null>(null);

  const liveScoreSummary = calculateOverallExposureScore(
    props.report.crossPlatformRisks,
  );
  const addressedCount = props.report.crossPlatformRisks.filter(
    (r) => r.status === 'addressed',
  ).length;

  const postMap = new Map(props.posts.map((p) => [p.id, p]));

  /**
   * Submits anonymized Thumbs Up / Thumbs Down report feedback.
   *
   * @param rating - Selected binary accuracy rating.
   */
  async function handleFeedbackClick(rating: AccuracyRating): Promise<void> {
    logFunctionCall('RiskReportView.handleFeedbackClick', { rating });
    await props.onSubmitFeedback(rating, feedbackComment);
    setFeedbackSent(rating);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Editorial Hero Framing */}
      <section className="unseen-hero" style={{ marginBottom: 0 }}>
        <h1 className="unseen-hero-title">
          Your cross-platform privacy diagnostic.
        </h1>
        <p className="unseen-hero-sub">
          Connected disclosures surfaced before publishing. Fix flagged posts in
          one tap without giving up your creative voice.
        </p>
      </section>

      <div className="unseen-split-grid">
        {/* Left Column: Active Scan Banner + Speedometer Gauge + Accuracy Switch */}
        <div className="unseen-col-stack">
          <div
            className="unseen-cream-card compact"
            style={{
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: 0,
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: props.isRescanning ? '#ff6b6b' : '#10b981',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: 'var(--card-ink)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Active Audit ·{' '}
                <span style={{ color: 'var(--card-plum)' }}>
                  {props.report.usedDemoFallback ? 'Demo Engine' : 'Gemini Live'}
                </span>
              </span>
            </div>
            <span
              className="unseen-pill platform unseen-mono-num"
              style={{ fontSize: '0.72rem' }}
            >
              {props.report.postsReviewedCount} Items Audited
            </span>
          </div>

          <ExposureScoreGauge
            score={liveScoreSummary.score}
            band={liveScoreSummary.band}
            postsReviewedCount={props.report.postsReviewedCount}
            totalRisksCount={props.report.crossPlatformRisks.length}
            addressedRisksCount={addressedCount}
            limitationsNotice={props.report.limitationsNotice}
          />

          {/* Interactive Accuracy Feedback Card with Monochrome Toggle */}
          <section
            className="unseen-cream-card"
            aria-label="Anonymous Report Accuracy Feedback"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <h3 className="unseen-card-title" style={{ fontSize: '0.98rem' }}>
                Was this risk assessment accurate?
              </h3>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '0.76rem',
                  color: 'var(--card-ink-muted)',
                }}
              >
                Anonymous one-tap feedback (zero personal data or photos
                stored).
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div
                role="group"
                aria-label="Assessment accuracy feedback"
                className="unseen-mono-track"
                style={{ padding: '5px' }}
              >
                <button
                  type="button"
                  onClick={() => handleFeedbackClick('thumbs_up')}
                  className={`unseen-mono-option ${
                    feedbackSent === 'thumbs_up' ? 'active' : ''
                  }`}
                  style={{ minHeight: '36px', padding: '6px 16px' }}
                >
                  <ThumbsUp size={13} aria-hidden="true" />
                  <span>Accurate</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFeedbackClick('thumbs_down')}
                  className={`unseen-mono-option ${
                    feedbackSent === 'thumbs_down' ? 'active' : ''
                  }`}
                  style={{ minHeight: '36px', padding: '6px 16px' }}
                >
                  <ThumbsDown size={13} aria-hidden="true" />
                  <span>Missed Something</span>
                </button>
              </div>
            </div>

            <input
              type="text"
              className="unseen-input"
              style={{ fontSize: '0.78rem', padding: '8px 12px' }}
              placeholder="Optional anonymous note (addresses are stripped)..."
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              aria-label="Optional anonymous feedback comment"
            />

            {feedbackSent && (
              <p
                style={{
                  margin: 0,
                  textAlign: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <CheckCircle2 size={14} aria-hidden="true" />
                <span>
                  {feedbackSent === 'thumbs_up'
                    ? 'Feedback recorded in volatile RAM only.'
                    : 'Missed cue noted in volatile RAM only.'}
                </span>
              </p>
            )}

            <button
              type="button"
              disabled={props.isRescanning}
              onClick={props.onRescan}
              className="unseen-btn unseen-btn-sand unseen-btn-full"
              style={{ minHeight: '42px', fontSize: '0.78rem' }}
            >
              <RefreshCw
                size={14}
                className={props.isRescanning ? 'unseen-spin' : undefined}
                aria-hidden="true"
              />
              <span>
                {props.isRescanning ? 'Re-scanning Feed…' : 'Re-scan Feed'}
              </span>
            </button>
          </section>
        </div>

        {/* Right Column: What We Found + Insight Cards + Next Step Card */}
        <div className="unseen-col-stack">
          <div className="unseen-section-head">
            <h2 className="unseen-section-title">
              <Eye size={19} color="#e9b8d7" aria-hidden="true" />
              <span>What We Found</span>
            </h2>
            <span className="unseen-pill cream unseen-mono-num">
              {props.report.crossPlatformRisks.length} Detections
            </span>
          </div>

          {/* Anti-Doxxing Defense Rule Banner */}
          <div
            className="unseen-cream-card compact"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '14px 16px',
            }}
          >
            <ShieldAlert
              size={18}
              color="var(--card-ink)"
              style={{ flexShrink: 0, marginTop: '2px' }}
              aria-hidden="true"
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  color: 'var(--card-ink)',
                }}
              >
                Your Private Details are Hidden:
              </span>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.76rem',
                  color: 'var(--card-ink-muted)',
                  lineHeight: 1.4,
                }}
              >
                We never infer or display exact home addresses, street numbers,
                or GPS coordinates.
              </p>
            </div>
          </div>

          {props.report.crossPlatformRisks.length === 0 ? (
            <div
              className="unseen-cream-card"
              style={{
                textAlign: 'center',
                padding: '34px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <CheckCircle2 size={34} color="#065f46" aria-hidden="true" />
              <h3 className="unseen-card-title">
                No high-confidence cumulative patterns flagged
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.82rem',
                  color: 'var(--card-ink-muted)',
                  maxWidth: '480px',
                  lineHeight: 1.5,
                }}
              >
                Unseen did not detect recurring schedule disclosures or readable
                mail/badges across these items. Review your Safety Playbook
                before publishing.
              </p>
              <button
                type="button"
                className="unseen-btn unseen-btn-dark"
                onClick={props.onGoToBestPractices}
              >
                Open Creator Safety Playbook
              </button>
            </div>
          ) : (
            props.report.crossPlatformRisks.map((risk) => {
              const isAddressed = risk.status === 'addressed';
              const contributingPosts = risk.contributingPostIds
                .map((id) => postMap.get(id))
                .filter((p): p is CreatorPost => Boolean(p));

              return (
                <article
                  key={risk.id}
                  className="unseen-cream-card"
                  style={{
                    borderColor: isAddressed ? '#a7f3d0' : 'var(--card-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  {/* Top Confidence & Occurrence Header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      fontSize: '0.75rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        className={`unseen-pill unseen-mono-num ${
                          isAddressed ? 'addressed' : risk.priority
                        }`}
                      >
                        <span className="unseen-pill-dot" />
                        {isAddressed
                          ? '✓ Exposure Addressed'
                          : risk.confidencePercentage
                            ? `${risk.confidencePercentage}% Confidence`
                            : `${risk.priority.toUpperCase()} PRIORITY`}
                      </span>
                      {risk.platformsInvolved.map((platform) => (
                        <span key={platform} className="unseen-pill platform">
                          {platform.replace('_', ' ')}
                        </span>
                      ))}
                    </div>

                    <span
                      className="unseen-mono-num"
                      style={{
                        color: 'var(--card-ink-subtle)',
                        fontWeight: 600,
                      }}
                    >
                      Detected across{' '}
                      {risk.occurrenceCount ?? contributingPosts.length} item
                      {(risk.occurrenceCount ?? contributingPosts.length) === 1
                        ? ''
                        : 's'}
                    </span>
                  </div>

                  {/* Title & Abstract Confidence Statement */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <h3 className="unseen-card-title" style={{ fontSize: '1.08rem' }}>
                      {risk.title}
                    </h3>

                    {risk.abstractConfidenceStatement && (
                      <div
                        className={`unseen-confidence-callout ${
                          isAddressed ? 'addressed' : ''
                        }`}
                      >
                        {risk.abstractConfidenceStatement}
                      </div>
                    )}

                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.83rem',
                        color: 'var(--card-ink-muted)',
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ color: 'var(--card-ink)' }}>
                        Why this matters:
                      </strong>{' '}
                      {risk.whyItMatters}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.76rem',
                        color: 'var(--card-ink-subtle)',
                        lineHeight: 1.45,
                      }}
                    >
                      <strong style={{ color: 'var(--card-ink-secondary)' }}>
                        Safety guidance:
                      </strong>{' '}
                      {risk.safetyReferenceNote}
                    </p>
                  </div>

                  {/* Flagged Assets & Fix Studio Triggers */}
                  {contributingPosts.length > 0 && (
                    <div
                      style={{
                        paddingTop: '10px',
                        borderTop: '1px solid var(--card-border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <span
                        className="unseen-card-label"
                        style={{ fontSize: '0.68rem', color: 'var(--card-ink-subtle)' }}
                      >
                        Contributing Posts &amp; Assets
                      </span>

                      <div className="unseen-evidence-grid">
                        {contributingPosts.map((post) => {
                          const appliedFix = props.appliedFixesByPostId[post.id];
                          const thumbSrc =
                            appliedFix?.redactedImageDataUrl ??
                            post.imageDataUrl ??
                            post.mediaAssetPath;

                          return (
                            <div
                              key={post.id}
                              className="unseen-white-tile"
                              style={{
                                padding: '10px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '10px',
                                  alignItems: 'center',
                                }}
                              >
                                {thumbSrc ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedPreview({
                                        post,
                                        risk,
                                        src: thumbSrc,
                                      })
                                    }
                                    aria-label={`Inspect ${post.title ?? post.platform}`}
                                    style={{
                                      width: '56px',
                                      height: '56px',
                                      borderRadius: '10px',
                                      overflow: 'hidden',
                                      padding: 0,
                                      border: '1px solid var(--card-well-border)',
                                      background: 'var(--card-well)',
                                      flexShrink: 0,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <img
                                      src={thumbSrc}
                                      alt={post.mediaAltDescription}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        display: 'block',
                                      }}
                                    />
                                  </button>
                                ) : (
                                  <div
                                    style={{
                                      width: '56px',
                                      height: '56px',
                                      borderRadius: '10px',
                                      background: 'var(--card-well)',
                                      border: '1px solid var(--card-well-border)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                    }}
                                  >
                                    <FileText
                                      size={20}
                                      color="var(--card-ink-secondary)"
                                    />
                                  </div>
                                )}

                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div
                                    style={{
                                      fontSize: '0.78rem',
                                      fontWeight: 800,
                                      color: 'var(--card-ink)',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {post.title ?? post.platform}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '0.72rem',
                                      color: 'var(--card-ink-muted)',
                                      display: '-webkit-box',
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden',
                                      marginTop: '2px',
                                    }}
                                  >
                                    {appliedFix
                                      ? appliedFix.updatedCaption
                                      : post.caption}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                className={`unseen-btn unseen-btn-sm unseen-btn-full ${
                                  appliedFix ? 'unseen-btn-sand' : 'unseen-btn-dark'
                                }`}
                                onClick={() => props.onOpenFixStudio(post, risk)}
                              >
                                <Wand2 size={13} aria-hidden="true" />
                                <span>
                                  {appliedFix
                                    ? 'Review Before / After Fix'
                                    : 'Make This Post Safer'}
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}

          {/* Next Step Playbook Card */}
          <section
            className="unseen-cream-card"
            style={{
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              style={{
                position: 'absolute',
                right: '-24px',
                bottom: '-24px',
                width: '140px',
                height: '140px',
                opacity: 0.08,
                pointerEvents: 'none',
                color: 'var(--card-ink)',
              }}
            >
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              />
              <circle
                cx="50"
                cy="50"
                r="30"
                fill="none"
                stroke="currentColor"
                strokeDasharray="4 4"
                strokeWidth="2"
              />
              <circle cx="50" cy="50" r="14" fill="currentColor" />
            </svg>

            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Shield size={15} color="var(--card-plum)" aria-hidden="true" />
              <span
                className="unseen-card-label"
                style={{ color: 'var(--card-plum)' }}
              >
                Next Step
              </span>
            </div>

            <div style={{ paddingRight: '20px' }}>
              <h3 className="unseen-card-title" style={{ fontSize: '1.15rem' }}>
                Fortify Your Safety Playbook
              </h3>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '0.8rem',
                  color: 'var(--card-ink-muted)',
                  lineHeight: 1.5,
                }}
              >
                Review personalized digital safety habits triggered by this
                audit and download a clean offline checklist.
              </p>
            </div>

            <button
              type="button"
              onClick={props.onGoToBestPractices}
              className="unseen-btn unseen-btn-dark unseen-btn-full"
              style={{ position: 'relative', zIndex: 1, marginTop: '4px' }}
            >
              <span>Open Safety Playbook</span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </section>
        </div>
      </div>

      {/* Inline Asset Inspection Lightbox */}
      {selectedPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Inspect flagged photo"
          className="unseen-modal-backdrop"
          onClick={() => setSelectedPreview(null)}
        >
          <div
            className="unseen-cream-card"
            style={{
              maxWidth: '420px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
              }}
            >
              <h4
                className="unseen-card-title"
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedPreview.post.title ?? selectedPreview.post.platform}
              </h4>
              <button
                type="button"
                aria-label="Close inspection preview"
                onClick={() => setSelectedPreview(null)}
                className="unseen-btn unseen-btn-sand"
                style={{
                  minHeight: '36px',
                  width: '36px',
                  padding: 0,
                  borderRadius: '50%',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                borderRadius: '14px',
                overflow: 'hidden',
                background: 'var(--surface-dim)',
                aspectRatio: '1 / 1',
                border: '1px solid var(--card-well-border)',
              }}
            >
              <img
                src={selectedPreview.src}
                alt={selectedPreview.post.mediaAltDescription}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </div>

            <p
              style={{
                margin: 0,
                fontSize: '0.78rem',
                color: 'var(--card-ink-muted)',
                lineHeight: 1.5,
              }}
            >
              {selectedPreview.post.caption}
            </p>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="unseen-btn unseen-btn-dark"
                style={{ flex: 1 }}
                onClick={() => {
                  const { post, risk } = selectedPreview;
                  setSelectedPreview(null);
                  props.onOpenFixStudio(post, risk);
                }}
              >
                <Wand2 size={14} />
                <span>Open in Fix Studio</span>
              </button>
              <button
                type="button"
                className="unseen-btn unseen-btn-sand"
                onClick={() => setSelectedPreview(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
