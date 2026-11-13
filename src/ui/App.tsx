/**
 * @file src/ui/App.tsx
 * @description Root Creator Studio & Mobile PWA coordinator for Unseen.
 *
 * Feature Overview:
 * Orchestrates the complete ephemeral creator safety workflow inside Unseen's
 * dark-plum & warm-cream editorial interface across Mac browsers, iOS, and Android:
 *   - **Tab 1 (`intake`):** Content Intake + Ownership Consent Gate + Camera Roll
 *     upload + Blog/Substack URL import + 1-tap Sample Creator Feed.
 *   - **Tab 2 (`report`):** Curved Semi-Circular Exposure Index + `"With X% confidence..."`
 *     cross-platform cards + anonymous accuracy feedback.
 *   - **Tab 3 (`practices`):** Personalized & baseline safety playbook + local export.
 *   - **Tab 4 (`noise`):** Photo upload + defensive noise preview UI (pluggable
 *     placeholder for future backend perturbation endpoint).
 *   - **Modal (`SafeFixStudioModal`):** Smart Blur/Crop canvas + Gemini Stage 3
 *     voice-preserving caption rewrites + Before/After comparison.
 *   - **Header Controls:** Engine readiness badge, `Studio View / Phone View` frame
 *     toggle, and instant `Purge` session wipe with ephemeral toast feedback.
 *
 * Primary Use Cases:
 * 1. Running live multi-post + blog audits on desktop and mobile viewports.
 * 2. Demonstrating the end-to-end creator safety workflow with zero persistence.
 */

import {
  CheckCircle2,
  CheckSquare,
  Flame,
  Monitor,
  Radar,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  AppliedPostSafetyFix,
  CreatorPost,
  CrossPlatformRisk,
  PrivacyAuditReport,
  SafePostFixPlan,
} from '../domain/privacyTypes';
import { DemoCreatorPersona } from '../features/demo-dataset/mayaCreatorFeed';
import { AccuracyRating } from '../features/feedback/accuracyFeedbackStore';
import { createOwnershipAttestation } from '../features/guardrails/ownershipConsent';
import {
  buildBestPracticesForRisks,
  calculateOverallExposureScore,
} from '../features/risk-connector/riskScoringEngine';
import { logFunctionCall } from '../logging/logger';
import { createHttpPlatformBridge } from '../platform/httpPlatformAdapter';
import { EngineHealthStatus } from '../platform/platformBridge';
import { BestPracticesView } from './components/BestPracticesView';
import { ContentIntakeView } from './components/ContentIntakeView';
import { RiskReportView } from './components/RiskReportView';
import { SafeFixStudioModal } from './components/SafeFixStudioModal';
import { PhotoNoiseView } from './components/PhotoNoiseView';
import './styles/unseenTheme.css';

type ActiveTab = 'intake' | 'report' | 'practices' | 'noise';

const TAB_SUBTITLES: Record<ActiveTab, string> = {
  intake: 'Content Intake',
  report: 'Privacy Diagnostic',
  practices: 'Safety Playbook',
  noise: 'Photo Noise Shield',
};

/**
 * Renders the complete Unseen application across Studio and Mobile Phone layouts.
 *
 * @returns Top-level React element.
 */
