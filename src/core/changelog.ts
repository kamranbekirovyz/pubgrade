import { ChangelogSection } from './types';
import { isInRange } from './versions';

/**
 * Turning a pub.dev changelog page into version sections, in three steps:
 *
 *   htmlToText  -> the changelog body as plain markdown-ish text
 *   parseSections -> one entry per `## 1.2.3` heading
 *   selectRange -> only the versions between what you have and what you want
 */

/**
 * Matches the version headings authors actually write:
 *   `## 1.2.3`   `# v1.2.3`   `## [1.2.3]`   `## 1.2.3 - Title`   `v1.2.3`
 *
 * Outside a `#` heading a leading `v` is required, otherwise ordinary prose
 * starting with a number would be read as a new version.
 * `[^\]\s]*` keeps prerelease and build suffixes (`1.2.3-beta.1`).
 */
const VERSION_HEADING = /^(?:#+\s*\[?v?|v)(\d+\.\d+\.\d+[^\]\s]*)\]?/;

/**
 * Pulls the changelog body out of a pub.dev HTML page.
 *
 * pub.dev's markup changes now and then, so we try the specific containers
 * first and widen the net on each failure. Empty string means no luck.
 */
export function extractChangelogText(html: string): string {
  const candidates = [
    /<div[^>]*class="[^"]*detail-tabs-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/section>/i,
    /<div[^>]*class="[^"]*markdown[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i
  ];

  for (const pattern of candidates) {
    const match = html.match(pattern);
    if (match) {
      const text = htmlToText(match[1]);
      if (text.length >= 20) return text;
    }
  }
  return '';
}

/** Enough HTML-to-text to keep headings and bullets readable. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<h1[^>]*>/gi, '\n# ')
    .replace(/<h2[^>]*>/gi, '\n## ')
    .replace(/<h3[^>]*>/gi, '\n### ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|ul|ol)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&') // last, so `&amp;lt;` does not become `<`
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Splits changelog text at version headings, keeping the file's own order. */
export function parseSections(text: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  let current: { version: string; lines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const body = current.lines.join('\n').trim();
    if (body) sections.push({ version: current.version, body });
  };

  for (const line of text.split('\n')) {
    const heading = line.match(VERSION_HEADING);
    if (heading) {
      flush();
      current = { version: heading[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();

  return sections;
}

/**
 * Keeps the versions a user would gain by updating: newer than `from`, no
 * newer than `to`. An empty result means we could not line the changelog up
 * with the versions we know about — the caller decides what to show instead.
 */
export function selectRange(
  sections: ChangelogSection[],
  from: string,
  to: string
): ChangelogSection[] {
  return sections.filter(section => isInRange(section.version, from, to));
}
