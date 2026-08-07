import * as yaml from 'js-yaml';
import { Dependency } from './types';
import { stripConstraint } from './versions';

/** Provided by the Flutter SDK, never on pub.dev. */
const SDK_PACKAGES = new Set(['flutter', 'flutter_test']);

/**
 * Reads `dependencies:` and `dev_dependencies:` out of pubspec.yaml text.
 *
 * Only plain string constraints are returned. Entries written as a map
 * (`git:`, `path:`, `sdk:`, `hosted:`) have no pub.dev version to compare
 * against, so they are skipped.
 */
export function parseDependencies(pubspecText: string): Dependency[] {
  const doc = loadYaml(pubspecText);
  if (!doc) return [];

  return [
    ...collect(doc.dependencies, false),
    ...collect(doc.dev_dependencies, true)
  ];
}

function collect(section: unknown, isDev: boolean): Dependency[] {
  if (!isRecord(section)) return [];

  const dependencies: Dependency[] = [];
  for (const [name, constraint] of Object.entries(section)) {
    if (SDK_PACKAGES.has(name)) continue;
    if (typeof constraint !== 'string') continue;

    dependencies.push({
      name,
      constraint,
      isDev,
      hasCaret: constraint.trimStart().startsWith('^')
    });
  }
  return dependencies;
}

/**
 * `dependency_overrides:` as name -> what it is pinned to.
 *
 * An override tells pub to ignore every constraint anyone has on that package,
 * so a conflict about it is not in force. Entries written as a map (`path:`,
 * `git:`) are included too, with an empty value — what matters is that the
 * package is overridden, not what it points at.
 */
export function parseOverrides(pubspecText: string): Map<string, string> {
  const overrides = new Map<string, string>();
  const doc = loadYaml(pubspecText);
  if (!isRecord(doc?.dependency_overrides)) return overrides;

  for (const [name, value] of Object.entries(doc.dependency_overrides)) {
    overrides.set(name, typeof value === 'string' ? value : '');
  }
  return overrides;
}

/** The `name:` field of pubspec.yaml, or null when it is missing or malformed. */
export function parseProjectName(pubspecText: string): string | null {
  const doc = loadYaml(pubspecText);
  return typeof doc?.name === 'string' ? doc.name : null;
}

/**
 * Reads pubspec.lock into `package name -> resolved version`.
 *
 * This is what is actually installed. For a caret constraint like `^1.2.0` the
 * lock file may say `1.4.0`, and comparing against `1.2.0` would report an
 * update the user already has.
 */
export function parseLockedVersions(lockText: string): Map<string, string> {
  const versions = new Map<string, string>();
  const doc = loadYaml(lockText);
  if (!isRecord(doc?.packages)) return versions;

  for (const [name, info] of Object.entries(doc.packages)) {
    if (isRecord(info) && typeof info.version === 'string') {
      versions.set(name, info.version);
    }
  }
  return versions;
}

/**
 * The version to compare against pub.dev.
 *
 * For a caret constraint the pubspec only states a floor: `^1.2.0` may well
 * have resolved to `1.4.0`. Using the constraint would report updates the user
 * already has, so the lock file wins whenever it has an answer. An exact pin
 * means what it says, and always uses the constraint.
 */
export function currentVersionOf(
  dependency: Dependency,
  lockedVersions: Map<string, string>
): string {
  const locked = lockedVersions.get(dependency.name);
  if (dependency.hasCaret && locked) return locked;
  return stripConstraint(dependency.constraint);
}

function loadYaml(text: string): Record<string, any> | null {
  try {
    const doc = yaml.load(text);
    return isRecord(doc) ? doc : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
