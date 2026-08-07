import { describe, expect, it } from 'vitest';
import {
  extractChangelogText,
  htmlToText,
  parseSections,
  selectRange
} from '../src/core/changelog';

describe('htmlToText', () => {
  it('keeps headings and bullets readable', () => {
    const text = htmlToText('<h2>1.2.0</h2><ul><li>Added a thing</li><li>Fixed a thing</li></ul>');
    expect(text).toContain('## 1.2.0');
    expect(text).toContain('- Added a thing');
    expect(text).toContain('- Fixed a thing');
  });

  it('drops scripts, styles and leftover tags', () => {
    const text = htmlToText('<script>alert(1)</script><style>p{}</style><p><b>hi</b></p>');
    expect(text).toBe('hi');
  });

  it('decodes entities without double-decoding', () => {
    expect(htmlToText('<p>a &amp;lt; b</p>')).toBe('a &lt; b');
    expect(htmlToText('<p>1 &lt; 2 &amp;&amp; 3 &gt; 2</p>')).toBe('1 < 2 && 3 > 2');
  });
});

describe('extractChangelogText', () => {
  it('prefers the pub.dev changelog container', () => {
    const html = `
      <main>
        <section>
          <div class="detail-tabs-content">
            <h2>2.0.0</h2><ul><li>A much longer entry so it passes the length check</li></ul>
          </div>
        </section>
      </main>`;
    expect(extractChangelogText(html)).toContain('## 2.0.0');
  });

  it('falls back to <main> when the container markup changes', () => {
    const html = '<main><h2>1.0.0</h2><p>First release of this rather nice package.</p></main>';
    expect(extractChangelogText(html)).toContain('## 1.0.0');
  });

  it('returns empty string when nothing looks like a changelog', () => {
    expect(extractChangelogText('<html><body>nope</body></html>')).toBe('');
  });
});

describe('parseSections', () => {
  it('splits on the heading styles authors actually use', () => {
    const text = [
      '## 3.0.0',
      '- breaking change',
      '# v2.1.0',
      '- a feature',
      '## [2.0.0]',
      '- older',
      'v1.9.0',
      '- oldest'
    ].join('\n');

    expect(parseSections(text).map(s => s.version)).toEqual([
      '3.0.0',
      '2.1.0',
      '2.0.0',
      '1.9.0'
    ]);
  });

  it('keeps a title after the version out of the version itself', () => {
    expect(parseSections('## 2.0.0 - Monorepo Support\n- stuff')[0]).toEqual({
      version: '2.0.0',
      body: '- stuff'
    });
  });

  it('keeps prerelease suffixes', () => {
    expect(parseSections('## 1.0.0-beta.2\n- wip')[0].version).toBe('1.0.0-beta.2');
  });

  it('does not mistake prose starting with a number for a version', () => {
    const sections = parseSections('## 1.1.0\n- fix\n2.0.0 is coming soon\n- more');
    expect(sections.map(s => s.version)).toEqual(['1.1.0']);
    expect(sections[0].body).toContain('2.0.0 is coming soon');
  });

  it('drops headings with no body and ignores text before the first heading', () => {
    const sections = parseSections('preamble\n\n## 1.0.0\n\n## 0.9.0\n- real content');
    expect(sections.map(s => s.version)).toEqual(['0.9.0']);
  });

  it('returns nothing for text with no versions', () => {
    expect(parseSections('just some prose')).toEqual([]);
  });
});

describe('selectRange', () => {
  const sections = ['3.0.0', '2.1.0', '2.0.0', '1.0.0'].map(version => ({
    version,
    body: `notes for ${version}`
  }));

  it('keeps what an update would bring in and nothing else', () => {
    expect(selectRange(sections, '2.0.0', '3.0.0').map(s => s.version)).toEqual([
      '3.0.0',
      '2.1.0'
    ]);
  });

  it('excludes the version you already have', () => {
    expect(selectRange(sections, '2.1.0', '3.0.0').map(s => s.version)).toEqual(['3.0.0']);
  });

  it('finds nothing when the versions do not line up', () => {
    expect(selectRange(sections, '9.0.0', '9.1.0')).toEqual([]);
    expect(selectRange(sections, 'any', '3.0.0')).toEqual([]);
  });

  it('is not fooled by changelogs listed oldest first', () => {
    const ascending = [...sections].reverse();
    expect(selectRange(ascending, '2.0.0', '3.0.0').map(s => s.version)).toEqual([
      '2.1.0',
      '3.0.0'
    ]);
  });
});
