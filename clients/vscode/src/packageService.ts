import * as path from 'path';
import { CONCURRENT_REQUESTS, mapWithLimit } from './core/async';
import {
  currentVersionOf,
  parseDependencies,
  parseLockedVersions,
  parseProjectName
} from './core/pubspec';
import { setDependencyVersion } from './core/pubspecEditor';
import { Dependency, Package, Project } from './core/types';
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

  constructor(private readonly api: PubDevApi) {}

  get all(): readonly Project[] {
    return this.projects;
  }

  get outdatedCount(): number {
    return this.projects.reduce(
      (sum, project) => sum + project.packages.filter(pkg => pkg.isOutdated).length,
      0
    );
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
    for (const source of sources) {
      const packages = await mapWithLimit(
        source.dependencies,
        CONCURRENT_REQUESTS,
        dependency => this.resolve(dependency, source.lockedVersions),
        () => progress.report(++checked, total)
      );

      const resolved = packages.filter((pkg): pkg is Package => pkg !== null);
      if (resolved.length > 0) {
        projects.push({ name: source.name, pubspecPath: source.pubspecPath, packages: resolved });
      }
    }

    this.projects = projects;
  }

  /**
   * Writes the new version into pubspec.yaml, refreshes the in-memory package
   * and runs `flutter pub get`. Returns false when nothing was written.
   */
  update(pubspecPath: string, packageName: string, version: string): boolean {
    const content = readTextFile(pubspecPath);
    if (content === null) return false;

    const updated = setDependencyVersion(content, packageName, version);
    if (updated === null) return false;

    writeTextFile(pubspecPath, updated);
    this.applyVersion(pubspecPath, packageName, version);
    runPubGet(pubspecPath);
    return true;
  }

  private async resolve(
    dependency: Dependency,
    lockedVersions: Map<string, string>
  ): Promise<Package | null> {
    const remote = await this.api.getPackage(dependency.name);
    if (!remote) return null;

    const currentVersion = currentVersionOf(dependency, lockedVersions);

    return {
      name: dependency.name,
      currentVersion,
      latestVersion: remote.latestVersion,
      isOutdated: isOutdated(currentVersion, remote.latestVersion),
      updateType: updateType(currentVersion, remote.latestVersion)
    };
  }

  private applyVersion(pubspecPath: string, packageName: string, version: string): void {
    const project = this.projects.find(p => p.pubspecPath === pubspecPath);
    const pkg = project?.packages.find(p => p.name === packageName);
    if (!pkg) return;

    pkg.currentVersion = version;
    pkg.isOutdated = isOutdated(version, pkg.latestVersion);
    pkg.updateType = updateType(version, pkg.latestVersion);
  }
}

interface ProjectSource {
  name: string;
  pubspecPath: string;
  dependencies: Dependency[];
  lockedVersions: Map<string, string>;
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
    lockedVersions: lockText ? parseLockedVersions(lockText) : new Map()
  };
}
