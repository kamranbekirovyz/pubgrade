import { describe, expect, it, vi } from 'vitest';
import { ChangelogService } from '../src/changelogService';
import { Package } from '../src/core/types';
import { PubDevApi } from '../src/pub/pubDevApi';

const CHANGELOG_HTML = `
<main><div class="detail-tabs-content">
  <h2>3.0.0</h2><ul><li>Dropped support for old SDKs</li></ul>
  <h2>2.1.0</h2><ul><li>Added retries</li></ul>
  <h2>2.0.0</h2><ul><li>The first stable release of the rewritten client</li></ul>
</div></section></main>`;

function fakeApi(html: string | null = CHANGELOG_HTML) {
  const getChangelogHtml = vi.fn(async () => html);
  const getPackage = vi.fn(async () => ({
    latestVersion: '3.0.0',
    publishedAt: new Map([['3.0.0', new Date('2024-06-01T00:00:00Z')]])
  }));
  return { getChangelogHtml, getPackage, api: { getChangelogHtml, getPackage } as unknown as PubDevApi };
}

function pkg(currentVersion: string, latestVersion: string): Package {
  return {
    name: 'http',
    currentVersion,
    latestVersion,
    isOutdated: true,
    updateType: 'major'
  };
}

describe('ChangelogService', () => {
  it('shows only the versions the update would bring in', async () => {
    const service = new ChangelogService(fakeApi().api);
    const request = await service.load(pkg('2.0.0', '3.0.0'));

    expect(request.sections.map(s => s.version)).toEqual(['3.0.0', '2.1.0']);
    expect(request.showingEverything).toBe(false);
  });

  it('attaches publish dates so releases can be dated', async () => {
    const request = await new ChangelogService(fakeApi().api).load(pkg('2.0.0', '3.0.0'));
    expect(request.publishedAt.get('3.0.0')).toEqual(new Date('2024-06-01T00:00:00Z'));
  });

  it('falls back to the whole changelog when nothing matches the range', async () => {
    const request = await new ChangelogService(fakeApi().api).load(pkg('9.0.0', '9.1.0'));

    expect(request.showingEverything).toBe(true);
    expect(request.sections.map(s => s.version)).toEqual(['3.0.0', '2.1.0', '2.0.0']);
  });

  it('reports an empty changelog rather than failing when the page cannot be read', async () => {
    const request = await new ChangelogService(fakeApi(null).api).load(pkg('2.0.0', '3.0.0'));

    expect(request.sections).toEqual([]);
    expect(request.showingEverything).toBe(false);
  });

  it('serves a repeat view of the same range from cache', async () => {
    const fake = fakeApi();
    const service = new ChangelogService(fake.api);

    await service.load(pkg('2.0.0', '3.0.0'));
    await service.load(pkg('2.0.0', '3.0.0'));

    expect(fake.getChangelogHtml).toHaveBeenCalledTimes(1);
  });

  // Caching by package name alone showed one project's version range to
  // another project that pinned the same package differently.
  it('keys the cache by version range, not just package name', async () => {
    const service = new ChangelogService(fakeApi().api);

    const wide = await service.load(pkg('2.0.0', '3.0.0'));
    const narrow = await service.load(pkg('2.1.0', '3.0.0'));

    expect(wide.sections.map(s => s.version)).toEqual(['3.0.0', '2.1.0']);
    expect(narrow.sections.map(s => s.version)).toEqual(['3.0.0']);
  });

  it('refetches after the cache is cleared by a refresh', async () => {
    const fake = fakeApi();
    const service = new ChangelogService(fake.api);

    await service.load(pkg('2.0.0', '3.0.0'));
    service.clearCache();
    await service.load(pkg('2.0.0', '3.0.0'));

    expect(fake.getChangelogHtml).toHaveBeenCalledTimes(2);
  });
});
