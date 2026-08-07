import { describe, expect, it } from 'vitest';
import { Candidate, Conflict, findConflicts, isBlockedVersion } from '../src/core/conflicts';
import {
  byOutdatedThenName,
  conflictTooltip,
  CONFLICT_STYLE,
  isBlocked,
  overrideTooltip,
  projectSummary,
  UPDATE_STYLES
} from '../src/core/presentation';
import { Package, Project } from '../src/core/types';

/** `at('2.5.0', { analyzer: '^6.0.0' })` — one published version and what it needs. */
function at(version: string, requires: Record<string, string> = {}) {
  return { version, requires: new Map(Object.entries(requires)) };
}

function candidate(
  name: string,
  currentVersion: string,
  latestVersion: string,
  allowed: string,
  versions: ReturnType<typeof at>[]
): Candidate {
  return { name, currentVersion, latestVersion, allowed, versions };
}

/** retrofit caps dio directly, and is pinned so it cannot move out of the way. */
const dio = candidate('dio', '5.4.0', '5.5.0', '5.4.0', [
  at('5.4.0'),
  at('5.4.3'),
  at('5.5.0')
]);
const retrofit = candidate('retrofit', '4.0.0', '4.0.0', '4.0.0', [
  at('4.0.0', { dio: '>=5.0.0 <5.5.0' })
]);

/**
 * freezed and build_runner disagree about analyzer, and the version that would
 * settle it is a major bump — outside what either caret allows, so pub cannot
 * get there on its own. This is the code-generation pile-up.
 */
const freezed = candidate('freezed', '2.4.0', '3.0.0', '^2.4.0', [
  at('2.4.0', { analyzer: '^5.0.0' }),
  at('2.4.7', { analyzer: '^5.0.0' }),
  at('3.0.0', { analyzer: '^6.0.0' })
]);
const buildRunner = candidate('build_runner', '2.4.9', '3.0.0', '^2.4.9', [
  at('2.4.9', { analyzer: '^5.0.0' }),
  at('2.5.0', { analyzer: '^5.0.0' }),
  at('3.0.0', { analyzer: '^6.0.0' })
]);

describe('a package capped by another package', () => {
  const conflicts = findConflicts([dio, retrofit]);

  it('reports the blocked package, not the one doing the blocking', () => {
    expect([...conflicts.keys()]).toEqual(['dio']);
  });

  it('names who blocks it and what they allow', () => {
    expect(conflicts.get('dio')!.blockers).toEqual([
      {
        name: 'retrofit',
        version: '4.0.0',
        over: 'dio',
        allows: '>=5.0.0 <5.5.0',
        wants: '5.5.0',
        movable: false
      }
    ]);
  });

  it('offers the highest version that fits inside the cap', () => {
    expect(conflicts.get('dio')!.safeVersion).toBe('5.4.3');
  });

  it('offers no group move when the blocker has nowhere newer to go', () => {
    expect(conflicts.get('dio')!.groupUpdate).toEqual([]);
  });
});

describe('two packages disagreeing about a third', () => {
  const conflicts = findConflicts([freezed, buildRunner]);

  it('flags both, because each one blocks the other', () => {
    expect([...conflicts.keys()].sort()).toEqual(['build_runner', 'freezed']);
  });

  it('names the shared package they disagree about', () => {
    const blocker = conflicts.get('freezed')!.blockers[0];
    expect(blocker.name).toBe('build_runner');
    expect(blocker.over).toBe('analyzer');
    expect(blocker.allows).toBe('^5.0.0');
    expect(blocker.wants).toBe('^6.0.0');
  });

  it('sees that moving both at once clears it', () => {
    expect(conflicts.get('freezed')!.blockers[0].movable).toBe(true);
    expect(conflicts.get('freezed')!.groupUpdate).toEqual([
      { name: 'freezed', from: '2.4.0', to: '3.0.0', jump: 'major' },
      { name: 'build_runner', from: '2.4.9', to: '3.0.0', jump: 'major' }
    ]);
  });

  it('still offers the safe version for anyone who wants one package moved', () => {
    expect(conflicts.get('freezed')!.safeVersion).toBe('2.4.7');
  });

  /**
   * The panel drags packages the user never opened into one write. It has to
   * show how big each jump is, or the button updates blind — which is the one
   * thing this extension exists to prevent.
   */
  it('says how big each jump in the group is', () => {
    const mixed = candidate('freezed', '2.4.0', '3.0.0', '^2.4.0', [
      at('2.4.0', { analyzer: '^5.0.0' }),
      at('3.0.0', { analyzer: '^6.0.0' })
    ]);
    // build_runner only needs a patch to agree; freezed needs a major.
    const nearby = candidate('build_runner', '2.4.9', '2.4.10', '2.4.9', [
      at('2.4.9', { analyzer: '^5.0.0' }),
      at('2.4.10', { analyzer: '^6.0.0' })
    ]);

    expect(findConflicts([mixed, nearby]).get('freezed')!.groupUpdate).toEqual([
      { name: 'freezed', from: '2.4.0', to: '3.0.0', jump: 'major' },
      { name: 'build_runner', from: '2.4.9', to: '2.4.10', jump: 'patch' }
    ]);
  });
});

