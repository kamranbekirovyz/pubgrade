import * as path from 'path';
import { CONCURRENT_REQUESTS, mapWithLimit } from './core/async';
import { Candidate, findConflicts } from './core/conflicts';
import {
  currentVersionOf,
  parseDependencies,
  parseLockedVersions,
  parseOverrides,
  parseProjectName
} from './core/pubspec';
import { countConflicts } from './core/presentation';
import { setDependencyVersion } from './core/pubspecEditor';
import { Dependency, Package, PackageUpdate, Project } from './core/types';
import { isOutdated, updateType } from './core/versions';
import { PubDevApi } from './pub/pubDevApi';
import { findPubspecs, readLockFile, readTextFile, runPubGet, writeTextFile } from './workspace';

export interface Progress {
  report(checked: number, total: number): void;
}

/**
 * Owns the package list: builds it from the workspace, keeps it in sync when a
 * package is updated. The only stateful part of the extension.
 */
export class PackageService {
  private projects: Project[] = [];
  /** Per pubspec.yaml, the pub.dev data conflict checking needs. */
  private readonly candidates = new Map<string, Candidate[]>();
  /** Per pubspec.yaml, its `dependency_overrides:` entries. */
  private readonly overrides = new Map<string, Map<string, string>>();

  constructor(private readonly api: PubDevApi) {}

  get all(): readonly Project[] {
    return this.projects;
  }

  /** One package by name, within the project that owns `pubspecPath`. */
  find(pubspecPath: string, packageName: string): Package | undefined {
    return this.projects
      .find(project => project.pubspecPath === pubspecPath)
      ?.packages.find(pkg => pkg.name === packageName);
  }

  get outdatedCount(): number {
    return this.projects.reduce(
      (sum, project) => sum + project.packages.filter(pkg => pkg.isOutdated).length,
      0
    );
  }

  get conflictCount(): number {
    return this.projects.reduce((sum, project) => sum + countConflicts(project), 0);
  }

  /** Rescans every pubspec.yaml and re-checks every dependency against pub.dev. */
  async refresh(progress: Progress): Promise<void> {
    this.api.clearCache();

    const sources = (await findPubspecs())
      .map(readProject)
      .filter((source): source is ProjectSource => source !== null);

    const total = sources.reduce((sum, source) => sum + source.dependencies.length, 0);
    let checked = 0;
    progress.report(checked, total);

    const projects: Project[] = [];
    this.candidates.clear();

    for (const source of sources) {
      const results = await mapWithLimit(
        source.dependencies,
        CONCURRENT_REQUESTS,
        dependency => this.resolve(dependency, source.lockedVersions),
        () => progress.report(++checked, total)
      );

      const resolved = results.filter((entry): entry is Resolved => entry !== null);
      if (resolved.length === 0) continue;

      const packages = resolved.map(entry => entry.package);
      this.candidates.set(source.pubspecPath, resolved.map(entry => entry.candidate));
      this.overrides.set(source.pubspecPath, source.overrides);
      this.markConflicts(source.pubspecPath, packages);

      projects.push({ name: source.name, pubspecPath: source.pubspecPath, packages });
    }

    this.projects = projects;
  }

  /**
   * Writes new versions into pubspec.yaml and runs `flutter pub get` once.
   *
   * Several packages at a time is the normal case for a blocked update: two
   * packages that hold each other back only resolve if they move together, so
   * writing them one by one would leave the file unresolvable in between.
   *
   * Nothing is written unless every package can be rewritten.
   */
  update(pubspecPath: string, updates: PackageUpdate[]): boolean {
    const content = readTextFile(pubspecPath);
    if (content === null || updates.length === 0) return false;

    let edited = content;
    for (const { name, version } of updates) {
      const next = setDependencyVersion(edited, name, version);
      if (next === null) return false;
      edited = next;
    }

    writeTextFile(pubspecPath, edited);
    for (const { name, version } of updates) {
      this.applyVersion(pubspecPath, name, version);
    }
    runPubGet(pubspecPath);
    return true;
  }

  private async resolve(
    dependency: Dependency,
    lockedVersions: Map<string, string>
  ): Promise<Resolved | null> {
    const remote = await this.api.getPackage(dependency.name);
    if (!remote) return null;

    const currentVersion = currentVersionOf(dependency, lockedVersions);

    return {
      package: {
        name: dependency.name,
        currentVersion,
        latestVersion: remote.latestVersion,
        isOutdated: isOutdated(currentVersion, remote.latestVersion),
        updateType: updateType(currentVersion, remote.latestVersion)
      },
      candidate: {
        name: dependency.name,
        currentVersion,
        latestVersion: remote.latestVersion,
        // What pub may pick without anyone editing pubspec.yaml.
        allowed: dependency.constraint,
        versions: remote.versions
      }
    };
  }

  private applyVersion(pubspecPath: string, packageName: string, version: string): void {
    const project = this.projects.find(p => p.pubspecPath === pubspecPath);
    const pkg = project?.packages.find(p => p.name === packageName);
    if (!project || !pkg) return;

    pkg.currentVersion = version;
    pkg.isOutdated = isOutdated(version, pkg.latestVersion);
    pkg.updateType = updateType(version, pkg.latestVersion);

    const candidate = this.candidates.get(pubspecPath)?.find(c => c.name === packageName);
    if (candidate) {
      candidate.currentVersion = version;
      // The write kept the caret if there was one, so the allowed range moves with it.
      candidate.allowed = candidate.allowed.trimStart().startsWith('^') ? `^${version}` : version;
    }

    // Moving one package changes what the others can take, so the whole
    // project is re-checked. It is arithmetic on cached data, not a fetch.
    this.markConflicts(pubspecPath, project.packages);
  }

  /**
   * Recomputes what is blocked. Overridden packages are never blocked, but we
   * work out what *would* block them so the panel can explain the override.
   */
  private markConflicts(pubspecPath: string, packages: Package[]): void {
    const candidates = this.candidates.get(pubspecPath) ?? [];
    const overrides = this.overrides.get(pubspecPath) ?? new Map();
    const conflicts = findConflicts(candidates, overrides);
    const withoutOverrides = overrides.size > 0 ? findConflicts(candidates) : conflicts;

    for (const pkg of packages) {
      const pinnedTo = overrides.get(pkg.name);

      pkg.conflict = conflicts.get(pkg.name);
      pkg.override =
        pinnedTo === undefined
          ? undefined
          : { pinnedTo, wouldBlock: withoutOverrides.get(pkg.name) };
    }
  }
}

/** A dependency and the pub.dev data behind it, kept together during a refresh. */
interface Resolved {
  package: Package;
  candidate: Candidate;
}

interface ProjectSource {
  name: string;
  pubspecPath: string;
  dependencies: Dependency[];
  lockedVersions: Map<string, string>;
  overrides: Map<string, string>;
}

function readProject(pubspecPath: string): ProjectSource | null {
  const content = readTextFile(pubspecPath);
  if (content === null) return null;

  const dependencies = parseDependencies(content);
  if (dependencies.length === 0) return null;

  const lockText = dependencies.some(d => d.hasCaret) ? readLockFile(pubspecPath) : null;

  return {
    name: parseProjectName(content) ?? path.basename(path.dirname(pubspecPath)),
    pubspecPath,
    dependencies,
    lockedVersions: lockText ? parseLockedVersions(lockText) : new Map(),
    overrides: parseOverrides(content)
  };
}
