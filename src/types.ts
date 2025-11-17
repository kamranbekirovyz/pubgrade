export type UpdateType = 'major' | 'minor' | 'patch' | 'none';

export interface PackageInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  isOutdated: boolean;
  updateType: UpdateType;
  changelog?: string;
  pubspecPath: string;
  projectName: string;
}

export interface ProjectGroup {
  projectName: string;
  pubspecPath: string;
  packages: PackageInfo[];
  outdatedCount: number;
}

export interface PubspecDependency {
  name: string;
  version: string;
  isDev: boolean;
}

