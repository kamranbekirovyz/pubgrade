/**
 * Behaviour that was wrong once and got fixed. Each test here exists because
 * a user hit the bug — if one starts failing, the bug is back.
 */
import { describe, expect, it } from 'vitest';
import { CONCURRENT_REQUESTS } from '../src/core/async';
import { EXCLUDED_DIRS, EXCLUDE_GLOB, isExcluded } from '../src/core/discovery';
import {
  byOutdatedCountThenName,
  byOutdatedThenName,
  updateTooltip,
  UPDATE_STYLES
} from '../src/core/presentation';
import { ProgressTracker } from '../src/core/progress';
import { currentVersionOf } from '../src/core/pubspec';
import { Dependency, Package, Project, UpdateType } from '../src/core/types';

function pkg(name: string, overrides: Partial<Package> = {}): Package {
  return {
    name,
    currentVersion: '1.0.0',
    latestVersion: '1.0.0',
    isOutdated: false,
    updateType: 'none',
    ...overrides
  };
}

function dep(overrides: Partial<Dependency>): Dependency {
  return { name: 'http', constraint: '^1.2.0', isDev: false, hasCaret: true, ...overrides };
}

function project(name: string, packages: Package[]): Project {
  return { name, pubspecPath: `/${name}/pubspec.yaml`, packages };
}

describe('pubspec scanning skips folders that are not the user project', () => {
  // The sidebar used to fill with the Flutter SDK's own pubspecs when FVM was
  // in use, and with plugin copies under the platform folders.
  it('excludes the FVM SDK checkout', () => {
    expect(EXCLUDED_DIRS).toContain('.fvm');
    expect(isExcluded('/repo/.fvm/flutter_sdk/packages/flutter/pubspec.yaml')).toBe(true);
  });

  it('excludes generated output and platform folders', () => {
    for (const dir of ['build', '.dart_tool', '.symlinks', '.plugin_symlinks']) {
      expect(isExcluded(`/repo/${dir}/pubspec.yaml`)).toBe(true);
    }
    for (const dir of ['ios', 'android', 'web', 'macos', 'linux', 'windows']) {
      expect(isExcluded(`/repo/${dir}/pubspec.yaml`)).toBe(true);
    }
  });

  it('keeps real project pubspecs, including nested monorepo packages', () => {
    expect(isExcluded('/repo/pubspec.yaml')).toBe(false);
    expect(isExcluded('/repo/packages/core/pubspec.yaml')).toBe(false);
    expect(isExcluded('C:\\repo\\apps\\admin\\pubspec.yaml')).toBe(false);
  });

  it('is not fooled by a folder whose name merely contains an excluded one', () => {
    expect(isExcluded('/repo/website/pubspec.yaml')).toBe(false);
    expect(isExcluded('/repo/android_utils/pubspec.yaml')).toBe(false);
  });

  it('turns every excluded folder into the search glob', () => {
    for (const dir of EXCLUDED_DIRS) {
      expect(EXCLUDE_GLOB).toContain(`**/${dir}/**`);
    }
  });
});

describe('caret dependencies compare against the lock file, not the constraint', () => {
  // Before this, `^1.2.0` resolved to 1.4.0 was still reported as "1.2.0,
  // update available" even though the user already had the newest version.
  const locked = new Map([['http', '1.4.0']]);

  it('uses the resolved version for a caret constraint', () => {
    expect(currentVersionOf(dep({ constraint: '^1.2.0', hasCaret: true }), locked)).toBe('1.4.0');
  });

  it('uses the constraint for an exact pin, even when the lock file differs', () => {
    expect(currentVersionOf(dep({ constraint: '1.2.0', hasCaret: false }), locked)).toBe('1.2.0');
  });

  it('falls back to the constraint when the lock file has no entry', () => {
    expect(currentVersionOf(dep({ constraint: '^1.2.0' }), new Map())).toBe('1.2.0');
  });
});

describe('progress reporting', () => {
  // The bar used to jump around because each step reported a total instead of
  // the delta the API expects.
  it('reports deltas that add up to exactly 100', () => {
    const tracker = new ProgressTracker();
    const total = 7;
    let sum = 0;
    for (let checked = 1; checked <= total; checked++) {
      sum += tracker.step(checked, total).increment;
    }
    expect(sum).toBeCloseTo(100, 10);
  });

  it('says how many of how many, not just a percentage', () => {
    expect(new ProgressTracker().step(3, 40).message).toBe('3 of 40 packages checked');
  });

  it('completes immediately when there is nothing to check', () => {
    expect(new ProgressTracker().step(0, 0).increment).toBe(100);
  });
});

describe('packages are checked in parallel', () => {
  // Serial checking made a refresh of a large project take minutes.
  it('checks several packages at a time', () => {
    expect(CONCURRENT_REQUESTS).toBeGreaterThanOrEqual(4);
  });
});

describe('update types are told apart at a glance', () => {
  const types: UpdateType[] = ['major', 'minor', 'patch'];

  it('gives major, minor and patch their own colour', () => {
    const colors = types.map(type => UPDATE_STYLES[type].color);
    expect(new Set(colors).size).toBe(3);
    expect(UPDATE_STYLES.major.color).toBe('errorForeground');
  });

  it('explains the risk in the tooltip', () => {
    expect(updateTooltip(pkg('http', { updateType: 'major', latestVersion: '2.0.0' }))).toBe(
      'Major update available: 2.0.0 (Breaking changes possible)'
    );
    expect(updateTooltip(pkg('http', { updateType: 'patch', latestVersion: '1.0.1' }))).toContain(
      'Bug fixes'
    );
  });

  it('still says something useful when the type is unknown', () => {
    expect(updateTooltip(pkg('http', { updateType: 'none', latestVersion: '2.0.0' }))).toBe(
      'Update available: 2.0.0'
    );
  });
});

describe('the list puts work at the top', () => {
  it('sorts outdated packages first, then alphabetically', () => {
    const packages = [
      pkg('zeta'),
      pkg('beta', { isOutdated: true }),
      pkg('alpha'),
      pkg('alpha_out', { isOutdated: true })
    ];
    expect([...packages].sort(byOutdatedThenName).map(p => p.name)).toEqual([
      'alpha_out',
      'beta',
      'alpha',
      'zeta'
    ]);
  });

  it('sorts projects by how many outdated packages they have', () => {
    const projects = [
      project('clean', [pkg('a')]),
      project('messy', [pkg('a', { isOutdated: true }), pkg('b', { isOutdated: true })]),
      project('some', [pkg('a', { isOutdated: true })])
    ];
    expect([...projects].sort(byOutdatedCountThenName).map(p => p.name)).toEqual([
      'messy',
      'some',
      'clean'
    ]);
  });

  it('breaks ties on project name', () => {
    const projects = [project('b', [pkg('x')]), project('a', [pkg('x')])];
    expect([...projects].sort(byOutdatedCountThenName).map(p => p.name)).toEqual(['a', 'b']);
  });
});
