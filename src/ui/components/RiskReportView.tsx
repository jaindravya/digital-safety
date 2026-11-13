/**
 * @file src/ui/components/RiskReportView.tsx
 * @description Step 2 Cross-Content Privacy Audit Report displaying the `0–100`
 * Exposure Index, `"With X% confidence..."` abstract insight cards, connected
 * multi-platform evidence thumbnails, and anonymous Thumbs Up/Down feedback.
 *
 * Feature Overview:
 * Turns Stage 1 + Stage 2 Gemini findings into an approachable, jargon-free creator
 * dashboard. Rather than showing scary technical logs or inferred home addresses,
 * each card connects the exact contributing photos and articles, explains *why*
 * they compound, cites RAINN digital safety guidance, and offers one-click
 * **"Make Post Safer"** entry into the Pre-Post Fix Studio.
 *
 * Primary Use Cases:
 * 1. Reviewing cumulative routine, live-location, and visual PII risks on Android or Mac.
 * 2. Launching `SafeFixStudioModal` on any contributing post and watching risks flip
 *    to `Addressed` as the Exposure Score drops!
 */

import {
  CheckCircle2,
  FileText,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  Wand2,
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
 * Renders the full Privacy Audit Report, connected evidence cards, and accuracy feedback bar.
 *
 * @param props - Audit report, staged posts, applied fixes, and action callbacks.
 * @returns Step 2 report view element.
 */
export function RiskReportView(
  props: RiskReportViewProps,
): React.ReactElement {
  const [feedbackSent, setFeedbackSent] = useState<AccuracyRating | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');

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
    <div>
      <ExposureScoreGauge
        score={liveScoreSummary.score}
        band={liveScoreSummary.band}
        postsReviewedCount={props.report.postsReviewedCount}
        totalRisksCount={props.report.crossPlatformRisks.length}
        addressedRisksCount={addressedCount}
        limitationsNotice={props.report.limitationsNotice}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '14px',
        }}
      >
        <h2 className="unseen-serif-h2" style={{ margin: 0 }}>
          Connected Privacy Insights ({props.report.crossPlatformRisks.length})
        </h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="unseen-btn unseen-btn-secondary unseen-btn-sm"
            disabled={props.isRescanning}
            onClick={props.onRescan}
          >
            <RefreshCw size={14} />
            {props.isRescanning ? 'Re-scanning…' : 'Re-scan Feed'}
          </button>
          <button
            type="button"
            className="unseen-btn unseen-btn-secondary unseen-btn-sm"
            onClick={props.onGoToBestPractices}
          >
            View Personalized Best Practices →
          </button>
        </div>
      </div>

      {props.report.crossPlatformRisks.length === 0 ? (
        <div className="unseen-card" style={{ textAlign: 'center', padding: '36px 20px' }}>
          <CheckCircle2 size={36} color="#186844" />
          <h3 className="unseen-serif-h2" style={{ marginTop: '10px' }}>
            No high-confidence cumulative patterns flagged
          </h3>
          <p style={{ color: 'var(--ink-secondary)', maxWidth: '520px', margin: '6px auto 16px' }}>
            Unseen did not detect recurring schedule disclosures or readable mail/badges
            across these items. Review general safety habits before publishing!
          </p>
          <button
            type="button"
            className="unseen-btn unseen-btn-primary"
            onClick={props.onGoToBestPractices}
          >
            Open Creator Safety Checklist
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
              className="unseen-card"
              style={{
                borderColor: isAddressed ? '#b9dec9' : undefined,
                background: isAddressed ? '#fafdfb' : '#ffffff',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span
                    className={`unseen-pill ${isAddressed ? 'addressed' : risk.priority}`}
                  >
                    {isAddressed
                      ? '✓ Exposure Addressed'
                      : `${risk.priority.toUpperCase()} PRIORITY`}
                  </span>
                  {risk.platformsInvolved.map((platform) => (
                    <span key={platform} className="unseen-pill platform">
                      {platform.replace('_', ' ')}
                    </span>
                  ))}
                </div>
                {risk.occurrenceCount && risk.occurrenceCount > 1 && (
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--ink-secondary)' }}>
                    Connected across {risk.occurrenceCount} items
                  </span>
                )}
              </div>

              <h3 className="unseen-serif-h2" style={{ marginTop: '10px' }}>
                {risk.title}
              </h3>

              {risk.abstractConfidenceStatement && (
                <div
                  className={`unseen-confidence-callout ${isAddressed ? 'addressed' : ''}`}
                >
                  {risk.abstractConfidenceStatement}
                </div>
              )}

              <p style={{ margin: '8px 0', fontSize: '0.9rem', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                <strong>Why this matters:</strong> {risk.whyItMatters}
              </p>
              <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
                <strong>Safety guidance:</strong> {risk.safetyReferenceNote}
              </p>

              {/* Contributing Post Thumbnails + Action Buttons */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))',
                  gap: '12px',
                  marginTop: '12px',
                }}
              >
                {contributingPosts.map((post) => {
                  const appliedFix = props.appliedFixesByPostId[post.id];
                  const thumbSrc =
                    appliedFix?.redactedImageDataUrl ??
                    post.imageDataUrl ??
                    post.mediaAssetPath;

                  return (
                    <div
                      key={post.id}
                      style={{
                        border: '1px solid var(--border-sand)',
                        borderRadius: '14px',
                        padding: '10px',
                        background: 'var(--bg-cream)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {thumbSrc ? (
                          <img
                            src={thumbSrc}
                            alt={post.mediaAltDescription}
                            style={{
                              width: '62px',
                              height: '62px',
                              borderRadius: '10px',
                              objectFit: 'cover',
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '62px',
                              height: '62px',
                              borderRadius: '10px',
                              background: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <FileText size={22} color="var(--ink-secondary)" />
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {post.title ?? post.platform}
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--ink-secondary)',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {appliedFix ? appliedFix.updatedCaption : post.caption}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={`unseen-btn unseen-btn-sm ${
                          appliedFix ? 'unseen-btn-secondary' : 'unseen-btn-coral'
                        }`}
                        style={{ width: '100%' }}
                        onClick={() => props.onOpenFixStudio(post, risk)}
                      >
                        <Wand2 size={14} />
                        {appliedFix ? 'Review Before / After Fix' : 'Make This Post Safer'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })
      )}

      {/* Anonymous Accuracy Feedback Widget */}
      <section
        className="unseen-card"
        aria-label="Anonymous Report Accuracy Feedback"
        style={{ background: 'var(--bg-subtle)' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <strong style={{ fontSize: '0.92rem' }}>
              Was this privacy audit helpful and accurate?
            </strong>
            <div style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)' }}>
              Anonymous one-tap feedback (zero personal data or photos stored).
            </div>
          </div>

          {feedbackSent ? (
            <span className="unseen-pill low">
              Thank you — anonymous feedback logged!
            </span>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="unseen-input"
                style={{ width: '210px', padding: '7px 11px', fontSize: '0.82rem' }}
                placeholder="Optional short note..."
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                aria-label="Optional anonymous feedback comment"
              />
              <button
                type="button"
                className="unseen-btn unseen-btn-secondary unseen-btn-sm"
                onClick={() => handleFeedbackClick('thumbs_up')}
              >
                <ThumbsUp size={14} />
                Helpful
              </button>
              <button
                type="button"
                className="unseen-btn unseen-btn-secondary unseen-btn-sm"
                onClick={() => handleFeedbackClick('thumbs_down')}
              >
                <ThumbsDown size={14} />
                Missed Something
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
