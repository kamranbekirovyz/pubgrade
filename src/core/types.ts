/**
 * Domain model. Plain data only — no behaviour, no VS Code, no I/O.
 */

import { Conflict } from './conflicts';

export type { Conflict };

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
  /** Set when the latest version cannot be installed. See `core/conflicts`. */
  conflict?: Conflict;
  /** Set when `dependency_overrides:` decides this package's version. */
  override?: Override;
}

/**
 * A `dependency_overrides:` entry. Pub installs this and ignores every
 * constraint on the package, so nothing about it is ever blocked — but the
 * constraints are still worth showing, because they are usually the reason the
 * override was added in the first place.
 */
export interface Override {
  /** The override as written: a version, or empty for `path:`/`git:` entries. */
  pinnedTo: string;
  /** What would block this package if the override were removed. */
  wouldBlock?: Conflict;
}

/** One package to move. A blocked update often has to move several at once. */
export interface PackageUpdate {
  name: string;
  version: string;
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
