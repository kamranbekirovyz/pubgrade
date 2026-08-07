import { Package, Project, UpdateType } from './types';

/**
 * How each update type looks and reads. Red asks for care, blue is safe.
 * The icon and colour names are the editor's built-in theme ids.
 */
export interface UpdateStyle {
  icon: string;
  color: string;
  /** What the user should expect from taking this update. */
  note: string;
}

export const UPDATE_STYLES: Record<UpdateType, UpdateStyle> = {
  major: { icon: 'error', color: 'errorForeground', note: 'Breaking changes possible' },
  minor: { icon: 'warning', color: 'editorWarning.foreground', note: 'New features' },
  patch: { icon: 'info', color: 'editorInfo.foreground', note: 'Bug fixes' },
  none: { icon: 'warning', color: 'editorWarning.foreground', note: '' }
};

/** The tooltip shown on an outdated package. */
export function updateTooltip(pkg: Package): string {
  const { note } = UPDATE_STYLES[pkg.updateType];
  const kind = pkg.updateType.charAt(0).toUpperCase() + pkg.updateType.slice(1);
  return note
    ? `${kind} update available: ${pkg.latestVersion} (${note})`
    : `Update available: ${pkg.latestVersion}`;
}

/**
 * Outdated first, then alphabetical. The reason to open the panel is on top.
 */
export function byOutdatedThenName(a: Package, b: Package): number {
  return Number(b.isOutdated) - Number(a.isOutdated) || a.name.localeCompare(b.name);
}

/** Same idea one level up: the project with the most work to do goes first. */
export function byOutdatedCountThenName(a: Project, b: Project): number {
  return countOutdated(b) - countOutdated(a) || a.name.localeCompare(b.name);
}

export function countOutdated(project: Project): number {
  return project.packages.filter(pkg => pkg.isOutdated).length;
}
