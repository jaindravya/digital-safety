/**
 * @file src/ui/components/ContentIntakeView.tsx
 * @description Step 1 Creator Content Intake view supporting Android/Mac Camera Roll
 * original photo uploads, public Blog/Substack article URL importing, and 1-tap
 * loading of the 6-post sample creator feed.
 *
 * Feature Overview:
 * Gives creators and hackathon judges three frictionless ways to populate an audit:
 *   1. Pick original photos directly from the Android Gallery / Mac Finder (`<= 20MB`,
 *      photos in MVP, clear V1 message on videos) and attach optional captions/draft toggles.
 *   2. Paste any public Substack or blog post link to extract written routine/location prose.
 *   3. Load the 6-post cross-platform sample feed ("Maya Lin") in one tap for instant stage demos.
 *
 * Primary Use Cases:
 * 1. Uploading real phone photos + pasting a blog URL on Android or Mac.
 * 2. Editing captions or toggling `Unpublished Draft` status before clicking Scan.
 */

import {
  Camera,
  FileText,
  Globe,
  Sparkles,
  Trash2,
  Upload,
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
  readonly onToggleAttestation: (accepted: boolean) => void;
  readonly onAddPosts: (newPosts: readonly CreatorPost[]) => void;
  readonly onUpdatePostCaption: (postId: string, caption: string) => void;
  readonly onRemovePost: (postId: string) => void;
  readonly onImportArticleUrl: (url: string) => Promise<void>;
  readonly onLoadSampleFeed: () => Promise<void>;
  readonly onRunAudit: () => Promise<void>;
}

/**
 * Renders the Consent Gate, Camera Roll uploader, Blog URL importer, and staged post grid.
 *
 * @param props - State and action callbacks for staging content and launching the Gemini scan.
 * @returns Step 1 intake view element.
 */
