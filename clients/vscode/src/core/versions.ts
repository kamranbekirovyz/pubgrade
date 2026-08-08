import * as semver from 'semver';
import { UpdateType } from './types';

/**
 * Drops leading constraint operators: `^1.2.3` -> `1.2.3`, `>=2.0.0` -> `2.0.0`.
 *
 * Ranges such as `>=1.0.0 <2.0.0` and keywords such as `any` come out as
 * something semver cannot parse. That is deliberate: we only ever offer updates
 * for constraints we know how to rewrite safely, and everything else is
 * reported as up to date rather than guessed at.
 */
export function stripConstraint(constraint: string): string {
  return constraint.trim().replace(/^[\^>=<]+/, '').trim();
}

/** Null when the string is not a plain semantic version. */
function parse(version: string): semver.SemVer | null {
  const cleaned = semver.clean(version);
  return cleaned ? semver.parse(cleaned) : null;
}

export function isOutdated(current: string, latest: string): boolean {
  const a = parse(current);
  const b = parse(latest);
  return a !== null && b !== null && semver.gt(b, a);
}

export function updateType(current: string, latest: string): UpdateType {
  const a = parse(current);
  const b = parse(latest);
  if (!a || !b || !semver.gt(b, a)) return 'none';
  if (b.major !== a.major) return 'major';
  if (b.minor !== a.minor) return 'minor';
  return 'patch';
}

/** True when `version` is newer than `from` and no newer than `to`. */
export function isInRange(version: string, from: string, to: string): boolean {
  const v = semver.coerce(version);
  const a = parse(from);
  const b = parse(to);
  if (!v || !a || !b) return false;
  return semver.gt(v, a) && semver.lte(v, b);
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** `2 days ago`. `now` is a parameter so tests do not depend on the clock. */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < MINUTE) return 'just now';
  if (seconds < HOUR) return plural(Math.floor(seconds / MINUTE), 'minute');
  if (seconds < DAY) return plural(Math.floor(seconds / HOUR), 'hour');
  if (seconds < MONTH) return plural(Math.floor(seconds / DAY), 'day');
  if (seconds < YEAR) return plural(Math.floor(seconds / MONTH), 'month');
  return plural(Math.floor(seconds / YEAR), 'year');
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}
