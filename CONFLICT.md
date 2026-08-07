# Dependency conflicts

## What a conflict is

Your `pubspec.yaml` lists packages you want. Those packages have their own
`pubspec.yaml` listing packages *they* want, with a range of versions they
accept.

A conflict is when the latest version of a package cannot be installed, because
something else in the project will not accept it.

Two shapes, both common:

**One package caps another.** `retrofit` says it needs `dio >=5.0.0 <5.5.0`.
`dio 5.5.0` is out. You cannot take it.

**Two packages disagree about a third.** `freezed 2.5.0` needs `analyzer ^6.0.0`,
`build_runner 2.4.9` needs `analyzer ^5.0.0`. You never typed `analyzer`, but it
is why the update fails. This is the everyday Flutter one.

## The rule that makes this work

**Other packages are not frozen.** A constraint like `^4.11.0` lets pub pick
anything below `5.0.0`, and `pub get` does exactly that without touching
pubspec.yaml. The first version of this feature compared against the version in
`pubspec.lock` and reported six conflicts in a project that updated fine —
because pub simply slid the blockers forward on its own.

So a package only blocks when **no version its constraint allows** can agree.
`Candidate.allowed` carries that constraint, and `optionsWithin` is what every
check iterates over. Get this wrong and the feature cries wolf.

## dependency_overrides

An override changes the rules twice over, and both halves matter:

- **Constraints *on* an overridden package are ignored.** Pub installs the
  override whatever anyone else asks for, so those are not conflicts. An
  overridden package is never shown as blocked.
- **The overridden package's own requirements still apply**, at the pinned
  version only. An override decides which version is installed; it does not
  excuse that package from its own dependencies. Pinning a package to an old
  version can therefore *create* a conflict that would not exist otherwise.

A `path:` or `git:` override names no version we can look up, so we say nothing
about that package at all.

`findConflicts` takes the overrides map for this. Passing an empty map gives
the conflicts as if no override existed, which is what the panel uses to
explain *why* the override is probably there — usually the forgotten part.

This came from a real project: `once 1.8.0` caps `package_info_plus` at
`^9.0.0`, an override installs `10.1.0` anyway, and `pub get` succeeds. Without
reading the override section we reported a blocked update on a project that
resolves fine.

## How we detect it

pub.dev's package API returns every published version together with that
version's own dependency list. We already download that document to find the
latest version, so the constraint data costs no extra request.

For each outdated package, `disagreement()` asks three questions of every other
direct dependency, at each version its constraint allows:

1. Does the peer cap the update? `retrofit` says `dio >=5.0.0 <5.5.0`.
2. Does the update need more of the peer than its constraint allows? `freezed`
   3.x requires `freezed_annotation 3.1.0`, which `^2.4.1` never reaches.
3. Do they share a dependency and disagree about it? Both want `analyzer`, one
   at `^5.0.0` and one at `^6.0.0`.

If every allowed version of a peer fails one of these, it is a blocker.

## The version we suggest

`provablyInstallable` returns a version only when two things hold:

1. It needs **exactly** what the installed version needs. The project resolves
   today, so an identical set of requirements resolves too — nothing deeper in
   the tree can change that.
2. No peer caps it by version number. That is a constraint *on* the package
   rather than one it makes, so rule 1 says nothing about it.

This started out as rule 2 alone — "the newest version nothing objects to" —
which reads as far more useful and was **wrong twice** in live testing. Both
times a package four levels down (`_macros`, via `analyzer`) refused a version
we had called safe, because this file only ever looks one level.

The number goes on a button that rewrites `pubspec.yaml`. A wrong one leaves
the project unresolvable, so it has to be a proof, not a good guess. The cost
is that it is quiet: usually patch releases, and often nothing at all.
`build_runner` in `example/` now suggests nothing, which is the correct answer.

If you loosen this, the old failure is the test to beat.

## How accurate this actually is

Checked against the real solver (`pub get --dry-run`) on a project built to
conflict:

| what we said | what pub did |
|---|---|
| `freezed` alone is blocked | refused to resolve |
| `build_runner` alone is blocked | refused to resolve |
| this group of three resolves | resolved |
| firebase packages have no conflict | resolved |
| suggested `freezed 2.4.7` | resolved |
| suggested `retrofit_generator 8.0.6` | resolved |
| suggested `freezed_annotation 2.4.3` | resolved |

**The blocked flags were right every time.** When we say no allowed version can
agree, that is a proof, not a guess — pub has no move left either. A false
positive here is a bug worth chasing, not a threshold to tune.

Two earlier runs did miss, and both were suggested versions produced by the old
"newest version nothing objects to" rule — `freezed 2.5.7` and
`build_runner 2.4.14`, each refused over `_macros`. That rule is gone; see the
next section for what replaced it.

## What we deliberately do not do

**We do not run anything on the user's machine.** No `pub get --dry-run`, no
subprocesses, no temporary directories. Detection is arithmetic on cached data.

The fork this feature came from used the real pub solver in a temp directory.
That is more accurate, but it copies `pubspec.yaml` into `/tmp`, where relative
`path:` dependencies stop resolving — so every monorepo package reports a false
conflict. It also costs one full resolve per package.

**We only look one level deep.** We read what your direct dependencies require.
A conflict buried three levels down in the tree will not be caught here;
`flutter pub get` will report it when the user actually updates. This is the
limit that shapes everything else in this file — most of all the version we
suggest, which is why that one is a proof rather than a search.