export function ContentIntakeView(
  props: ContentIntakeViewProps,
): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [articleUrl, setArticleUrl] = useState('');
  const [manualNoteTitle, setManualNoteTitle] = useState('');
  const [manualNoteBody, setManualNoteBody] = useState('');
  const [showManualArticleBox, setShowManualArticleBox] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  /**
   * Processes files selected from the Android Gallery or Mac file picker.
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
        setLocalError(err instanceof Error ? err.message : 'Photo upload failed.');
      }
    }

    if (added.length > 0) {
      props.onAddPosts(added);
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
    setShowManualArticleBox(false);
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h1 className="unseen-serif-h1">
          See what your posts reveal together—before anyone else can.
        </h1>
        <p
          style={{
            margin: 0,
            color: 'var(--ink-secondary)',
            fontSize: '0.98rem',
            maxWidth: '720px',
            lineHeight: 1.5,
          }}
        >
          Upload original photos from your camera roll and add a blog or
          Substack link. Gemini connects subtle visual, caption, and schedule
          clues across your content and helps you fix risks before publishing.
        </p>
      </div>

      <ConsentBannerCard
        attestation={props.attestation}
        onToggleAttestation={props.onToggleAttestation}
      />

      {localError && (
        <div
          role="alert"
          className="unseen-card"
          style={{
            background: 'var(--status-high-bg)',
            borderColor: '#f3b8b3',
            color: 'var(--status-high-ink)',
            padding: '14px 18px',
            fontWeight: 600,
            fontSize: '0.88rem',
          }}
        >
          {localError}
        </div>
      )}

      <div className="unseen-intake-grid">
        {/* Card 1: Original Camera Roll Upload */}
        <div className="unseen-card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '8px' }}>
            <Camera size={20} color="var(--accent-forest)" />
            <h2 className="unseen-serif-h2" style={{ fontSize: '1.15rem', margin: 0 }}>
              1. Camera Roll Photos
            </h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)', margin: '0 0 14px' }}>
            Select original photos or unpublished drafts from your phone gallery
            or Mac (`JPG`, `PNG`, `WebP` up to 20MB · video scanning coming in V1).
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            onChange={handleFilesSelected}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="unseen-btn unseen-btn-secondary"
            style={{ width: '100%' }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={17} />
            Choose Photos from Camera Roll
          </button>
        </div>

        {/* Card 2: Blog / Substack Article URL */}
        <div className="unseen-card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '8px' }}>
            <Globe size={20} color="var(--accent-coral)" />
            <h2 className="unseen-serif-h2" style={{ fontSize: '1.15rem', margin: 0 }}>
              2. Blog or Substack Link
            </h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)', margin: '0 0 12px' }}>
            Paste a public newsletter or blog article URL so Unseen can check if
            written routines connect with your photos.
          </p>
          <form onSubmit={handleArticleSubmit} style={{ display: 'flex', gap: '8px' }}>
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
              className="unseen-btn unseen-btn-secondary"
              disabled={props.isImportingArticle || !articleUrl.trim()}
            >
              {props.isImportingArticle ? 'Reading…' : 'Add'}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setShowManualArticleBox((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 0 0',
              fontSize: '0.78rem',
              color: 'var(--ink-secondary)',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            {showManualArticleBox ? 'Hide draft text box' : 'Or paste unpublished blog draft text'}
          </button>

          {showManualArticleBox && (
            <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
              <input
                type="text"
                className="unseen-input"
                placeholder="Article title (optional)"
                value={manualNoteTitle}
                onChange={(e) => setManualNoteTitle(e.target.value)}
              />
              <textarea
                rows={3}
                className="unseen-textarea"
                placeholder="Paste newsletter or blog paragraph..."
                value={manualNoteBody}
                onChange={(e) => setManualNoteBody(e.target.value)}
              />
              <button
                type="button"
                className="unseen-btn unseen-btn-secondary unseen-btn-sm"
                onClick={handleAddPastedArticleExcerpt}
              >
                Add Written Draft
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Quick Demo Bar + Run Scan CTA */}
      <div
        className="unseen-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'var(--bg-subtle)',
        }}
      >
        <div>
          <strong style={{ fontSize: '0.94rem' }}>
            {props.posts.length === 0
              ? 'Want to try a live cross-platform creator story first?'
              : `${props.posts.length} item${props.posts.length === 1 ? '' : 's'} staged for cross-content privacy scan`}
          </strong>
          {props.persona && (
            <div style={{ fontSize: '0.8rem', color: 'var(--ink-secondary)', marginTop: '2px' }}>
              Demo Persona: <strong>{props.persona.displayName}</strong> ({props.persona.handle}) — {props.persona.bio}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="unseen-btn unseen-btn-secondary"
            onClick={props.onLoadSampleFeed}
          >
            Load Sample Creator Feed (6)
          </button>

          <button
            type="button"
            className="unseen-btn unseen-btn-primary"
            disabled={
              props.posts.length === 0 ||
              !props.attestation.attestedByCreator ||
              props.isScanning
            }
            onClick={props.onRunAudit}
          >
            <Sparkles size={17} />
            {props.isScanning
              ? 'Scanning Multimodal Patterns…'
              : `Run Gemini Privacy Audit (${props.posts.length})`}
          </button>
        </div>
      </div>

      {/* Staged Content Grid */}
      {props.posts.length > 0 && (
        <section aria-label="Staged Creator Content">
          <h2 className="unseen-serif-h2" style={{ marginBottom: '12px' }}>
            Staged Photos, Articles & Drafts ({props.posts.length})
          </h2>
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
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      <FileText size={28} />
                      <span style={{ fontSize: '0.8rem', marginTop: '6px', fontWeight: 600 }}>
                        Imported Written Article
                      </span>
                    </div>
                  )}

                  <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
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
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--ink-muted)',
                          padding: '4px',
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {post.title && (
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                        {post.title}
                      </div>
                    )}
                    <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                      {post.postedAtLabel}
                    </div>

                    <textarea
                      rows={3}
                      className="unseen-textarea"
                      style={{ fontSize: '0.82rem', marginTop: 'auto' }}
                      placeholder="Add caption, timing note, or excerpt..."
                      value={post.caption}
                      onChange={(e) =>
                        props.onUpdatePostCaption(post.id, e.target.value)
                      }
                      aria-label={`Caption or excerpt for ${post.title ?? post.id}`}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
