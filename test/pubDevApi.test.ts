import { describe, expect, it, vi } from 'vitest';
import { PubDevApi } from '../src/pub/pubDevApi';

/** Minimal stand-in for the axios instance PubDevApi is given. */
function fakeHttp(handler: (url: string) => any) {
  const get = vi.fn(async (url: string) => ({ data: handler(url) }));
  return { get, instance: { get } as any };
}

const PACKAGE_DOC = {
  latest: { version: '2.1.0' },
  versions: [
    { version: '2.0.0', published: '2024-01-01T00:00:00Z' },
    { version: '2.1.0', published: '2024-06-01T00:00:00Z' },
    { version: '2.2.0' } // no publish date
  ]
};

describe('PubDevApi.getPackage', () => {
  it('reads the latest version and the publish dates from one document', async () => {
    const http = fakeHttp(() => PACKAGE_DOC);
    const pkg = await new PubDevApi(http.instance).getPackage('http');

    expect(pkg?.latestVersion).toBe('2.1.0');
    expect(pkg?.publishedAt.get('2.0.0')).toEqual(new Date('2024-01-01T00:00:00Z'));
    expect(pkg?.publishedAt.has('2.2.0')).toBe(false);
  });

  it('fetches each package once, even for overlapping callers', async () => {
    const http = fakeHttp(() => PACKAGE_DOC);
    const api = new PubDevApi(http.instance);

    await Promise.all([api.getPackage('http'), api.getPackage('http')]);
    await api.getPackage('http');

    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('fetches again after the cache is cleared', async () => {
    const http = fakeHttp(() => PACKAGE_DOC);
    const api = new PubDevApi(http.instance);

    await api.getPackage('http');
    api.clearCache();
    await api.getPackage('http');

    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('returns null instead of throwing when pub.dev is unreachable', async () => {
    // The failure is logged on purpose; keep it out of the test output.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const http = {
      get: vi.fn(async () => {
        throw new Error('ENOTFOUND');
      })
    } as any;

    expect(await new PubDevApi(http).getPackage('http')).toBeNull();
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  it('returns null when the response has no latest version', async () => {
    const http = fakeHttp(() => ({ versions: [] }));
    expect(await new PubDevApi(http.instance).getPackage('http')).toBeNull();
  });

  it('escapes package names in the URL', async () => {
    const http = fakeHttp(() => PACKAGE_DOC);
    await new PubDevApi(http.instance).getPackage('a b');
    expect(http.get).toHaveBeenCalledWith('https://pub.dev/api/packages/a%20b');
  });
});
