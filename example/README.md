# Pubgrade example project

A throwaway Flutter project used to test Pubgrade by hand. Nothing here is
meant to run — only `pubspec.yaml` matters.

The caret constraints are chosen deliberately — each conflict below needs a
major bump, which pub cannot do on its own:

- **`build_runner`, `freezed`, `json_serializable`, `retrofit_generator`** all
  depend on `analyzer` and pin it to different ranges. Each one is blocked by
  the other three. This is the everyday Flutter conflict.
- **`freezed_annotation`** is capped directly by `freezed`, and has a safe
  version below the latest.
- **`json_annotation`** is capped by `json_serializable` with no safe version
  at all, only a group move.
- **`dio`, `retrofit`, `http`** are plain outdated packages with no conflict,
  so the normal rows are visible too.

To see it: open this folder in the Extension Development Host and look at the
Pubgrade sidebar.
