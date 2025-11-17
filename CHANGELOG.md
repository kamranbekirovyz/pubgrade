# Changelog

## 1.4.0 - Monorepo & Workspace Support

- **Monorepo support**: Automatically discovers and manages multiple Flutter projects in a workspace
- **Hierarchical tree view**: Projects now organized in collapsible groups with per-project outdated counts
- **Multi-pubspec discovery**: Recursively finds all `pubspec.yaml` files across the workspace
- **Per-project updates**: Each package update targets the correct project's pubspec file
- **Respects VS Code settings**: Uses existing `files.exclude` and `search.exclude` patterns for discovery
- **Smart sorting**: Projects with outdated packages shown first, packages within projects sorted by outdated status
- **Enhanced UI**: Project folders show icon colors and badges based on their packages' update status

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