/**
 * The case that made us rewrite this: a blocker whose own constraint lets pub
 * move it. `flutter pub get` does that by itself, so there is no conflict to
 * report — flagging one sends people chasing a problem that does not exist.
 */
describe('a blocker that pub can move on its own', () => {
  const analytics = candidate('firebase_analytics', '12.4.2', '12.4.6', '^12.4.2', [
    at('12.4.2', { firebase_core_platform_interface: '^7.1.0' }),
    at('12.4.6', { firebase_core_platform_interface: '^8.1.0' })
  ]);
  // Sits on 4.11.0 today, but `^4.11.0` lets pub slide it to 4.13.0.
  const core = candidate('firebase_core', '4.11.0', '4.13.0', '^4.11.0', [
    at('4.11.0', { firebase_core_platform_interface: '^7.1.0' }),
    at('4.13.0', { firebase_core_platform_interface: '^8.1.0' })
  ]);

  it('reports no conflict', () => {
    expect(findConflicts([analytics, core]).size).toBe(0);
  });

  it('but does report one when the same package is pinned exactly', () => {
    const exact = { ...core, allowed: '4.11.0' };
    expect(findConflicts([analytics, exact]).has('firebase_analytics')).toBe(true);
  });
});

/**
 * The other direction, which pub reports first in practice: freezed 3.x
 * requires freezed_annotation 3.1.0 exactly, and `^2.4.1` never reaches it.
 */
describe('an update demanding more than a peer constraint allows', () => {
  const freezedMajor = candidate('freezed', '2.4.5', '3.2.5', '^2.4.5', [
    at('2.4.5', { freezed_annotation: '^2.4.1' }),
    at('3.2.5', { freezed_annotation: '3.1.0' })
  ]);
  const annotation = candidate('freezed_annotation', '2.4.1', '3.1.0', '^2.4.1', [
    at('2.4.1'),
    at('2.4.4'),
    at('3.1.0')
  ]);
  const conflict = findConflicts([freezedMajor, annotation]).get('freezed')!;

  it('names the peer whose constraint is too tight', () => {
    expect(conflict.blockers).toEqual([
      {
        name: 'freezed_annotation',
        version: '2.4.4',
        over: 'freezed_annotation',
        allows: '^2.4.1',
        wants: '3.1.0',
        movable: true
      }
    ]);
  });

  it('offers to move both, since the peer can go there if we rewrite it', () => {
    expect(conflict.groupUpdate).toEqual([
      { name: 'freezed', from: '2.4.5', to: '3.2.5', jump: 'major' },
      { name: 'freezed_annotation', from: '2.4.1', to: '3.1.0', jump: 'major' }
    ]);
  });
});

/**
 * A `dependency_overrides:` entry tells pub to ignore every constraint on that
 * package. Reporting a conflict about it sends people chasing a rule that is
 * not in force — this really happened, on a project that resolved fine.
 */
