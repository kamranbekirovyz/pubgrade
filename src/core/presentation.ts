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

/**
 * A blocked update. Deliberately not the `error` icon, which major updates
 * already use — a conflict has to be tellable apart at a glance.
 */
export const CONFLICT_STYLE: UpdateStyle = {
  icon: 'flame',
  color: 'charts.red',
  note: 'Update is blocked'
};

/**
 * Whether to show this package as blocked.
 *
 * An overridden package never is: pub ignores every constraint on it, so the
 * conflict is real but not in force.
 */
export function isBlocked(pkg: Package): boolean {
  return pkg.conflict !== undefined && pkg.override === undefined;
}

/** What an overridden package says on its row and in its tooltip. */
export function overrideTooltip(pkg: Package): string {
  const override = pkg.override;
  if (!override) return '';

  const pinned = override.pinnedTo
    ? `dependency_overrides pins this to ${override.pinnedTo}`
    : 'dependency_overrides decides this version';
  const lines = [`${pinned}, whatever the constraint says.`];

  const blockers = override.wouldBlock?.blockers ?? [];
  if (blockers.length > 0) {
    const names = [...new Set(blockers.map(blocker => blocker.name))];
    lines.push(`Without it, ${names.join(', ')} would cap this package.`);
  }

  return lines.join('\n');
}

/** The tooltip shown on a blocked package. */
export function conflictTooltip(pkg: Package): string {
  const conflict = pkg.conflict;
  if (!conflict) return '';

  const names = [...new Set(conflict.blockers.map(blocker => blocker.name))];
  const lines = [`${pkg.latestVersion} is blocked by ${names.join(', ')}`];

  if (conflict.groupUpdate.length > 0) {
    lines.push(`Update ${names.join(', ')} at the same time to unblock it.`);
  } else if (conflict.safeVersion) {
    lines.push(`Suggested version: ${conflict.safeVersion}`);
  } else {
    lines.push('No newer version can be installed yet.');
  }

  return lines.join('\n');
}

/** The tooltip shown on an outdated package. */
export function updateTooltip(pkg: Package): string {
  const { note } = UPDATE_STYLES[pkg.updateType];
  const kind = pkg.updateType.charAt(0).toUpperCase() + pkg.updateType.slice(1);
  return note
    ? `${kind} update available: ${pkg.latestVersion} (${note})`
    : `Update available: ${pkg.latestVersion}`;
}

/**
 * Blocked first, then outdated, then alphabetical. The rows that need a
 * decision are the ones on top.
 */
export function byOutdatedThenName(a: Package, b: Package): number {
  return (
    Number(isBlocked(b)) - Number(isBlocked(a)) ||
    Number(b.isOutdated) - Number(a.isOutdated) ||
    a.name.localeCompare(b.name)
  );
}

/** Same idea one level up: the project with the most work to do goes first. */
export function byOutdatedCountThenName(a: Project, b: Project): number {
  return (
    countConflicts(b) - countConflicts(a) ||
    countOutdated(b) - countOutdated(a) ||
    a.name.localeCompare(b.name)
  );
}

export function countOutdated(project: Project): number {
  return project.packages.filter(pkg => pkg.isOutdated).length;
}

export function countConflicts(project: Project): number {
  return project.packages.filter(isBlocked).length;
}

/** What a project row says on the right: `1 conflict · 3 outdated`. */
export function projectSummary(project: Project): string {
  const conflicts = countConflicts(project);
  const outdated = countOutdated(project);

  const parts: string[] = [];
  if (conflicts > 0) parts.push(`${conflicts} conflict${conflicts === 1 ? '' : 's'}`);
  if (outdated > 0) parts.push(`${outdated} outdated`);

  return parts.join(' · ') || 'all up to date';
}
