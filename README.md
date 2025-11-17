# Pubgrade

Never miss a package update again. Check for updates, view changelogs, and update with one click.

[📹 Watch demo video](https://pubgrade.dev/pubgrade.mp4)

## 🩵 Want to say "thanks"?

If you like this package, consider checking [UserOrient](https://userorient.com), my side project for Flutter apps to collect feedback from users.

<a href="https://userorient.com" target="_blank">
	<img src="https://www.userorient.com/assets/extras/sponsor.png">
</a>


## Features

- **Sidebar panel** - All packages listed with current and latest versions
- **Outdated detection** - Warning icons and badge count for outdated packages  
- **Changelogs** - Click any package to see what changed between versions
- **One-click updates** - Update to any version directly from changelog
- **Automatic sorting** - Projects with outdated packages shown first, outdated packages within each project shown first
- **Update type indicators** - Color-coded icons for major (🔴), minor (🟡), and patch (🔵) updates
- **Monorepo support** - Automatically discovers and manages multiple Flutter projects in a workspace
- **Hierarchical view** - Projects organized with collapsible groups showing outdated counts

## Usage

1. Open any Flutter project or monorepo workspace containing `pubspec.yaml` files
2. Click the **Pubgrade** icon in Activity Bar (left sidebar)
3. View all projects and their dependencies organized hierarchically
4. **Outdated packages** (⚠️) shown at top of each project group
5. **Click a package** to view changelog
6. **Click "Update to X.X.X"** button to update that specific project's pubspec

## Monorepo/Workspace Support

Pubgrade now fully supports Flutter workspaces and monorepos with multiple projects:

- **Auto-discovery**: Recursively finds all `pubspec.yaml` files in your workspace
- **Project grouping**: Packages are organized by project with expand/collapse functionality
- **Per-project updates**: Each package update targets the correct `pubspec.yaml`
- **Outdated badges**: Shows count of outdated packages per project and globally
- **Respects VS Code settings**: Uses your existing `files.exclude` and `search.exclude` patterns

## License

[MIT](LICENSE)