export function App(): React.ReactElement {
  const bridge = useMemo(() => createHttpPlatformBridge(), []);

  const [health, setHealth] = useState<EngineHealthStatus | null>(null);
  const [mobilePreviewMode, setMobilePreviewMode] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('intake');

  const [attestation, setAttestation] = useState(() =>
    createOwnershipAttestation(false),
  );
  const [persona, setPersona] = useState<DemoCreatorPersona | null>(null);
  const [posts, setPosts] = useState<CreatorPost[]>([]);
  const [report, setReport] = useState<PrivacyAuditReport | null>(null);
  const [appliedFixes, setAppliedFixes] = useState<
    Record<string, AppliedPostSafetyFix>
  >({});
  const [checkedPracticeIds, setCheckedPracticeIds] = useState<Set<string>>(
    () => new Set(),
  );

  const [isScanning, setIsScanning] = useState(false);
  const [isImportingArticle, setIsImportingArticle] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [studioTarget, setStudioTarget] = useState<{
    post: CreatorPost;
    risk: CrossPlatformRisk;
  } | null>(null);
  const [activeFixPlan, setActiveFixPlan] = useState<SafePostFixPlan | null>(
    null,
  );
  const [isLoadingFixPlan, setIsLoadingFixPlan] = useState(false);

  useEffect(() => {
    bridge
      .getHealth()
      .then((res) => setHealth(res))
      .catch(() => setHealth(null));
  }, [bridge]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  /**
   * Loads the 6-post cross-platform sample creator feed for instant testing/demoing.
   */
  async function handleLoadSampleFeed(): Promise<void> {
    logFunctionCall('App.handleLoadSampleFeed', {});
    setBannerError(null);
    try {
      const feed = await bridge.loadDemoFeed();
      setPersona(feed.persona);
      setPosts([...feed.posts]);
      setReport(null);
      setAppliedFixes({});
      setToastMessage('Loaded 6-post creator feed into session RAM.');
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Could not load sample feed.',
      );
    }
  }

  /**
   * Imports a public Substack or blog article URL into the staged posts list.
   *
   * @param url - Public article URL entered by the creator.
   */
  async function handleImportArticleUrl(url: string): Promise<void> {
    logFunctionCall('App.handleImportArticleUrl', { url });
    setIsImportingArticle(true);
    try {
      const articlePost = await bridge.importArticleUrl(url);
      setPosts((prev) => [articlePost, ...prev]);
      setToastMessage('Imported article text into session RAM.');
    } finally {
      setIsImportingArticle(false);
    }
  }

  /**
   * Runs the full Stage 1 + Stage 2 Gemini privacy audit and navigates to the report.
   */
  async function handleRunAudit(): Promise<void> {
    logFunctionCall('App.handleRunAudit', { postCount: posts.length });
    setBannerError(null);
    setIsScanning(true);
    try {
      const auditReport = await bridge.runPrivacyAudit({
        posts,
        attestation,
      });
      setReport(auditReport);
      setActiveTab('report');
      setToastMessage(
        `Privacy audit complete across ${auditReport.postsReviewedCount} items.`,
      );
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Privacy audit failed.',
      );
    } finally {
      setIsScanning(false);
    }
  }

  /**
   * Opens the Pre-Post Fix Studio modal and requests Stage 3 caption rewrites.
   *
   * @param post - Target `CreatorPost` selected on a risk card.
   * @param risk - Associated `CrossPlatformRisk`.
   */
  async function handleOpenFixStudio(
    post: CreatorPost,
    risk: CrossPlatformRisk,
  ): Promise<void> {
    logFunctionCall('App.handleOpenFixStudio', {
      postId: post.id,
      riskId: risk.id,
    });
    setStudioTarget({ post, risk });
    setActiveFixPlan(null);
    setIsLoadingFixPlan(true);

    try {
      const postFinding = report?.postFindings.find(
        (f) => f.postId === post.id,
      );
      const plan = await bridge.requestPostFixPlan({
        post,
        risk,
        postFinding,
        attestation,
      });
      setActiveFixPlan(plan);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Could not load fix suggestions.',
      );
    } finally {
      setIsLoadingFixPlan(false);
    }
  }

  /**
   * Applies a creator-approved fix to the staged post, marks the risk `addressed`
   * when its posts have been fixed, and updates session state.
   *
   * @param fix - Creator-approved `AppliedPostSafetyFix`.
   */
  function handleApplyFix(fix: AppliedPostSafetyFix): void {
    logFunctionCall('App.handleApplyFix', {
      postId: fix.postId,
      riskId: fix.riskId,
    });

    const nextFixes = {
      ...appliedFixes,
      [fix.postId]: fix,
    };
    setAppliedFixes(nextFixes);

    setPosts((prev) =>
      prev.map((p) =>
        p.id === fix.postId
          ? {
              ...p,
              caption: fix.updatedCaption,
              imageDataUrl: fix.redactedImageDataUrl ?? p.imageDataUrl,
            }
          : p,
      ),
    );

    if (report) {
      setReport({
        ...report,
        crossPlatformRisks: report.crossPlatformRisks.map((r) =>
          r.id === fix.riskId ? { ...r, status: 'addressed' } : r,
        ),
      });
    }

    setStudioTarget(null);
    setToastMessage('Safe edit applied in volatile session RAM.');
  }

  /**
   * Immediately purges all ephemeral photos, articles, audit reports, and logs.
   */
  async function handlePurgeSession(): Promise<void> {
    logFunctionCall('App.handlePurgeSession', {});
    setPosts([]);
    setPersona(null);
    setReport(null);
    setAppliedFixes({});
    setCheckedPracticeIds(new Set());
    setActiveTab('intake');
    setBannerError(null);
    await bridge.clearAuditLogs().catch(() => {});
    setToastMessage('Session RAM purged. Zero traces retained.');
  }

  /**
   * Submits anonymous report accuracy rating via `UnseenPlatformBridge`.
   *
   * @param rating - `'thumbs_up'` or `'thumbs_down'`.
   * @param comment - Optional feedback note.
   */
  async function handleSubmitFeedback(
    rating: AccuracyRating,
    comment?: string,
  ): Promise<void> {
    await bridge.submitAccuracyFeedback({ rating, comment });
    setToastMessage('Anonymous accuracy verification logged.');
  }

  const bestPracticeItems = useMemo(
    () =>
      report?.bestPractices
        ? [...report.bestPractices]
        : buildBestPracticesForRisks([]),
    [report],
  );

  const liveExposureScore = report
    ? calculateOverallExposureScore(report.crossPlatformRisks).score
    : undefined;

  const shellContent = (
    <>
      <header className="unseen-topbar">
        <div className="unseen-topbar-inner">
          <button
            type="button"
            className="unseen-brand-btn"
            onClick={() => setActiveTab('intake')}
          >
            <div className="unseen-logo-mark" aria-hidden="true">
              <img
                src="/icons/icon-192.png"
                alt=""
                width={32}
                height={32}
                className="unseen-logo-img"
              />
            </div>
            <div>
              <div className="unseen-brand-row">
                <span className="unseen-brand-title">Unseen</span>
                <span className="unseen-zero-tag">Zero Storage</span>
              </div>
              <p className="unseen-brand-sub">{TAB_SUBTITLES[activeTab]}</p>
            </div>
          </button>

          <nav className="unseen-desktop-nav" aria-label="Unseen Workflow Steps">
            <button
              type="button"
              aria-current={activeTab === 'intake' ? 'page' : undefined}
              className={`unseen-nav-link ${activeTab === 'intake' ? 'active' : ''}`}
              onClick={() => setActiveTab('intake')}
            >
              Intake ({posts.length})
            </button>
            <button
              type="button"
              aria-current={activeTab === 'report' ? 'page' : undefined}
              className={`unseen-nav-link ${activeTab === 'report' ? 'active' : ''}`}
              disabled={!report}
              onClick={() => report && setActiveTab('report')}
            >
              Audit{report ? ` (${report.crossPlatformRisks.length})` : ''}
            </button>
            <button
              type="button"
              aria-current={activeTab === 'practices' ? 'page' : undefined}
              className={`unseen-nav-link ${activeTab === 'practices' ? 'active' : ''}`}
              onClick={() => setActiveTab('practices')}
            >
              Checklist
            </button>
            <button
              type="button"
              aria-current={activeTab === 'noise' ? 'page' : undefined}
              className={`unseen-nav-link ${activeTab === 'noise' ? 'active' : ''}`}
              onClick={() => setActiveTab('noise')}
            >
              Photo Noise
            </button>
          </nav>

          <div className="unseen-topbar-actions">
            {health && (
              <span
                className="unseen-engine-badge"
                title={
                  health.liveGeminiKeyConfigured
                    ? `Connected to live Google Gemini (${health.model})`
                    : `Demo/Heuristic mode active — add GEMINI_API_KEY in .env for live ${health.model}`
                }
              >
                <span
                  className={`unseen-engine-dot ${
                    health.liveGeminiKeyConfigured ? '' : 'demo'
                  }`}
                />
                <span>
                  {health.liveGeminiKeyConfigured
                    ? `Gemini Live`
                    : `Demo Ready`}
                </span>
              </span>
            )}

            <button
              type="button"
              className="unseen-header-pill-btn"
              onClick={() => setMobilePreviewMode((v) => !v)}
              title="Switch between full Mac Studio layout and Mobile Phone preview"
            >
              {mobilePreviewMode ? (
                <Monitor size={14} aria-hidden="true" />
              ) : (
                <Smartphone size={14} aria-hidden="true" />
              )}
              <span>{mobilePreviewMode ? 'Studio' : 'Mobile'}</span>
            </button>

            <button
              type="button"
              className="unseen-header-pill-btn purge"
              aria-label="Quick Panic Wipe"
              onClick={handlePurgeSession}
            >
              <Flame size={14} color="#ff6b6b" aria-hidden="true" />
              <span>Purge</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('noise')}
              aria-label="Open Photo Noise Shield"
              className="unseen-shield-circle-btn"
            >
              <ShieldCheck size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="unseen-container">
        {bannerError && (
          <div
            role="alert"
            className="unseen-cream-card compact"
            style={{
              background: 'var(--status-high-bg)',
              borderColor: 'var(--status-high-border)',
              color: 'var(--status-high-ink)',
              fontWeight: 700,
              fontSize: '0.84rem',
              marginBottom: '18px',
            }}
          >
            {bannerError}
          </div>
        )}

        {activeTab === 'intake' && (
          <ContentIntakeView
            posts={posts}
            persona={persona}
            attestation={attestation}
            isScanning={isScanning}
            isImportingArticle={isImportingArticle}
            engineModelLabel={health?.model}
            onToggleAttestation={(accepted) =>
              setAttestation(createOwnershipAttestation(accepted))
            }
            onAddPosts={(added) => {
              setPosts((prev) => [...added, ...prev]);
              setToastMessage(
                `Staged ${added.length} item${added.length === 1 ? '' : 's'} in RAM.`,
              );
            }}
            onUpdatePostCaption={(postId, caption) =>
              setPosts((prev) =>
                prev.map((p) => (p.id === postId ? { ...p, caption } : p)),
              )
            }
            onRemovePost={(postId) =>
              setPosts((prev) => prev.filter((p) => p.id !== postId))
            }
            onImportArticleUrl={handleImportArticleUrl}
            onLoadSampleFeed={handleLoadSampleFeed}
            onRunAudit={handleRunAudit}
          />
        )}

        {activeTab === 'report' && report && (
          <RiskReportView
            report={report}
            posts={posts}
            appliedFixesByPostId={appliedFixes}
            isRescanning={isScanning}
            onOpenFixStudio={handleOpenFixStudio}
            onRescan={handleRunAudit}
            onSubmitFeedback={handleSubmitFeedback}
            onGoToBestPractices={() => setActiveTab('practices')}
          />
        )}

        {activeTab === 'practices' && (
          <BestPracticesView
            items={bestPracticeItems}
            checkedIds={checkedPracticeIds}
            currentExposureScore={liveExposureScore}
            onToggleChecked={(id) =>
              setCheckedPracticeIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) {
                  next.delete(id);
                } else {
                  next.add(id);
                  setToastMessage('Safety habit fortified in session RAM.');
                }
                return next;
              })
            }
            onResetChecked={() => {
              setCheckedPracticeIds(new Set());
              setToastMessage('Checklist ticks reset in session RAM.');
            }}
          />
        )}

        {activeTab === 'noise' && (
          <PhotoNoiseView
            onApplyShield={(request) =>
              bridge.applyDeepfakeShield({
                imageDataUrl: request.imageDataUrl,
                mode: request.mode,
                opacityDelta: request.opacityDelta,
              })
            }
            onNotify={setToastMessage}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="unseen-bottom-mobile-bar" aria-label="Mobile Navigation">
        <button
          type="button"
          aria-current={activeTab === 'intake' ? 'page' : undefined}
          className={`unseen-mobile-tab-btn ${activeTab === 'intake' ? 'active' : ''}`}
          onClick={() => setActiveTab('intake')}
        >
          <UploadCloud size={18} aria-hidden="true" />
          <span>Intake</span>
        </button>
        <button
          type="button"
          aria-current={activeTab === 'report' ? 'page' : undefined}
          className={`unseen-mobile-tab-btn ${activeTab === 'report' ? 'active' : ''}`}
          disabled={!report}
          onClick={() => report && setActiveTab('report')}
        >
          <Radar size={18} aria-hidden="true" />
          <span>Audit</span>
        </button>
        <button
          type="button"
          aria-current={activeTab === 'practices' ? 'page' : undefined}
          className={`unseen-mobile-tab-btn ${activeTab === 'practices' ? 'active' : ''}`}
          onClick={() => setActiveTab('practices')}
        >
          <CheckSquare size={18} aria-hidden="true" />
          <span>Checklist</span>
        </button>
        <button
          type="button"
          aria-current={activeTab === 'noise' ? 'page' : undefined}
          className={`unseen-mobile-tab-btn ${activeTab === 'noise' ? 'active' : ''}`}
          onClick={() => setActiveTab('noise')}
        >
          <Sparkles size={18} aria-hidden="true" />
          <span>Noise</span>
        </button>
      </nav>

      {studioTarget && (
        <SafeFixStudioModal
          post={studioTarget.post}
          risk={studioTarget.risk}
          fixPlan={activeFixPlan}
          isLoadingPlan={isLoadingFixPlan}
          existingFix={appliedFixes[studioTarget.post.id]}
          onApplyFix={handleApplyFix}
          onClose={() => setStudioTarget(null)}
        />
      )}

      {toastMessage && (
        <div role="status" aria-live="polite" className="unseen-toast">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minWidth: 0,
            }}
          >
            <CheckCircle2
              size={15}
              color="#75f1ba"
              style={{ flexShrink: 0 }}
              aria-hidden="true"
            />
            <span
              style={{
                fontSize: '0.76rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {toastMessage}
            </span>
          </div>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              color: '#e9b8d7',
              flexShrink: 0,
            }}
          >
            Ephemeral
          </span>
        </div>
      )}
    </>
  );

  return (
    <div
      className={`unseen-outer-stage ${
        mobilePreviewMode ? 'mobile-preview-mode' : ''
      }`}
    >
      {mobilePreviewMode ? (
        <div className="unseen-phone-frame">{shellContent}</div>
      ) : (
        shellContent
      )}
    </div>
  );
}
