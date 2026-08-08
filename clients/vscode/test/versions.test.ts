import { describe, expect, it } from 'vitest';
import {
  formatRelativeTime,
  isInRange,
  isOutdated,
  stripConstraint,
  updateType
} from '../src/core/versions';

describe('stripConstraint', () => {
  it('drops the operators we know how to rewrite', () => {
    expect(stripConstraint('^1.2.3')).toBe('1.2.3');
    expect(stripConstraint('>=2.0.0')).toBe('2.0.0');
    expect(stripConstraint('1.2.3')).toBe('1.2.3');
    expect(stripConstraint('  ^1.2.3  ')).toBe('1.2.3');
  });

  it('leaves ranges unparseable on purpose, so we never guess at them', () => {
    expect(isOutdated(stripConstraint('>=1.0.0 <2.0.0'), '3.0.0')).toBe(false);
    expect(isOutdated(stripConstraint('any'), '3.0.0')).toBe(false);
  });
});

describe('isOutdated', () => {
  it('compares semantically, not as text', () => {
    expect(isOutdated('1.9.0', '1.10.0')).toBe(true);
    expect(isOutdated('2.0.0', '2.0.0')).toBe(false);
    expect(isOutdated('2.1.0', '2.0.0')).toBe(false);
  });

  it('treats prereleases as older than the release', () => {
    expect(isOutdated('1.0.0-beta.1', '1.0.0')).toBe(true);
    expect(isOutdated('1.0.0', '1.0.0-beta.1')).toBe(false);
  });

  it('says no when either side is not a version', () => {
    expect(isOutdated('any', '1.0.0')).toBe(false);
    expect(isOutdated('1.0.0', '')).toBe(false);
  });
});

describe('updateType', () => {
  it('names the size of the jump', () => {
    expect(updateType('1.0.0', '2.0.0')).toBe('major');
    expect(updateType('1.0.0', '1.1.0')).toBe('minor');
    expect(updateType('1.0.0', '1.0.1')).toBe('patch');
    expect(updateType('1.0.0', '1.0.0')).toBe('none');
  });

  it('reports nothing for downgrades and unparseable versions', () => {
    expect(updateType('2.0.0', '1.0.0')).toBe('none');
    expect(updateType('any', '1.0.0')).toBe('none');
  });

  it('reports the highest changed component', () => {
    expect(updateType('1.2.3', '2.0.1')).toBe('major');
    expect(updateType('1.2.3', '1.3.0')).toBe('minor');
  });
});

describe('isInRange', () => {
  it('covers what an update would actually bring in', () => {
    expect(isInRange('1.1.0', '1.0.0', '2.0.0')).toBe(true);
    expect(isInRange('2.0.0', '1.0.0', '2.0.0')).toBe(true); // inclusive at the top
    expect(isInRange('1.0.0', '1.0.0', '2.0.0')).toBe(false); // exclusive at the bottom
    expect(isInRange('2.0.1', '1.0.0', '2.0.0')).toBe(false);
  });

  it('accepts versions written loosely in changelogs', () => {
    expect(isInRange('v1.5.0', '1.0.0', '2.0.0')).toBe(true);
    expect(isInRange('nonsense', '1.0.0', '2.0.0')).toBe(false);
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2025-06-15T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it('picks the largest unit that fits', () => {
    expect(formatRelativeTime(ago(30 * SECOND), now)).toBe('just now');
    expect(formatRelativeTime(ago(5 * MINUTE), now)).toBe('5 minutes ago');
    expect(formatRelativeTime(ago(3 * HOUR), now)).toBe('3 hours ago');
    expect(formatRelativeTime(ago(3 * DAY), now)).toBe('3 days ago');
    expect(formatRelativeTime(ago(60 * DAY), now)).toBe('2 months ago');
    expect(formatRelativeTime(ago(800 * DAY), now)).toBe('2 years ago');
  });

  it('does not say "1 days ago"', () => {
    expect(formatRelativeTime(ago(1 * MINUTE), now)).toBe('1 minute ago');
    expect(formatRelativeTime(ago(1 * DAY), now)).toBe('1 day ago');
  });

  it('never reports "0 years ago" for dates just under a year', () => {
    expect(formatRelativeTime(ago(362 * DAY), now)).toBe('12 months ago');
  });
});
