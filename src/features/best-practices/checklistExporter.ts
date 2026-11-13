/**
 * @file src/features/best-practices/checklistExporter.ts
 * @description Formatter and local browser/PWA downloader for personalized digital
 * safety Best Practices checklists.
 *
 * Feature Overview:
 * Because Unseen is account-less and zero-storage, creators can tick off safety
 * habits during their ephemeral session and download a clean, readable Markdown/text
 * safety guide directly to their Android phone or Mac—leaving zero personal records
 * stored on the server.
 *
 * Primary Use Cases:
 * 1. Generating formatted checklist content (`formatBestPracticesChecklist`).
 * 2. Triggering a one-tap local file download (`downloadChecklistFile`) in the UI.
 */

import { BestPracticeRecommendation } from '../../domain/privacyTypes';
import { logFunctionCall } from '../../logging/logger';

/**
 * Formats personalized and general `BestPracticeRecommendation` items into a clean,
 * human-readable checklist document reflecting which items the creator checked off.
 *
 * @param items - Personalized + general best-practice recommendations.
 * @param checkedIds - Set of recommendation IDs ticked off in-session.
 * @param exposureScore - Optional current `0–100` detected exposure score.
 * @returns Formatted checklist text ready for local file download.
 */
export function formatBestPracticesChecklist(
  items: readonly BestPracticeRecommendation[],
  checkedIds: ReadonlySet<string>,
  exposureScore?: number,
): string {
  logFunctionCall('formatBestPracticesChecklist', {
    itemCount: items.length,
    checkedCount: checkedIds.size,
    exposureScore: exposureScore ?? null,
  });

  const personalized = items.filter((i) => i.kind === 'personalized');
  const general = items.filter((i) => i.kind === 'general');

  const lines: string[] = [
    '# Unseen — Creator Digital Safety Checklist',
    `Generated locally on ${new Date().toLocaleDateString()} · Zero data stored on server`,
    exposureScore !== undefined
      ? `Current Detected Exposure Index: ${exposureScore}/100`
      : '',
    '',
  ].filter((line, idx) => idx !== 2 || line.length > 0);

  if (personalized.length > 0) {
    lines.push('## Personalized Actions From Your Scan');
    for (const item of personalized) {
      const mark = checkedIds.has(item.id) ? '[x]' : '[ ]';
      lines.push(`- ${mark} ${item.title}`);
      lines.push(`      ${item.description}`);
    }
    lines.push('');
  }

  if (general.length > 0) {
    lines.push('## Everyday Creator Safety Habits');
    for (const item of general) {
      const mark = checkedIds.has(item.id) ? '[x]' : '[ ]';
      lines.push(`- ${mark} ${item.title}`);
      lines.push(`      ${item.description}`);
    }
    lines.push('');
  }

  lines.push(
    '---',
    'Note: Unseen helps reduce unintended disclosures before publishing, but automated review cannot guarantee complete anonymity.',
  );

  return lines.join('\n');
}

/**
 * Triggers an immediate client-side file download of the formatted safety checklist.
 *
 * @param content - Formatted checklist string from `formatBestPracticesChecklist`.
 * @param filename - Suggested local filename (defaults to `'unseen-safety-checklist.md'`).
 */
export function triggerTextFileDownload(
  content: string,
  filename = 'unseen-safety-checklist.md',
): void {
  logFunctionCall('triggerTextFileDownload', {
    filename,
    charLength: content.length,
  });

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}
