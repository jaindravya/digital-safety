/**
 * @file src/ui/App.tsx
 * @description Root Creator Studio & Android Mobile App coordinator for Unseen.
 *
 * Feature Overview:
 * Orchestrates the complete ephemeral user journey across both Android standalone
 * PWA installations and macOS Studio viewports:
 *   - **Tab 1 (`intake`):** T&C Ownership Consent Gate + Camera Roll multi-photo
 *     upload + Blog/Substack URL import + 1-tap Sample Creator Feed.
 *   - **Tab 2 (`report`):** `0–100` Detected Exposure Index + `"With X% confidence..."`
 *     connected cross-platform cards + anonymous Thumbs Up/Down feedback.
 *   - **Tab 3 (`practices`):** Personalized & general safety checklist + local download.
 *   - **Modal (`SafeFixStudioModal`):** Interactive Smart Blur/Crop canvas + Gemini
 *     Stage 3 voice-preserving caption rewrites + Before/After preview.
 *   - **Header Controls:** Live `🖥 Studio | 📱 Android View` frame preview toggle
 *     and one-tap `Purge Session` wipe.
 *
 * Primary Use Cases:
 * 1. Running live multi-post + blog audits on Android and Mac.
 * 2. Demonstrating the end-to-end 5-scene creator story on stage.
 */

import {
  CheckSquare,
  Monitor,
  RotateCcw,
  ShieldAlert,
  Smartphone,
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
import './styles/unseenTheme.css';

type ActiveTab = 'intake' | 'report' | 'practices';

/**
 * Renders the complete Unseen application across Studio and Android Phone layouts.
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
        <div className="unseen-brand">
          <div className="unseen-logo-mark" aria-hidden="true">
            <span className="unseen-logo-dot" />
          </div>
          <div>
            <h1 className="unseen-brand-title">Unseen</h1>
            <p className="unseen-brand-sub">
              AI Digital Safety Assistant · Zero Storage
            </p>
          </div>
        </div>

        <div className="unseen-topbar-actions">
          {health && (
            <span
              className={`unseen-pill ${
                health.liveGeminiKeyConfigured ? 'low' : 'medium'
              }`}
              title={
                health.liveGeminiKeyConfigured
                  ? `Connected to live Google Gemini (${health.model})`
                  : `Demo/Heuristic mode active — add GEMINI_API_KEY in .env for live ${health.model}`
              }
            >
              {health.liveGeminiKeyConfigured
                ? `● Gemini Live (${health.model})`
                : `● ${health.model} (Demo Ready)`}
            </span>
          )}

          <button
            type="button"
            className="unseen-btn unseen-btn-secondary unseen-btn-sm"
            onClick={() => setMobilePreviewMode((v) => !v)}
            title="Switch between full Mac Studio layout and Android Phone preview"
          >
            {mobilePreviewMode ? <Monitor size={14} /> : <Smartphone size={14} />}
            {mobilePreviewMode ? 'Studio View' : 'Android View'}
          </button>

          {(posts.length > 0 || report) && (
            <button
              type="button"
              className="unseen-btn unseen-btn-secondary unseen-btn-sm"
              onClick={handlePurgeSession}
            >
              <RotateCcw size={14} />
              Purge Session
            </button>
          )}
        </div>
      </header>

      <main className="unseen-container">
        <nav className="unseen-step-nav" aria-label="Unseen Workflow Steps">
          <button
            type="button"
            className={`unseen-step-tab ${activeTab === 'intake' ? 'active' : ''}`}
            onClick={() => setActiveTab('intake')}
          >
            <UploadCloud size={16} />
            1. Add Content ({posts.length})
          </button>
          <button
            type="button"
            className={`unseen-step-tab ${activeTab === 'report' ? 'active' : ''}`}
            disabled={!report}
            onClick={() => report && setActiveTab('report')}
          >
            <ShieldAlert size={16} />
            2. Privacy Audit
            {report ? ` (${report.crossPlatformRisks.length})` : ''}
          </button>
          <button
            type="button"
            className={`unseen-step-tab ${activeTab === 'practices' ? 'active' : ''}`}
            onClick={() => setActiveTab('practices')}
          >
            <CheckSquare size={16} />
            3. Best Practices
          </button>
        </nav>

        {bannerError && (
          <div
            role="alert"
            className="unseen-card"
            style={{
              background: 'var(--status-high-bg)',
              borderColor: '#f3b8b3',
              color: 'var(--status-high-ink)',
              fontWeight: 600,
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
            onToggleAttestation={(accepted) =>
              setAttestation(createOwnershipAttestation(accepted))
            }
            onAddPosts={(added) => setPosts((prev) => [...added, ...prev])}
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
                }
                return next;
              })
            }
          />
        )}
      </main>

      {/* Native-feeling Mobile Bottom Navigation Bar on Android / Small Screens */}
      <nav className="unseen-bottom-mobile-bar" aria-label="Mobile Navigation">
        <button
          type="button"
          className={`unseen-step-tab ${activeTab === 'intake' ? 'active' : ''}`}
          onClick={() => setActiveTab('intake')}
        >
          <UploadCloud size={16} />
          Content
        </button>
        <button
          type="button"
          className={`unseen-step-tab ${activeTab === 'report' ? 'active' : ''}`}
          disabled={!report}
          onClick={() => report && setActiveTab('report')}
        >
          <ShieldAlert size={16} />
          Audit
        </button>
        <button
          type="button"
          className={`unseen-step-tab ${activeTab === 'practices' ? 'active' : ''}`}
          onClick={() => setActiveTab('practices')}
        >
          <CheckSquare size={16} />
          Checklist
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
