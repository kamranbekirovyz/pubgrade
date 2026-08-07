/**
 * Domain model. Plain data only — no behaviour, no VS Code, no I/O.
 */

/** How big the jump from the installed version to the latest one is. */
export type UpdateType = 'major' | 'minor' | 'patch' | 'none';

/** A single entry under `dependencies:` or `dev_dependencies:` in pubspec.yaml. */
export interface Dependency {
  name: string;
  /** The constraint exactly as written, e.g. `^1.2.3` or `1.2.3`. */
  constraint: string;
  isDev: boolean;
  /** True when the constraint starts with `^`. Decides how we write updates back. */
  hasCaret: boolean;
}

/** A dependency after we have asked pub.dev what the latest version is. */
export interface Package {
  name: string;
  /** The version actually in use: from pubspec.lock when available, else the constraint. */
  currentVersion: string;
  latestVersion: string;
  isOutdated: boolean;
  updateType: UpdateType;
}

/** One pubspec.yaml and everything it depends on. A monorepo has several. */
export interface Project {
  name: string;
  pubspecPath: string;
  packages: Package[];
}

/** One `## 1.2.3` block of a changelog. */
export interface ChangelogSection {
  version: string;
  /** Plain-text body of the section, without the version heading. */
  body: string;
}
