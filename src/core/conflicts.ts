import * as semver from 'semver';
import { UpdateType } from './types';
import { updateType } from './versions';

/**
 * Finds updates that pub would refuse to install, using only data pub.dev
 * already gave us. Nothing here runs a command or touches the file system.
 *
 * The idea: every published version states what it needs. If the version you
 * want needs `analyzer ^6.0.0` and nothing else in the project can live with
 * that, the update cannot land.
 *
 * The important subtlety is that the other packages are not frozen. A
 * constraint like `^4.11.0` lets pub pick anything up to `5.0.0`, and it will
 * do so during `pub get` without touching pubspec.yaml. So a package only
 * blocks when *no* version its constraint allows can agree — otherwise pub
 * quietly moves it and the update succeeds.
 */

/** What one published version of a package requires. */
export interface VersionRequirements {
  version: string;
  /** Dependency name -> version range, exactly as that version wrote it. */
  requires: Map<string, string>;
}

/** A direct dependency of the project, with what pub.dev knows about it. */
export interface Candidate {
  name: string;
  currentVersion: string;
  latestVersion: string;
  /** The range pubspec.yaml allows pub to pick from, e.g. `^4.11.0`. */
  allowed: string;
  versions: VersionRequirements[];
}

/** One package standing in the way, and what the disagreement is about. */
export interface Blocker {
  name: string;
  /** The newest version its constraint allows — its best offer, and still not enough. */
  version: string;
  /** The package the two sides disagree about. Equals the blocked package for a direct cap. */
  over: string;
  /** What the blocker allows. */
  allows: string;
  /** What the update wants. */
  wants: string;
  /** True when letting this one past its constraint would clear the conflict. */
  movable: boolean;
}

/**
 * One line of an "update these together" plan.
 *
 * `jump` is on here because a group move is usually a set of major bumps —
 * that is why it needs a group in the first place — and the panel must say so
 * before anyone agrees to it.
 */
export interface GroupMember {
  name: string;
  from: string;
  to: string;
  jump: UpdateType;
}

export interface Conflict {
  blockers: Blocker[];
  /**
   * A newer version that is guaranteed to install. See `provablyInstallable`.
   * Absent when we cannot prove one, which is often.
   */
  safeVersion?: string;
  /** Packages to move together. Empty unless doing so clears every blocker. */
  groupUpdate: GroupMember[];
}

/**
 * True when installing `version` would hit the conflict.
 *
 * Only meaningful for versions newer than the one in use: everything above the
 * safe ceiling is blocked, and when there is no safe version at all, so is
 * everything.
 */
export function isBlockedVersion(conflict: Conflict, version: string): boolean {
  if (!conflict.safeVersion) return true;
  return isNewer(version, conflict.safeVersion);
}

/** A long-lived package has hundreds of releases; only the newest few decide anything. */
const MAX_VERSIONS_TRIED = 40;

/** Ignore the declared constraint: what pub could do if we rewrote pubspec.yaml too. */
const UNCONSTRAINED = null;

/**
 * Checks every candidate's latest version against every other candidate.
 * Only conflicted packages appear in the result.
 *
 * `overrides` is `dependency_overrides:` as name -> pinned version. It changes
 * the rules in two ways, and both matter:
 *
 * - Constraints *on* an overridden package are ignored. Pub installs the
 *   override no matter who objects, so those are not conflicts.
 * - The overridden package's *own* requirements still apply, at the pinned
 *   version only. An override does not excuse a package from its dependencies.
 *
 * Pass an empty map to see what the conflicts would be with no overrides.
 */
export function findConflicts(
  candidates: Candidate[],
  overrides: ReadonlyMap<string, string> = new Map()
): Map<string, Conflict> {
  const conflicts = new Map<string, Conflict>();

  for (const target of candidates) {
    if (!isNewer(target.latestVersion, target.currentVersion)) continue;
    if (overrides.has(target.name)) continue;

    const peers = candidates.filter(peer => peer.name !== target.name);
    const conflict = conflictFor(target, peers, overrides);
    if (conflict) conflicts.set(target.name, conflict);
  }

  return conflicts;
}

