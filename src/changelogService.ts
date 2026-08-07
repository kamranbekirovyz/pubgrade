import { extractChangelogText, parseSections, selectRange } from './core/changelog';
import { ChangelogSection, Package } from './core/types';
import { PubDevApi } from './pub/pubDevApi';

/** Everything the changelog panel needs to render. */
export interface ChangelogRequest {
  packageName: string;
  fromVersion: string;
  toVersion: string;
  sections: ChangelogSection[];
  publishedAt: Map<string, Date>;
  /** Set when we could not match the changelog to the version range. */
  showingEverything: boolean;
}

/** A whole changelog can be hundreds of releases; nobody scrolls that far. */
const MAX_FALLBACK_SECTIONS = 20;

/**
 * Turns a package into something the changelog panel can render: fetch the
 * page, cut it into versions, keep the ones the update would bring in.
 *
 * Results are cached per package and version range, so reopening the same
 * changelog is instant while two projects pinning different versions of the
 * same package still each get their own.
 */
export class ChangelogService {
  private readonly cache = new Map<string, ChangelogRequest>();

  constructor(private readonly api: PubDevApi) {}

  async load(pkg: Package): Promise<ChangelogRequest> {
    const key = `${pkg.name}@${pkg.currentVersion}->${pkg.latestVersion}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const request = await this.build(pkg);
    this.cache.set(key, request);
    return request;
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async build(pkg: Package): Promise<ChangelogRequest> {
    const [html, remote] = await Promise.all([
      this.api.getChangelogHtml(pkg.name),
      this.api.getPackage(pkg.name)
    ]);

    const all = html ? parseSections(extractChangelogText(html)) : [];
    const inRange = selectRange(all, pkg.currentVersion, pkg.latestVersion);
    const showingEverything = inRange.length === 0 && all.length > 0;

    return {
      packageName: pkg.name,
      fromVersion: pkg.currentVersion,
      toVersion: pkg.latestVersion,
      sections: showingEverything ? all.slice(0, MAX_FALLBACK_SECTIONS) : inRange,
      publishedAt: remote?.publishedAt ?? new Map(),
      showingEverything
    };
  }
}