describe('a package under dependency_overrides', () => {
  // once 1.8.0 caps package_info_plus at ^9.0.0; the override installs 10.1.0.
  const packageInfo = candidate('package_info_plus', '10.1.0', '10.2.1', '^10.1.0', [
    at('10.1.0'),
    at('10.2.1')
  ]);
  const once = candidate('once', '1.8.0', '1.8.0', '^1.8.0', [
    at('1.8.0', { package_info_plus: '^9.0.0' })
  ]);
  const overridden = new Map([['package_info_plus', '10.1.0']]);

  it('is a conflict when the override is not there', () => {
    expect(findConflicts([packageInfo, once]).has('package_info_plus')).toBe(true);
  });

  it('is not a conflict once the override is', () => {
    expect(findConflicts([packageInfo, once], overridden).size).toBe(0);
  });

  it('stops blocking other packages too, since pub ignores the constraint', () => {
    // A package whose latest needs package_info_plus 11, which nobody allows.
    const consumer = candidate('some_plugin', '1.0.0', '2.0.0', '^1.0.0', [
      at('1.0.0', { package_info_plus: '^10.0.0' }),
      at('2.0.0', { package_info_plus: '^11.0.0' })
    ]);
    expect(findConflicts([consumer, once]).has('some_plugin')).toBe(true);
    expect(findConflicts([consumer, once], overridden).has('some_plugin')).toBe(false);
  });

  /**
   * An override says which version of a package is installed. It does not
   * excuse that package from its own dependencies — those still have to hold,
   * at the pinned version.
   */
  it('still applies the overridden package own requirements, at the pinned version', () => {
    const dioUpdate = candidate('dio', '5.4.0', '5.5.0', '^5.4.0', [
      at('5.4.0'),
      at('5.5.0')
    ]);
    // Left alone, pub would take retrofit 9.0.0 and everything resolves. The
    // override holds it at 4.0.0, and that version caps dio below 5.5.0.
    const pinnedRetrofit = candidate('retrofit', '4.0.0', '9.0.0', '>=4.0.0 <10.0.0', [
      at('4.0.0', { dio: '>=5.0.0 <5.5.0' }),
      at('9.0.0', { dio: '^5.5.0' })
    ]);

    expect(findConflicts([dioUpdate, pinnedRetrofit]).has('dio')).toBe(false);
    expect(
      findConflicts([dioUpdate, pinnedRetrofit], new Map([['retrofit', '4.0.0']])).has('dio')
    ).toBe(true);
  });

  it('lets an override satisfy a demand its own constraint could never reach', () => {
    // freezed 3.x requires freezed_annotation 3.1.0, which `^2.4.1` cannot
    // resolve to — but an override outranks the requirement either way.
    const freezedMajor = candidate('freezed', '2.4.5', '3.2.5', '^2.4.5', [
      at('2.4.5', { freezed_annotation: '^2.4.1' }),
      at('3.2.5', { freezed_annotation: '3.1.0' })
    ]);
    const annotation = candidate('freezed_annotation', '2.4.4', '3.1.0', '^2.4.1', [
      at('2.4.4'),
      at('3.1.0')
    ]);

    expect(findConflicts([freezedMajor, annotation]).has('freezed')).toBe(true);
    expect(
      findConflicts([freezedMajor, annotation], new Map([['freezed_annotation', '2.4.4']])).has(
        'freezed'
      )
    ).toBe(false);
  });

  it('says nothing about a path or git override, having no version to read', () => {
    const dioUpdate = candidate('dio', '5.4.0', '5.5.0', '^5.4.0', [
      at('5.4.0'),
      at('5.5.0')
    ]);
    const forked = new Map([['retrofit', '']]);

    expect(findConflicts([dioUpdate, retrofit], forked).size).toBe(0);
  });
});

/**
 * The suggested version goes on a button that rewrites pubspec.yaml, so it has
 * to be a proof. Twice in live testing "nothing here objects to it" turned out
 * to be wrong, refused by a package four levels down. Only a version needing
 * exactly what the installed one needs is safe from that.
 */
describe('the version we suggest', () => {
  // Blocks dio 6.0.0, so there is a conflict, but allows everything below it.
  const peer = candidate('retrofit', '4.0.0', '4.0.0', '4.0.0', [
    at('4.0.0', { dio: '>=5.0.0 <6.0.0' })
  ]);

  it('is the newest one needing exactly what the installed version needs', () => {
    const target = candidate('dio', '5.4.0', '6.0.0', '^5.4.0', [
      at('5.4.0', { http_parser: '^4.0.0' }),
      at('5.4.3', { http_parser: '^4.0.0' }),
      at('5.5.0', { http_parser: '^5.0.0' }), // asks for something new
      at('6.0.0', { http_parser: '^5.0.0' })
    ]);
    expect(findConflicts([target, peer]).get('dio')?.safeVersion).toBe('5.4.3');
  });

  it('stays silent rather than guessing when every newer version differs', () => {
    const target = candidate('dio', '5.4.0', '6.0.0', '^5.4.0', [
      at('5.4.0', { http_parser: '^4.0.0' }),
      at('5.5.0', { http_parser: '^5.0.0' }),
      at('6.0.0', { http_parser: '^5.0.0' })
    ]);
    expect(findConflicts([target, peer]).get('dio')?.safeVersion).toBeUndefined();
  });

  it('still refuses a version a peer caps by number, however it is written', () => {
    // Identical requirements throughout, but retrofit will not take 5.5.0.
    const target = candidate('dio', '5.4.0', '5.5.0', '^5.4.0', [
      at('5.4.0', { http_parser: '^4.0.0' }),
      at('5.4.3', { http_parser: '^4.0.0' }),
      at('5.5.0', { http_parser: '^4.0.0' })
    ]);
    const capped = candidate('retrofit', '4.0.0', '4.0.0', '4.0.0', [
      at('4.0.0', { dio: '>=5.0.0 <5.5.0' })
    ]);
    expect(findConflicts([target, capped]).get('dio')?.safeVersion).toBe('5.4.3');
  });
});