function conflictFor(
  target: Candidate,
  peers: Candidate[],
  overrides: ReadonlyMap<string, string>
): Conflict | null {
  const blockers = blockersFor(target, target.latestVersion, peers, withinConstraint, overrides);
  if (blockers.length === 0) return null;

  // Would letting everyone off their constraint settle it? If so the blockers
  // are movable and there is a group plan. This is the code-generation pile-up.
  const afterGroupMove = blockersFor(
    target,
    target.latestVersion,
    peers,
    ignoreConstraint,
    overrides
  );
  const stillBlocking = new Set(afterGroupMove.map(blocker => blocker.name));

  const resolved = blockers.map(blocker => ({
    ...blocker,
    movable: !stillBlocking.has(blocker.name)
  }));

  return {
    blockers: resolved,
    safeVersion: provablyInstallable(target, peers, overrides),
    groupUpdate: afterGroupMove.length === 0 ? groupPlan(target, resolved, peers, overrides) : []
  };
}

/**
 * Everything that would refuse `target` at `version`.
 *
 * A peer is only a blocker when every version it is allowed to take disagrees.
 * If any one of them fits, pub will find it by itself.
 */
function blockersFor(
  target: Candidate,
  version: string,
  peers: Candidate[],
  rangeFor: (peer: Candidate) => string | null,
  overrides: ReadonlyMap<string, string>
): Blocker[] {
  const wanted = requirementsAt(target, version);
  if (!wanted) return [];

  const blockers: Blocker[] = [];

  const update = { name: target.name, version, needs: wanted };

  for (const peer of peers) {
    // An overridden peer is pinned: it still brings its own requirements, but
    // only at the version the override names. A `path:` or `git:` override
    // gives us no version to look up, so we say nothing about it.
    const pinnedTo = overrides.get(peer.name);
    if (pinnedTo === '') continue;

    const options = optionsWithin(peer, pinnedTo ?? rangeFor(peer));
    if (options.length === 0) continue;
    if (options.some(option => !disagreement(peer, option, update, overrides))) continue;

    // Report its best offer: the newest version it was allowed to try.
    const best = options[0];
    const why = disagreement(peer, best, update, overrides)!;

    blockers.push({ name: peer.name, version: best.version, ...why, movable: false });
  }

  return blockers;
}

/** The update being tested, and what that version of it requires. */
interface Update {
  name: string;
  version: string;
  needs: VersionRequirements;
}

interface Disagreement {
  over: string;
  allows: string;
  wants: string;
}

/** Why one version of a peer cannot coexist with the update, or null when it can. */
function disagreement(
  peer: Candidate,
  peerNeeds: VersionRequirements,
  update: Update,
  overrides: ReadonlyMap<string, string>
): Disagreement | null {
  // The peer caps the update: retrofit says `dio >=5.0.0 <5.5.0`.
  const capOnTarget = peerNeeds.requires.get(update.name);
  if (capOnTarget !== undefined && !allows(capOnTarget, update.version)) {
    return { over: update.name, allows: capOnTarget, wants: update.version };
  }

  // Or the other way round: the update needs a version of the peer that the
  // peer's own constraint cannot reach. freezed 3.x requires
  // freezed_annotation 3.1.0, which `^2.4.1` will never resolve to. Skipped
  // when the peer is overridden, since pub ignores constraints on it.
  const capOnPeer = update.needs.requires.get(peer.name);
  if (
    !overrides.has(peer.name) &&
    capOnPeer !== undefined &&
    !allows(capOnPeer, peerNeeds.version)
  ) {
    return { over: peer.name, allows: peer.allowed, wants: capOnPeer };
  }

  // Or they share a dependency and disagree about it: both want `analyzer`,
  // one at ^5 and one at ^6.
  for (const [shared, wantedRange] of update.needs.requires) {
    if (overrides.has(shared)) continue;

    const peerRange = peerNeeds.requires.get(shared);
    if (peerRange !== undefined && !overlaps(wantedRange, peerRange)) {
      return { over: shared, allows: peerRange, wants: wantedRange };
    }
  }

  return null;
}

/**
 * Versions of `candidate` pub may pick from, newest first.
 *
 * Prereleases are left out: pub does not resolve to one unless it is asked for
 * by name.
 */
function optionsWithin(candidate: Candidate, range: string | null): VersionRequirements[] {
  const readable = range === UNCONSTRAINED ? null : readRange(range);

  return candidate.versions
    .filter(entry => semver.valid(entry.version) !== null && !isPrerelease(entry.version))
    .filter(entry => readable === null || semver.satisfies(entry.version, readable))
    .sort((a, b) => compare(b.version, a.version))
    .slice(0, MAX_VERSIONS_TRIED);
}

