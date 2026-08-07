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
- **One-click updates** - Update to any version directly from changelog (respects `^` constraints)
- **Automatic sorting** - Outdated packages shown first
- **Update type indicators** - Color-coded icons for major (🔴), minor (🟡), and patch (🔵) updates
- **Monorepo support** - Auto-detects all `pubspec.yaml` files and groups packages by project
- **Conflict detection** - Flags updates that can't be installed, names what's blocking them, and offers the highest version you can actually take

## Dependency conflicts

Sometimes the latest version of a package can't be installed, because another
package won't accept it. Pubgrade spots this before you click update.

Blocked packages get a red flame icon and sort to the top. Opening one shows
who is blocking it, over which package, and how far you can go:

- **A suggested version** - the newest one nothing objects to, one click away
- **A group update** - when two packages block each other, they can only move
  together, so Pubgrade offers to update them at once
- **Nothing yet** - when no newer version can be installed at all, it says so
  instead of suggesting something that would fail

Detection is read-only and offline. Pubgrade never runs `pub get`, spawns a
process, or writes temporary files to check — it reads the constraint data
pub.dev already publishes. See [CONFLICT.md](CONFLICT.md) for how it works.

## Usage

1. Open any Flutter project with `pubspec.yaml`
2. Click the **Pubgrade** icon in Activity Bar (left sidebar)
3. View all dependencies with version info
4. **Outdated packages** (⚠️) shown at top
5. **Click a package** to view changelog
6. **Click "Update to X.X.X"** button to update

## License

[MIT](LICENSE)

