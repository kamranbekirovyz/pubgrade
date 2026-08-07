import axios, { AxiosInstance } from 'axios';

/** Everything one pub.dev package document tells us. */
export interface PubPackage {
  latestVersion: string;
  /** Publish date per version, e.g. `1.2.3` -> Date. */
  publishedAt: Map<string, Date>;
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
    for (const entry of data.versions ?? []) {
      if (entry?.version && entry?.published) {
        publishedAt.set(entry.version, new Date(entry.published));
      }
    }

    return { latestVersion, publishedAt };
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
