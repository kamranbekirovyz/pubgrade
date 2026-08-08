# Changelog

## 2.1.0

- Fixed `flutter pub get` running in the wrong folder in monorepos
- Fixed `flutter pub get` failing on Windows
- Changelogs load faster, and no longer mix up packages between projects
- New outlined sidebar icon
- Rewritten internals, now covered by tests

## 2.0.1

- Exclude `.fvm/` directory from pubspec scanning

## 2.0.0 - Monorepo Support

- Monorepo support: auto-detects all pubspec.yaml files and groups packages by project
- Smarter version checks using pubspec.lock for caret dependencies
- Lots of bug fixes and improvements to make things faster and more reliable

## 1.5.0 - Respect Version Constraints

- Updater now respects caret (^) constraints in pubspec.yaml
- If package added as `^4.0.0`, it updates to `^4.0.1` (preserves caret)
- If package added as `4.0.0`, it updates to `4.0.1` (no caret)

## 1.4.0 - Publish Dates & Performance

- Display version dates (e.g., "3 days ago", "2 months ago")
- Worker pool refactoring for improved performance, by [@ziyad-aljohani](https://github.com/ziyad-aljohani).

## 1.3.0 - Version Type Indicators

- Visual indicators for update types: major (red), minor (yellow), and patch (blue) updates
- Informative tooltips explaining the impact of each update type
- Better UX for identifying which updates require more caution
- Thanks to [@ernestjsf](https://github.com/ernestjsf) for the contribution!

## 1.2.0 - Performance Improvements

- Package checking now uses batch processing (4 packages at a time) for ~4x faster performance
- Improved progress reporting with clearer "X of Y packages checked" format
- Fixed progress calculation for accurate completion tracking
- Thanks to [@ziyad-aljohani](https://github.com/ziyad-aljohani) for the contribution!

## 1.1.0 - Icon Added

- This update hopefully adds icon to be seen on VS Code and Cursor marketplace.

## 1.0.1 - Minor Changes

- Update package name to just "Pubgrade"


## 1.0.0 - Initial Release

- Package listing in sidebar
- Outdated package detection
- Changelog viewing
- One-click updates per version
- Badge counter for outdated packages
- Automatic sorting (outdated first)

