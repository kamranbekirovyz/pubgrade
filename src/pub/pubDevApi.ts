import axios, { AxiosInstance } from 'axios';
import { VersionRequirements } from '../core/conflicts';

/** Everything one pub.dev package document tells us. */
export interface PubPackage {
  latestVersion: string;
  /** Publish date per version, e.g. `1.2.3` -> Date. */
  publishedAt: Map<string, Date>;
  /** What each published version depends on. Used to detect conflicts. */
  versions: VersionRequirements[];
}

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Reads pub.dev. One instance per extension activation.
 *
 * Each package document is fetched at most once and then cached, because the
 * package list, the "outdated" check and the changelog dates all want the same
 * document. Call `clearCache()` on refresh.
 */
export class PubDevApi {
  private readonly packages = new Map<string, Promise<PubPackage | null>>();
  private readonly changelogs = new Map<string, Promise<string | null>>();

  constructor(
    private readonly http: AxiosInstance = axios.create({
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'User-Agent': 'pubgrade-vscode' }
    })
  ) {}

  /** Null when the package is unknown or pub.dev is unreachable. */
  getPackage(name: string): Promise<PubPackage | null> {
    return this.remember(this.packages, name, () => this.fetchPackage(name));
  }

  /** Raw HTML of the changelog page. Null when it cannot be fetched. */
  getChangelogHtml(name: string): Promise<string | null> {
    return this.remember(this.changelogs, name, async () => {
      const url = `https://pub.dev/packages/${encodeURIComponent(name)}/changelog`;
      return this.get<string>(url);
    });
  }

  clearCache(): void {
    this.packages.clear();
    this.changelogs.clear();
  }

  private async fetchPackage(name: string): Promise<PubPackage | null> {
    const url = `https://pub.dev/api/packages/${encodeURIComponent(name)}`;
    const data = await this.get<any>(url);

    const latestVersion = data?.latest?.version;
    if (typeof latestVersion !== 'string') return null;

    const publishedAt = new Map<string, Date>();
    const versions: VersionRequirements[] = [];

    for (const entry of data.versions ?? []) {
      if (typeof entry?.version !== 'string') continue;

      if (entry.published) publishedAt.set(entry.version, new Date(entry.published));
      versions.push({ version: entry.version, requires: readRequires(entry.pubspec) });
    }

    return { latestVersion, publishedAt, versions };
  }

  private async get<T>(url: string): Promise<T | null> {
    try {
      const response = await this.http.get<T>(url);
      return response.data;
    } catch (error) {
      console.error(`[Pubgrade] GET ${url} failed:`, error);
      return null;
    }
  }

  /** Caches the promise, not the value, so concurrent callers share one request. */
  private remember<T>(
    cache: Map<string, Promise<T>>,
    key: string,
    load: () => Promise<T>
  ): Promise<T> {
    const cached = cache.get(key);
    if (cached) return cached;

    const pending = load();
    cache.set(key, pending);
    return pending;
  }
}

/**
 * The `dependencies:` of one published version, as name -> range.
 *
 * Entries written as a map (`sdk: flutter`, `git:`, `path:`) have no range to
 * compare, so they are left out. Only the strings survive, which keeps a large
 * package document from staying in memory once we are done with it.
 */
function readRequires(pubspec: any): Map<string, string> {
  const requires = new Map<string, string>();
  const dependencies = pubspec?.dependencies;
  if (typeof dependencies !== 'object' || dependencies === null) return requires;

  for (const [name, range] of Object.entries(dependencies)) {
    if (typeof range === 'string') requires.set(name, range);
  }
  return requires;
}
