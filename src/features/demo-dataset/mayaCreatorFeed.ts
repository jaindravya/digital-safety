/**
 * @file src/features/demo-dataset/mayaCreatorFeed.ts
 * @description Fictional creator persona and 6-post cross-platform dataset ("Maya Lin")
 * powering PrivacyMirror's interactive demo and automated end-to-end verification.
 *
 * Feature Overview:
 * Models a realistic Los Angeles lifestyle, wellness, and music creator ("Maya Lin")
 * who shares snippets of her life across Instagram Stories, YouTube vlogs, Substack
 * essays, and unpublished drafts. None of the posts intentionally share her address,
 * yet when analyzed together they reveal:
 *   1. A predictable Tuesday 8:00–9:30 AM neighborhood café + Pilates routine across
 *      Instagram, YouTube, and Substack (`maya-post-1`, `maya-post-2`, `maya-post-3`).
 *   2. Sensitive residential and lodging identifiers caught in aesthetic background
 *      flatlays (`maya-post-4` parcel label, `maya-post-5` hotel room sleeve).
 *   3. Real-time whereabouts and backstage access exposure in an unpublished rooftop
 *      event draft (`maya-post-6`).
 *
 * Primary Use Cases:
 * 1. One-click "Load Maya's Feed" demo flow for live presentation and judging.
 * 2. Deterministic multimodal test fixtures for Stage 1, Stage 2, and Stage 3 tests.
 * 3. Demonstrating privacy auditing exclusively on synthetic, creator-consented content
 *    rather than scraping real public profiles.
 */

import { CreatorPost } from '../../domain/privacyTypes';
import { logFunctionCall } from '../../logging/logger';

/**
 * Metadata describing the fictional demo creator persona presented in Scene 1.
 */
export interface DemoCreatorPersona {
  readonly id: string;
  readonly displayName: string;
  readonly handle: string;
  readonly bio: string;
  readonly platformsActive: readonly ('instagram' | 'youtube' | 'substack')[];
}

const MAYA_PERSONA: DemoCreatorPersona = Object.freeze({
  id: 'persona-maya-lin',
  displayName: 'Maya Lin',
  handle: '@mayalin.studio',
  bio: 'LA lifestyle vlogger, essayist & sunset DJ sharing slow mornings, creative routines, and live sets.',
  platformsActive: Object.freeze(['instagram', 'youtube', 'substack'] as const),
});

const MAYA_SAMPLE_POSTS: readonly CreatorPost[] = Object.freeze([
  Object.freeze({
    id: 'maya-post-1',
    platform: 'instagram',
    title: 'Instagram Story · Morning Matcha',
    caption:
      'Tuesday 8:15am matcha ritual by the corner window before heading next door to reform pilates',
    postedAtLabel: 'Last Tuesday · 8:16 AM',
    isDraft: false,
    mediaAssetPath: '/demo-media/maya-post-1-matcha.png',
    mediaMimeType: 'image/png',
    mediaAltDescription:
      'Iced matcha latte on a marble café table next to a sunlit window overlooking a distinctive awning and palm-lined sidewalk.',
  }),
  Object.freeze({
    id: 'maya-post-2',
    platform: 'youtube',
    title: 'YouTube Vlog Ep. 14 · Weekly Reset',
    caption:
      'Walking out of my 9am Tuesday reformer class—love that this studio is right on my morning coffee block!',
    postedAtLabel: '5 days ago · Vlog Frame 02:14',
    isDraft: false,
    mediaAssetPath: '/demo-media/maya-post-2-pilates.png',
    mediaMimeType: 'image/png',
    mediaAltDescription:
      'Wide 16:9 vlog frame showing a boutique Pilates studio entrance with terracotta archways and sidewalk trees in morning light.',
  }),
  Object.freeze({
    id: 'maya-post-3',
    platform: 'substack',
    title: 'Substack Essay · Notes from the Corner Table',
    caption:
      'Every Tuesday morning from 8 to 9am, you can find me at the exact same window seat in Silver Lake drafting this newsletter before movement class.',
    postedAtLabel: 'Published 2 weeks ago',
    isDraft: false,
    mediaAssetPath: '/demo-media/maya-post-3-substack.png',
    mediaMimeType: 'image/png',
    mediaAltDescription:
      'Overhead photo of an open linen notebook, fountain pen, and laptop on a warm wooden corner café table.',
  }),
  Object.freeze({
    id: 'maya-post-4',
    platform: 'instagram',
    title: 'Instagram Carousel · Home Studio Desk Setup',
    caption:
      'Editing marathon at the home desk today—new headphones finally arrived in the mail!',
    postedAtLabel: 'Yesterday · 3:40 PM',
    isDraft: false,
    mediaAssetPath: '/demo-media/maya-post-4-desk-mail.png',
    mediaMimeType: 'image/png',
    mediaAltDescription:
      'Creator studio desk flatlay with headphones, camera, and iced coffee, with a white parcel shipping label visible in the lower-right corner.',
  }),
  Object.freeze({
    id: 'maya-post-5',
    platform: 'instagram',
    title: 'Instagram Story · Weekend Check-In',
    caption:
      'Just checked in for the weekend creative retreat—obsessed with the morning light on the 6th floor!',
    postedAtLabel: 'Today · 11:05 AM',
    isDraft: false,
    mediaAssetPath: '/demo-media/maya-post-5-suitcase.png',
    mediaMimeType: 'image/png',
    mediaAltDescription:
      'Open cream carry-on suitcase on a hotel bed with knitwear, sunglasses, and a visible printed hotel keycard sleeve.',
  }),
  Object.freeze({
    id: 'maya-post-6',
    platform: 'draft',
    title: 'Unpublished IG Draft · Surprise Sunset Set',
    caption:
      'Playing a surprise sunset rooftop set here in DTLA right now until 8pm!! Come say hi by the booth',
    postedAtLabel: 'Unpublished Draft · Ready to post now',
    isDraft: true,
    mediaAssetPath: '/demo-media/maya-post-6-rooftop.png',
    mediaMimeType: 'image/png',
    mediaAltDescription:
      'Golden-hour rooftop POV holding a sparkling drink near DJ booth lights, with an ALL ACCESS VIP wristband visible in the lower-left foreground.',
  }),
]);

/**
 * Returns the immutable `DemoCreatorPersona` profile for Maya Lin.
 *
 * @returns Frozen `DemoCreatorPersona` metadata record.
 */
export function getMayaCreatorPersona(): DemoCreatorPersona {
  logFunctionCall('getMayaCreatorPersona', {});
  return MAYA_PERSONA;
}

/**
 * Returns a fresh copy of Maya Lin's 6 cross-platform sample posts and drafts.
 *
 * @returns Read-only list of `CreatorPost` fixtures spanning Instagram, YouTube,
 * Substack, and an unpublished Draft.
 */
export function getMayaSamplePosts(): readonly CreatorPost[] {
  logFunctionCall('getMayaSamplePosts', {
    count: MAYA_SAMPLE_POSTS.length,
  });
  return MAYA_SAMPLE_POSTS.map((post) => ({ ...post }));
}