describe('when nothing can be installed', () => {
  // Same pile-up, but freezed published no version that stays on analyzer 5.
  const stuck = candidate('freezed', '2.4.0', '2.5.0', '^2.4.0', [
    at('2.4.0', { analyzer: '^5.0.0' }),
    at('2.5.0', { analyzer: '^6.0.0' })
  ]);
  const pinned = candidate('build_runner', '2.4.9', '2.4.9', '2.4.9', [
    at('2.4.9', { analyzer: '^5.0.0' })
  ]);
  const conflict = findConflicts([stuck, pinned]).get('freezed')!;

  it('offers no safe version rather than inventing one', () => {
    expect(conflict.safeVersion).toBeUndefined();
    expect(conflict.groupUpdate).toEqual([]);
  });

  it('treats every newer version as blocked', () => {
    expect(isBlockedVersion(conflict, '2.5.0')).toBe(true);
    expect(isBlockedVersion(conflict, '2.4.1')).toBe(true);
  });
});

describe('isBlockedVersion', () => {
  const conflict = findConflicts([dio, retrofit]).get('dio')!;

  it('draws the line at the safe version', () => {
    expect(isBlockedVersion(conflict, '5.5.0')).toBe(true);
    expect(isBlockedVersion(conflict, '5.4.3')).toBe(false);
    expect(isBlockedVersion(conflict, '5.4.1')).toBe(false);
  });
});

describe('staying quiet instead of guessing', () => {
  it('reports nothing when the ranges do overlap', () => {
    const peer = candidate('retrofit', '4.0.0', '4.0.0', '4.0.0', [
      at('4.0.0', { dio: '^5.0.0' })
    ]);
    expect(findConflicts([dio, peer]).size).toBe(0);
  });

  it('reports nothing for constraints semver cannot read', () => {
    const peer = candidate('retrofit', '4.0.0', '4.0.0', '4.0.0', [
      at('4.0.0', { dio: 'any' })
    ]);
    const odd = candidate('other', '1.0.0', '1.0.0', 'any', [
      at('1.0.0', { dio: 'whatever' })
    ]);
    expect(findConflicts([dio, peer, odd]).size).toBe(0);
  });

  it('never offers a prerelease as the safe version', () => {
    // freezed really does publish 3.0.0-0.0.dev between 2.x and 3.x.
    const withDev = candidate('dio', '5.4.0', '5.5.0', '5.4.0', [
      at('5.4.0'),
      at('5.4.3'),
      at('5.5.0-dev.1'),
      at('5.5.0')
    ]);
    expect(findConflicts([withDev, retrofit]).get('dio')!.safeVersion).toBe('5.4.3');
  });

  it('never asks a blocker to move to a prerelease', () => {
    const stuck = candidate('freezed', '2.4.0', '3.0.0', '^2.4.0', [
      at('2.4.0', { analyzer: '^5.0.0' }),
      at('3.0.0', { analyzer: '^6.0.0' })
    ]);
    // The only version of build_runner that would agree is a prerelease, and
    // pub will not resolve to one. So there is no group move to offer.
    const peer = candidate('build_runner', '2.4.9', '2.4.9', '^2.4.9', [
      at('2.4.9', { analyzer: '^5.0.0' }),
      at('3.0.0-dev.1', { analyzer: '^6.0.0' })
    ]);
    expect(findConflicts([stuck, peer]).get('freezed')!.groupUpdate).toEqual([]);
  });

  it('does not let a prerelease satisfy a peer that would otherwise block', () => {
    const dioWithDev = candidate('dio', '5.4.0', '5.5.0', '^5.4.0', [
      at('5.4.0'),
      at('5.5.0')
    ]);
    // retrofit 5.0.0-dev.1 would accept dio 5.5.0, but pub will not pick it.
    const peer = candidate('retrofit', '4.0.0', '4.0.0', '>=4.0.0 <6.0.0', [
      at('4.0.0', { dio: '>=5.0.0 <5.5.0' }),
      at('5.0.0-dev.1', { dio: '^5.5.0' })
    ]);
    expect(findConflicts([dioWithDev, peer]).has('dio')).toBe(true);
  });

  it('reports nothing when we have no data for the version in question', () => {
    const unknown = candidate('dio', '5.4.0', '9.9.9', '5.4.0', [at('5.4.0')]);
    expect(findConflicts([unknown, retrofit]).size).toBe(0);
  });

  it('skips packages that are already up to date', () => {
    const current = candidate('dio', '5.5.0', '5.5.0', '5.5.0', [at('5.5.0')]);
    expect(findConflicts([current, retrofit]).size).toBe(0);
  });
});

