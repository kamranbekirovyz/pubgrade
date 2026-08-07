import { describe, expect, it } from 'vitest';
import {
  parseDependencies,
  parseLockedVersions,
  parseProjectName
} from '../src/core/pubspec';

const PUBSPEC = `
name: my_app
version: 1.0.0+1

environment:
  sdk: ">=3.0.0 <4.0.0"

dependencies:
  flutter:
    sdk: flutter
  http: ^1.2.0
  provider: 6.0.5
  my_fork:
    git:
      url: https://github.com/me/my_fork.git
  local_pkg:
    path: ../local_pkg

dev_dependencies:
  flutter_test:
    sdk: flutter
  build_runner: ^2.4.0
`;

describe('parseDependencies', () => {
  const deps = parseDependencies(PUBSPEC);
  const byName = new Map(deps.map(d => [d.name, d]));

  it('reads both dependency sections', () => {
    expect([...byName.keys()].sort()).toEqual(['build_runner', 'http', 'provider']);
    expect(byName.get('build_runner')!.isDev).toBe(true);
    expect(byName.get('http')!.isDev).toBe(false);
  });

  it('skips SDK packages, which are not on pub.dev', () => {
    expect(byName.has('flutter')).toBe(false);
    expect(byName.has('flutter_test')).toBe(false);
  });

  it('skips git and path dependencies, which have no pub.dev version', () => {
    expect(byName.has('my_fork')).toBe(false);
    expect(byName.has('local_pkg')).toBe(false);
  });

  it('records whether the constraint is a caret', () => {
    expect(byName.get('http')).toMatchObject({ constraint: '^1.2.0', hasCaret: true });
    expect(byName.get('provider')).toMatchObject({ constraint: '6.0.5', hasCaret: false });
  });

  it('returns nothing rather than throwing on broken input', () => {
    expect(parseDependencies('this: is: not: yaml:')).toEqual([]);
    expect(parseDependencies('')).toEqual([]);
    expect(parseDependencies('name: only')).toEqual([]);
  });
});

describe('parseProjectName', () => {
  it('reads the name field', () => {
    expect(parseProjectName(PUBSPEC)).toBe('my_app');
  });

  it('returns null when there is nothing usable', () => {
    expect(parseProjectName('dependencies:\n  http: ^1.0.0')).toBeNull();
    expect(parseProjectName('name:\n  - not a string')).toBeNull();
    expect(parseProjectName('%%% broken')).toBeNull();
  });
});

describe('parseLockedVersions', () => {
  const LOCK = `
packages:
  http:
    dependency: "direct main"
    source: hosted
    version: "1.4.0"
  meta:
    dependency: transitive
    source: hosted
    version: "1.15.0"
  broken:
    dependency: transitive
sdks:
  dart: ">=3.0.0"
`;

  it('maps every package to its resolved version', () => {
    const versions = parseLockedVersions(LOCK);
    expect(versions.get('http')).toBe('1.4.0');
    expect(versions.get('meta')).toBe('1.15.0');
  });

  it('ignores entries without a version', () => {
    expect(parseLockedVersions(LOCK).has('broken')).toBe(false);
  });

  it('returns an empty map for missing or broken lock files', () => {
    expect(parseLockedVersions('').size).toBe(0);
    expect(parseLockedVersions('sdks:\n  dart: "3.0.0"').size).toBe(0);
    expect(parseLockedVersions('%%% broken').size).toBe(0);
  });
});
