import { describe, expect, it } from 'vitest';
import { setDependencyVersion } from '../src/core/pubspecEditor';

const PUBSPEC = [
  'name: my_app',
  'version: 1.0.0+1',
  '',
  'dependencies:',
  '  http: ^1.2.0',
  '  provider: 6.0.5',
  '  dio: ^5.0.0 # networking',
  '',
  'dev_dependencies:',
  '  build_runner: ^2.4.0',
  ''
].join('\n');

describe('setDependencyVersion', () => {
  it('keeps a caret constraint a caret constraint', () => {
    expect(setDependencyVersion(PUBSPEC, 'http', '1.3.0')).toContain('  http: ^1.3.0');
  });

  it('keeps an exact pin exact', () => {
    const updated = setDependencyVersion(PUBSPEC, 'provider', '6.1.0')!;
    expect(updated).toContain('  provider: 6.1.0');
    expect(updated).not.toContain('^6.1.0');
  });

  it('updates dev dependencies too', () => {
    expect(setDependencyVersion(PUBSPEC, 'build_runner', '2.5.0')).toContain(
      '  build_runner: ^2.5.0'
    );
  });

  it('leaves trailing comments alone', () => {
    expect(setDependencyVersion(PUBSPEC, 'dio', '5.4.0')).toContain('  dio: ^5.4.0 # networking');
  });

  it('changes nothing else in the file', () => {
    const updated = setDependencyVersion(PUBSPEC, 'http', '1.3.0')!;
    expect(updated.split('\n').length).toBe(PUBSPEC.split('\n').length);
    expect(updated).toContain('name: my_app');
    expect(updated).toContain('  provider: 6.0.5');
  });

  it('never touches root-level keys that share a name', () => {
    const yaml = 'version: 1.0.0\n\ndependencies:\n  version: 2.0.0\n';
    const updated = setDependencyVersion(yaml, 'version', '3.0.0')!;
    expect(updated).toBe('version: 1.0.0\n\ndependencies:\n  version: 3.0.0\n');
  });

  it('returns null when the dependency is not there', () => {
    expect(setDependencyVersion(PUBSPEC, 'missing_pkg', '1.0.0')).toBeNull();
  });

  it('returns null for dependencies with no inline version', () => {
    const yaml = 'dependencies:\n  flutter:\n    sdk: flutter\n';
    expect(setDependencyVersion(yaml, 'flutter', '1.0.0')).toBeNull();
  });

  it('treats the package name as text, not as a pattern', () => {
    const yaml = 'dependencies:\n  a.b: 1.0.0\n  axb: 2.0.0\n';
    const updated = setDependencyVersion(yaml, 'a.b', '1.1.0')!;
    expect(updated).toContain('  a.b: 1.1.0');
    expect(updated).toContain('  axb: 2.0.0');
  });
});