/** How a conflict reaches the screen. */
function asPackage(name: string, options: Partial<Package> = {}): Package {
  return {
    name,
    currentVersion: '1.0.0',
    latestVersion: '1.0.0',
    isOutdated: false,
    updateType: 'none',
    ...options
  };
}

const someConflict: Conflict = findConflicts([dio, retrofit]).get('dio')!;

describe('showing a conflict', () => {
  it('uses an icon no other row uses, so it is tellable apart at a glance', () => {
    const others = Object.values(UPDATE_STYLES).map(style => style.icon);
    expect(others).not.toContain(CONFLICT_STYLE.icon);
  });

  it('puts blocked packages above outdated ones', () => {
    const blocked = asPackage('zzz', { isOutdated: true, conflict: someConflict });
    const outdated = asPackage('aaa', { isOutdated: true });
    const fine = asPackage('bbb');

    expect([fine, outdated, blocked].sort(byOutdatedThenName).map(p => p.name)).toEqual([
      'zzz',
      'aaa',
      'bbb'
    ]);
  });

  it('counts conflicts separately from outdated packages', () => {
    const project: Project = {
      name: 'app',
      pubspecPath: '/app/pubspec.yaml',
      packages: [
        asPackage('a', { isOutdated: true, conflict: someConflict }),
        asPackage('b', { isOutdated: true }),
        asPackage('c')
      ]
    };
    expect(projectSummary(project)).toBe('1 conflict · 2 outdated');
  });

  it('says all up to date only when there is nothing at all to do', () => {
    const project: Project = {
      name: 'app',
      pubspecPath: '/app/pubspec.yaml',
      packages: [asPackage('a')]
    };
    expect(projectSummary(project)).toBe('all up to date');
  });

  it('tells the user who blocks them and how far they can go', () => {
    const blocked = asPackage('dio', {
      currentVersion: '5.4.0',
      latestVersion: '5.5.0',
      isOutdated: true,
      conflict: someConflict
    });
    expect(conflictTooltip(blocked)).toBe(
      '5.5.0 is blocked by retrofit\nSuggested version: 5.4.3'
    );
  });

  it('never shows an overridden package as blocked', () => {
    const overridden = asPackage('package_info_plus', {
      isOutdated: true,
      conflict: someConflict,
      override: { pinnedTo: '10.1.0' }
    });
    expect(isBlocked(overridden)).toBe(false);

    const project: Project = {
      name: 'app',
      pubspecPath: '/app/pubspec.yaml',
      packages: [overridden, asPackage('b', { isOutdated: true })]
    };
    expect(projectSummary(project)).toBe('2 outdated');
  });

  it('explains the override, and why it is probably there', () => {
    const overridden = asPackage('package_info_plus', {
      isOutdated: true,
      override: { pinnedTo: '10.1.0', wouldBlock: someConflict }
    });
    expect(overrideTooltip(overridden)).toBe(
      'dependency_overrides pins this to 10.1.0, whatever the constraint says.\n' +
        'Without it, retrofit would cap this package.'
    );
  });

  it('handles a path or git override, which pins no version', () => {
    const overridden = asPackage('some_plugin', { override: { pinnedTo: '' } });
    expect(overrideTooltip(overridden)).toBe(
      'dependency_overrides decides this version, whatever the constraint says.'
    );
  });

  it('points at the group move when there is one', () => {
    const conflict = findConflicts([freezed, buildRunner]).get('freezed')!;
    const blocked = asPackage('freezed', {
      currentVersion: '2.4.0',
      latestVersion: '2.5.0',
      isOutdated: true,
      conflict
    });
    expect(conflictTooltip(blocked)).toContain('Update build_runner at the same time');
  });
});