/**
 * The newest version we can *prove* will install. Two things have to hold:
 *
 * 1. It asks for exactly what the installed version asks for. The project
 *    resolves today, so an identical set of requirements resolves too —
 *    nothing deeper in the tree can change that.
 * 2. No peer caps it by version. That is a constraint *on* this package rather
 *    than one it makes, so rule 1 says nothing about it: `retrofit` demanding
 *    `dio <5.5.0` does not care what `dio` itself requires.
 *
 * The obvious alternative — rule 2 alone, "the newest version no peer objects
 * to" — reads as far more useful and was wrong twice in testing. Both times a
 * package four levels down refused a version we had called safe, because this
 * file only ever looks one level. The answer goes on a button that rewrites
 * pubspec.yaml, so it has to be a proof rather than a good guess. The cost is
 * that it is quiet: usually patch releases, and often nothing at all.
 *
 * Prereleases are skipped, since pub will not resolve to one unasked.
 */
function provablyInstallable(
  target: Candidate,
  peers: Candidate[],
  overrides: ReadonlyMap<string, string>
): string | undefined {
  const installed = requirementsAt(target, target.currentVersion);
  if (!installed) return undefined;

  return target.versions
    .filter(entry => isNewer(entry.version, target.currentVersion) && !isPrerelease(entry.version))
    .sort((a, b) => compare(b.version, a.version))
    .slice(0, MAX_VERSIONS_TRIED)
    .filter(entry => sameRequirements(entry.requires, installed.requires))
    .find(
      entry =>
        blockersFor(target, entry.version, peers, withinConstraint, overrides).length === 0
    )?.version;
}

function sameRequirements(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [name, range] of a) {
    if (b.get(name) !== range) return false;
  }
  return true;
}

/**
 * The blocked package plus, for each blocker, the version it has to be moved
 * to. Empty when any blocker has no such version, or is already there.
 */
function groupPlan(
  target: Candidate,
  blockers: Blocker[],
  peers: Candidate[],
  overrides: ReadonlyMap<string, string>
): GroupMember[] {
  const wanted = requirementsAt(target, target.latestVersion);
  if (!wanted) return [];

  const update = { name: target.name, version: target.latestVersion, needs: wanted };
  const plan: GroupMember[] = [member(target.name, target.currentVersion, target.latestVersion)];

  for (const name of new Set(blockers.map(blocker => blocker.name))) {
    const peer = peers.find(candidate => candidate.name === name);
    if (!peer) return [];

    const fit = optionsWithin(peer, UNCONSTRAINED).find(
      option => !disagreement(peer, option, update, overrides)
    );
    if (!fit || !isNewer(fit.version, peer.currentVersion)) return [];

    plan.push(member(peer.name, peer.currentVersion, fit.version));
  }

  return plan;
}

function member(name: string, from: string, to: string): GroupMember {
  return { name, from, to, jump: updateType(from, to) };
}

function withinConstraint(candidate: Candidate): string {
  return candidate.allowed;
}

function ignoreConstraint(): null {
  return UNCONSTRAINED;
}

function requirementsAt(candidate: Candidate, version: string): VersionRequirements | undefined {
  return candidate.versions.find(entry => entry.version === version);
}

/**
 * Ranges we cannot read are treated as "no opinion".
 *
 * `any`, `sdk`-provided entries and anything else semver rejects would only let
 * us guess, and a wrong conflict warning is worse than a missing one.
 */
function readRange(raw: string): string | null {
  const range = raw.trim();
  if (!range || range === 'any') return null;
  return semver.validRange(range) ? range : null;
}

function allows(range: string, version: string): boolean {
  const readable = readRange(range);
  const parsed = semver.valid(version);
  if (!readable || !parsed) return true;
  return semver.satisfies(parsed, readable);
}

function overlaps(a: string, b: string): boolean {
  const left = readRange(a);
  const right = readRange(b);
  if (!left || !right) return true;

  try {
    return semver.intersects(left, right);
  } catch {
    return true;
  }
}

function isPrerelease(version: string): boolean {
  return (semver.prerelease(version)?.length ?? 0) > 0;
}

function isNewer(version: string, than: string): boolean {
  const a = semver.valid(version);
  const b = semver.valid(than);
  return a !== null && b !== null && semver.gt(a, b);
}

function compare(a: string, b: string): number {
  const left = semver.valid(a);
  const right = semver.valid(b);
  if (!left || !right) return 0;
  return semver.compare(left, right);
}
