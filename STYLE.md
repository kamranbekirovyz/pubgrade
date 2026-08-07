# Style

How this codebase is written. Short on purpose — if a rule needs a paragraph to
justify, it is probably not worth having.

## Layers

Three of them. Imports only ever point downward.

```
extension.ts            wiring: commands, views, error messages
  ├─ ui/                what the user sees      → imports vscode
  ├─ workspace.ts       files, terminal, search → imports vscode + fs
  ├─ packageService.ts  the one stateful object
  ├─ changelogService.ts
  └─ pub/               HTTP to pub.dev         → imports axios
        └─ core/        the rules               → imports nothing but semver + js-yaml
```

**`core/` must never import `vscode`, `fs`, `axios`, or anything from a layer
above it.** That single rule is what makes the logic testable without a running
editor, and what would let it be ported to another host (a Kotlin IntelliJ
plugin, a CLI) by rewriting only the top two layers.

If you catch yourself wanting `vscode` inside `core/`, the thing you want is
probably a plain value. `UPDATE_STYLES` holds theme icon *names* as strings;
`core` never constructs a `ThemeIcon`.

## Functions

- Pure where it can be pure. `setDependencyVersion(text, name, version)` takes
  text and returns text; the caller does the reading and writing.
- Return `null` for "not found" and let the caller decide. Do not show a
  message box from a layer that does not own the UI.
- Injectable clocks and clients: `formatRelativeTime(date, now)` and
  `new PubDevApi(http)` exist in that shape so tests do not depend on the wall
  clock or the network.

## Errors

- `core/` does not throw for bad input. Malformed YAML gives you an empty list,
  an unparseable version gives you `none`. A broken pubspec should never take
  down the sidebar.
- `pub/` returns `null` on any network failure and logs once.
- `extension.ts` is the only place that shows a message to the user.

## Naming

- Say what it is, not what it is made of: `packages`, `sections`, `projects`.
- No `Manager`, `Helper`, `Util`, `Handler`. If a name needs one of those, the
  thing does too much.
- Booleans read as claims: `isOutdated`, `hasCaret`, `showingEverything`.

## Comments

- Comment the *why*, never the *what*. `// Fetch the package` above a fetch is
  noise; `// The lock file wins because a caret constraint is only a floor` is
  the reason someone would otherwise delete the line.
- Every non-obvious rule in `core/` carries the user-visible consequence of
  getting it wrong. That is the note that stops a future cleanup breaking it.
- No commented-out code, no `console.log` left behind. `console.error` in
  `pub/` is deliberate — it is the only diagnostic a user can send us.

## Tests

`npm test` — Vitest, no editor needed, runs in under a second.

- Test `core/` and the two services. Do not test the `ui/` layer; it is
  declarative and an integration test there costs more than it finds.
- Anything a CHANGELOG entry promises gets a test in `test/regressions.test.ts`
  with a comment saying which bug it guards.
- A test that cannot fail is worse than no test. Before adding one, break the
  code on purpose and check it goes red.
- Test names are sentences about behaviour: *"uses the resolved version for a
  caret constraint"*, not *"currentVersionOf works"*.

## Adding a feature

1. Write the rule in `core/`, with a test.
2. Give the service a method that uses it.
3. Render it in `ui/`.
4. Wire it in `extension.ts`.

If step 1 has nothing to put in it, the feature is pure presentation and starts
at step 3.
