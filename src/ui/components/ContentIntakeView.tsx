/**
 * @file src/ui/components/ContentIntakeView.tsx
 * @description Step 1 Creator Content Intake view supporting Android/Mac Camera Roll
 * original photo uploads, public Blog/Substack article URL importing, and 1-tap
 * loading of the 6-post sample creator feed.
 *
 * Feature Overview:
 * Pairs Unseen's dark-plum editorial framing with a warm-cream diagnostic intake
 * card, monochrome mode toggle (`Photos` | `Article URL` | `Draft Text`),
 * self-audit ownership consent gate, and staged content gallery before launching
 * the Gemini multimodal audit.
 *
 * Primary Use Cases:
 * 1. Uploading original phone/Mac photos + pasting a blog URL on Android, iOS, or Mac.
 * 2. Editing captions or staging unpublished drafts before clicking Audit.
 */

import {
  AlertTriangle,
  Camera,
  ChevronDown,
  ChevronUp,
  FileText,
  Globe,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import { CreatorPost } from '../../domain/privacyTypes';
import { DemoCreatorPersona } from '../../features/demo-dataset/mayaCreatorFeed';
import { OwnershipAttestation } from '../../features/guardrails/ownershipConsent';
import { readCameraRollFileToPost } from '../../features/upload/cameraRollReader';
import { logFunctionCall } from '../../logging/logger';
import { ConsentBannerCard } from './ConsentBannerCard';

/**
 * Props accepted by `<ContentIntakeView />`.
 */
export interface ContentIntakeViewProps {
  readonly posts: readonly CreatorPost[];
  readonly persona: DemoCreatorPersona | null;
  readonly attestation: OwnershipAttestation;
  readonly isScanning: boolean;
  readonly isImportingArticle: boolean;
  readonly engineModelLabel?: string;
  readonly onToggleAttestation: (accepted: boolean) => void;
  readonly onAddPosts: (newPosts: readonly CreatorPost[]) => void;
  readonly onUpdatePostCaption: (postId: string, caption: string) => void;
  readonly onRemovePost: (postId: string) => void;
  readonly onImportArticleUrl: (url: string) => Promise<void>;
  readonly onLoadSampleFeed: () => Promise<void>;
  readonly onRunAudit: () => Promise<void>;
}

type IntakeMode = 'photos' | 'article' | 'draft';

/**
 * Renders the hero framing, intake hub card, Consent Gate, and staged post grid.
 *
 * @param props - State and action callbacks for staging content and launching the Gemini scan.
 * @returns Step 1 intake view element.
 */
export function ContentIntakeView(
  props: ContentIntakeViewProps,
): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [intakeMode, setIntakeMode] = useState<IntakeMode>('photos');
  const [showCameraRollInfo, setShowCameraRollInfo] = useState(false);
  const [articleUrl, setArticleUrl] = useState('');
  const [manualNoteTitle, setManualNoteTitle] = useState('');
  const [manualNoteBody, setManualNoteBody] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  /**
   * Processes files selected from the Android Gallery, iOS library, or Mac file picker.
   *
   * @param event - File input change event.
   */
  async function handleFilesSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) {
      return;
    }

    logFunctionCall('ContentIntakeView.handleFilesSelected', {
      fileCount: fileList.length,
    });
    setLocalError(null);

    const added: CreatorPost[] = [];
    for (let i = 0; i < fileList.length; i += 1) {
      const file = fileList.item(i);
      if (!file) continue;
      try {
        const post = await readCameraRollFileToPost(file, i);
        added.push(post);
      } catch (err) {
        setLocalError(
          err instanceof Error ? err.message : 'Photo upload failed.',
        );
      }
    }

    if (added.length > 0) {
      props.onAddPosts(added);
      setShowCameraRollInfo(true);
    }
    event.target.value = '';
  }

  /**
   * Submits a public blog or Substack URL to the backend extractor.
   *
   * @param event - Form submission event.
   */
  async function handleArticleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!articleUrl.trim()) {
      return;
    }
    logFunctionCall('ContentIntakeView.handleArticleSubmit', { articleUrl });
    setLocalError(null);
    try {
      await props.onImportArticleUrl(articleUrl.trim());
      setArticleUrl('');
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Could not import article link.',
      );
    }
  }

  /**
   * Adds a pasted newsletter/blog text snippet directly when testing offline drafts.
   */
  function handleAddPastedArticleExcerpt(): void {
    if (!manualNoteBody.trim()) {
      return;
    }
    logFunctionCall('ContentIntakeView.handleAddPastedArticleExcerpt', {
      title: manualNoteTitle,
    });
    props.onAddPosts([
      {
        id: `blog-draft-${Date.now()}`,
        platform: 'substack',
        title: manualNoteTitle.trim() || 'Draft Newsletter / Blog Post',
        caption: manualNoteBody.trim(),
        postedAtLabel: 'Draft Blog / Newsletter Excerpt',
        isDraft: true,
        mediaAltDescription: 'Written newsletter or blog post draft',
      },
    ]);
    setManualNoteTitle('');
    setManualNoteBody('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Editorial Hero Framing */}
      <section className="unseen-hero" style={{ marginBottom: 0 }}>
        <h1 className="unseen-hero-title">
          Audit your digital footprint without giving up your privacy.
        </h1>
        <p className="unseen-hero-sub">
          Safe in plain sight. Unseen by design. Zero accounts, zero cookies,
          zero saved photos.
        </p>
      </section>

      <div className="unseen-split-grid">
        {/* Left Column: Intake Control Card */}
        <div className="unseen-col-stack">
          <section
            className="unseen-cream-card"
            aria-label="Content Intake Controls"
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span className="unseen-card-label">Content Intake</span>
              <span
                className="unseen-pill platform"
                style={{
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}
              >
                <Zap size={12} color="#059669" aria-hidden="true" />
                {props.engineModelLabel
                  ? `${props.engineModelLabel} Ready`
                  : 'Gemini Vision Ready'}
              </span>
            </div>

            {/* Monochrome Black-and-White Mode Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '10px 0',
                borderTop: '1px solid var(--card-border)',
                borderBottom: '1px solid var(--card-border)',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: 'var(--card-ink)',
                }}
              >
                Source Type
              </span>

              <div
                role="tablist"
                aria-label="Content source mode"
                className="unseen-mono-track"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={intakeMode === 'photos'}
                  onClick={() => setIntakeMode('photos')}
                  className={`unseen-mono-option ${
                    intakeMode === 'photos' ? 'active' : ''
                  }`}
                >
                  Photos
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={intakeMode === 'article'}
                  onClick={() => setIntakeMode('article')}
                  className={`unseen-mono-option ${
                    intakeMode === 'article' ? 'active' : ''
                  }`}
                >
                  Article URL
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={intakeMode === 'draft'}
                  onClick={() => setIntakeMode('draft')}
                  className={`unseen-mono-option ${
                    intakeMode === 'draft' ? 'active' : ''
                  }`}
                >
                  Draft Text
                </button>
              </div>
            </div>

            {/* Active Input Mode Panel */}
            {intakeMode === 'photos' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  multiple
                  onChange={handleFilesSelected}
                  style={{ display: 'none' }}
                />

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="unseen-btn unseen-btn-sand"
                    style={{ flex: 1, minHeight: '42px', fontSize: '0.78rem' }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={15} aria-hidden="true" />
                    <span>Upload Photos from Camera Roll</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Toggle camera roll technical details"
                    aria-expanded={showCameraRollInfo}
                    onClick={() => setShowCameraRollInfo((prev) => !prev)}
                    className="unseen-btn unseen-btn-sand"
                    style={{
                      minHeight: '42px',
                      width: '42px',
                      padding: 0,
                      borderRadius: '12px',
                      flexShrink: 0,
                    }}
                  >
                    {showCameraRollInfo ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </button>
                </div>

                {showCameraRollInfo && (
                  <div
                    className="unseen-white-tile"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '7px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        color: 'var(--card-ink)',
                      }}
                    >
                      <Camera size={15} color="#059669" aria-hidden="true" />
                      <span>
                        Supports JPG, PNG, and WebP originals up to 20MB
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.74rem',
                        color: 'var(--card-ink-muted)',
                        lineHeight: 1.45,
                      }}
                    >
                      Original camera-roll photos let Gemini inspect subtle
                      background labels, reflections, and location cues (video
                      scanning coming in V1).
                    </p>
                  </div>
                )}
              </div>
            )}

            {intakeMode === 'article' && (
              <form
                onSubmit={handleArticleSubmit}
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: 'var(--card-ink-secondary)',
                  }}
                >
                  <Globe size={14} color="#c53030" aria-hidden="true" />
                  <span>Public Substack or Blog Post Link</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="url"
                    className="unseen-input"
                    placeholder="https://yourname.substack.com/p/..."
                    value={articleUrl}
                    onChange={(e) => setArticleUrl(e.target.value)}
                    aria-label="Public blog or Substack article URL"
                  />
                  <button
                    type="submit"
                    className="unseen-btn unseen-btn-sand"
                    style={{ minHeight: '42px', padding: '0 16px' }}
                    disabled={props.isImportingArticle || !articleUrl.trim()}
                  >
                    {props.isImportingArticle ? 'Reading…' : 'Add'}
                  </button>
                </div>
              </form>
            )}

            {intakeMode === 'draft' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  className="unseen-input"
                  placeholder="Draft title (optional)"
                  value={manualNoteTitle}
                  onChange={(e) => setManualNoteTitle(e.target.value)}
                />
                <textarea
                  rows={3}
                  className="unseen-textarea"
                  placeholder="Paste unpublished newsletter, caption, or blog paragraph..."
                  value={manualNoteBody}
                  onChange={(e) => setManualNoteBody(e.target.value)}
                />
                <button
                  type="button"
                  className="unseen-btn unseen-btn-sand unseen-btn-sm"
                  disabled={!manualNoteBody.trim()}
                  onClick={handleAddPastedArticleExcerpt}
                >
                  Add Written Draft to Queue
                </button>
              </div>
            )}

            {/* Primary Action CTAs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="unseen-btn unseen-btn-dark unseen-btn-full"
                style={{ minHeight: '48px' }}
                disabled={
                  props.posts.length === 0 ||
                  !props.attestation.attestedByCreator ||
                  props.isScanning
                }
                onClick={props.onRunAudit}
              >
                {props.isScanning ? (
                  <>
                    <RefreshCw size={16} className="unseen-spin" aria-hidden="true" />
                    <span>Analyzing visual & routine patterns…</span>
                  </>
                ) : (
                  <>
                    <Lock size={16} aria-hidden="true" />
                    <span>
                      Run Gemini Privacy Audit ({props.posts.length})
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                className="unseen-btn unseen-btn-sand unseen-btn-full"
                style={{ minHeight: '42px', fontSize: '0.8rem' }}
                onClick={props.onLoadSampleFeed}
              >
                <Sparkles size={15} aria-hidden="true" />
                <span>Load Sample Creator Feed (6)</span>
              </button>
            </div>

            {!props.attestation.attestedByCreator && props.posts.length > 0 && (
              <p
                style={{
                  margin: 0,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--status-high-ink)',
                  textAlign: 'center',
                }}
              >
                Confirm the Self-Audit Ownership check on the right to unlock
                scanning.
              </p>
            )}

            {/* Ephemeral Guarantee Banner */}
            <div
              className="unseen-well"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <ShieldCheck
                size={16}
                color="var(--card-ink)"
                style={{ flexShrink: 0, marginTop: '2px' }}
                aria-hidden="true"
              />
              <p
                style={{
                  margin: 0,
                  fontSize: '0.75rem',
                  color: 'var(--card-ink-secondary)',
                  lineHeight: 1.45,
                }}
              >
                <strong style={{ color: 'var(--card-ink)' }}>
                  100% Private &amp; Safe:
                </strong>{' '}
                No password needed. Your photos are never saved and stay strictly
                in session RAM.
              </p>
            </div>
          </section>
        </div>

        {/* Right Column: Consent Gate + Staged Content Gallery */}
        <div className="unseen-col-stack">
          <ConsentBannerCard
            attestation={props.attestation}
            onToggleAttestation={props.onToggleAttestation}
          />

          {localError && (
            <div
              role="alert"
              className="unseen-cream-card compact"
              style={{
                background: 'var(--status-high-bg)',
                borderColor: 'var(--status-high-border)',
                color: 'var(--status-high-ink)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              <AlertTriangle
                size={16}
                style={{ flexShrink: 0, marginTop: '2px' }}
                aria-hidden="true"
              />
              <span>{localError}</span>
            </div>
          )}

          {props.persona && (
            <div
              className="unseen-cream-card compact"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 800 }}>
                  Demo Persona: {props.persona.displayName}{' '}
                  <span
                    className="unseen-mono-num"
                    style={{ color: 'var(--card-plum)' }}
                  >
                    ({props.persona.handle})
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.76rem',
                    color: 'var(--card-ink-muted)',
                    marginTop: '2px',
                  }}
                >
                  {props.persona.bio}
                </div>
              </div>
              <span className="unseen-pill platform">Sample Feed Loaded</span>
            </div>
          )}

          {props.posts.length > 0 ? (
            <section
              aria-label="Staged Creator Content"
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div className="unseen-section-head">
                <h2 className="unseen-section-title">
                  Staged Photos, Articles &amp; Drafts
                </h2>
                <span className="unseen-pill cream unseen-mono-num">
                  {props.posts.length} Staged
                </span>
              </div>

              <div className="unseen-post-grid">
                {props.posts.map((post) => {
                  const previewSrc = post.imageDataUrl ?? post.mediaAssetPath;
                  return (
                    <article key={post.id} className="unseen-post-card">
                      {previewSrc ? (
                        <img
                          src={previewSrc}
                          alt={post.mediaAltDescription}
                          className="unseen-post-thumb"
                        />
                      ) : (
                        <div
                          className="unseen-post-thumb"
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '18px',
                            textAlign: 'center',
                            background: 'var(--card-well)',
                            color: 'var(--card-ink-secondary)',
                          }}
                        >
                          <FileText size={26} aria-hidden="true" />
                          <span
                            style={{
                              fontSize: '0.78rem',
                              marginTop: '6px',
                              fontWeight: 700,
                            }}
                          >
                            Imported Written Article
                          </span>
                        </div>
                      )}

                      <div
                        style={{
                          padding: '14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          flex: 1,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              gap: '6px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span className="unseen-pill platform">
                              {post.platform.replace('_', ' ')}
                            </span>
                            {post.isDraft && (
                              <span className="unseen-pill medium">Draft</span>
                            )}
                          </div>
                          <button
                            type="button"
                            aria-label={`Remove ${post.title ?? post.id}`}
                            onClick={() => props.onRemovePost(post.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--card-ink-subtle)',
                              padding: '4px',
                              borderRadius: '8px',
                            }}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </div>

                        {post.title && (
                          <div
                            style={{
                              fontWeight: 800,
                              fontSize: '0.86rem',
                              color: 'var(--card-ink)',
                              lineHeight: 1.3,
                            }}
                          >
                            {post.title}
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--card-ink-subtle)',
                          }}
                        >
                          {post.postedAtLabel}
                        </div>

                        <textarea
                          rows={3}
                          className="unseen-textarea"
                          style={{ fontSize: '0.78rem', marginTop: 'auto' }}
                          placeholder="Add caption, timing note, or excerpt..."
                          value={post.caption}
                          onChange={(e) =>
                            props.onUpdatePostCaption(post.id, e.target.value)
                          }
                          aria-label={`Caption or excerpt for ${
                            post.title ?? post.id
                          }`}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : (
            <section
              className="unseen-cream-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <span className="unseen-card-label">In-RAM Staging Queue</span>
              <h2 className="unseen-card-title">
                Stage photos, blog links, or Maya&apos;s 6-post creator feed
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.82rem',
                  color: 'var(--card-ink-muted)',
                  lineHeight: 1.55,
                }}
              >
                Individual posts often look harmless on their own. Add camera-roll
                images or newsletter links on the left—or tap{' '}
                <strong>Load Sample Creator Feed (6)</strong>—to see how Gemini
                connects cross-platform patterns before you publish.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