**We stay quiet when we cannot be sure.** `any`, SDK-provided entries, and any
range semver cannot parse are treated as "no opinion" rather than guessed at. A
wrong conflict warning is worse than a missing one.

## Group updates, and not updating blind

When two packages block each other, neither can move alone but both can move
together. `findConflicts` checks this by re-running the comparison with every
peer free of its constraint. If that clears, the conflict carries a
`groupUpdate` plan.

**This button is the sharp edge of the whole feature.** It writes several
packages at once, and the ones it drags along are usually major bumps — that is
precisely why they need a group. The user opened one package's changelog and
has not read the others. Pubgrade exists so nobody updates blind, so the plan
has to be legible before it is agreed to:

- every member shows its jump (`2.4.5 → 3.2.5`) and its size, `major` in red
- every member links to its own changelog, which swaps the panel to that package
- a line above the button counts the major bumps

If you change this, keep that property. A one-click "update all" with no
changelogs would be `flutter pub upgrade --major-versions`, which already
exists in the terminal and does not need an extension.

## Writing the group

`PackageService.update` takes a list, and writes nothing unless every package
in it can be rewritten — a half-applied group would leave the pubspec
unresolvable.

## What the user sees

**Sidebar.** A blocked package gets a red `flame` icon and sorts above outdated
ones. Deliberately not the `error` icon, which major updates already use. The
project row reads `1 conflict · 3 outdated`.

**Panel.** It leads with a **verdict**, because a list of constraints is a
report and the reader wants an answer:

- *"You can have 3.2.5 — but 2 other packages have to move with it."*
- *"You cannot have 2.16.0 yet."*
- *"You cannot have 2.16.0 yet, and there is nothing newer to take instead."*

Then the evidence — the bar, who is blocking and over what — and last a **What
you can do** list: take the suggested version, wait for the named package to
allow it, or drop that package. Before this the panel stated the problem and
stopped, which left people looking versions up on pub.dev by hand.

An overridden package gets a different, non-red banner instead: what it is
pinned to, what would cap it without the override, and a warning that updating
here changes the constraint rather than the installed version.

**Version list.** Rows above the safe version read `Update to X anyway` and are
marked `blocked`. Nothing is disabled — if the user wants it, they can have it.

## Where the code lives

| file | what it does |
|---|---|
| `src/core/conflicts.ts` | all of the logic, pure, no I/O |
| `src/core/pubspec.ts` | `parseOverrides` reads `dependency_overrides:` |
| `src/core/presentation.ts` | `isBlocked`, icon, tooltips, sorting, project summary |
| `src/pub/pubDevApi.ts` | pulls each version's constraints out of the API response |
| `src/packageService.ts` | runs the check per project, re-runs after an update |
| `src/ui/conflictBanner.ts` | both banners and their CSS |
| `test/conflicts.test.ts` | every conflict shape, group moves, overrides, quiet cases |

## Testing it by hand

`example/` is a Flutter project pinned to conflict on purpose. Open it in the
Extension Development Host and the sidebar shows five blocked packages: the
`analyzer` pile-up between `build_runner`, `freezed`, `json_serializable` and
`retrofit_generator`, plus two direct caps. `dio`, `retrofit` and `http` are
plain outdated rows so the normal UI stays visible.

To check the logic against the real solver without the editor, copy a pubspec
somewhere scratch and run `flutter pub get --dry-run` after each change. That
is how the accuracy table above was produced, and how three separate bugs were
found. Note `--dry-run` needs an existing `.dart_tool/`, so use a plain
`pub get` on a fresh directory.

`example/pubspec.yaml` is edited by the update buttons. Reset it before
comparing runs.

## What to attack next

Ranked by how much it is worth:

1. **The suggested version is correct but very quiet.** It only fires when a
   newer release needs byte-identical requirements, so most packages get
   nothing. Widening it is the obvious win and the easy way to reintroduce the
   `_macros` bug — any looser rule needs to beat `freezed 2.5.7` and
   `build_runner 2.4.14`, both of which the old rule offered and pub refused.
2. **Nothing tells the user when a blocker will never move.** `build_runner` in
   `example/` cannot reach 2.16.0 by any combination, because `freezed` has
   never published a version accepting `analyzer` 13. The panel says "you
   cannot have this yet" but not "and no update to anything will fix it",
   which is a different and more useful sentence.
3. **Blocked detection is sound; leave the shape alone.** Every "blocked" flag
   held up against the real solver. If you find a false positive, it is a bug
   worth chasing, not a tuning knob.
4. **Transitive conflicts are invisible.** Anything below the direct
   dependencies is out of reach without a real solver, and a real solver means
   running pub — see below before going there.
5. **Nothing here runs a command.** If you are tempted to shell out to pub for
   accuracy, read "What we deliberately do not do" first — the fork this came
   from did exactly that and broke every monorepo.

## One known bug, not fixed here

`setDependencyVersion` matches the first indented `name:` in the file. When a
package appears in both `dependencies:` and `dependency_overrides:`, it edits
whichever comes first — which may be the wrong section. That predates this
feature. Making the editor section-aware deserves its own change and its own
tests; until then, the override banner tells the user to edit the override by
hand rather than pretending the button will do it.
