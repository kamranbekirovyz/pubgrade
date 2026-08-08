# Pubgrade for JetBrains IDEs

See what changed before you upgrade. Works in IntelliJ IDEA, Android Studio, and every other JetBrains IDE.

[Install from the JetBrains Marketplace](https://plugins.jetbrains.com/plugin/33426-pubgrade)

## Features

- **Tool window** with every dependency and its current and latest version
- **Outdated detection** with a badge on the stripe icon and a count on the tab
- **Changelogs** from pub.dev, cut down to the versions you would gain
- **One-click updates** that keep your `^` constraints
- **Update type icons** for major, minor and patch
- **Monorepo support** that finds every `pubspec.yaml` and groups by project

## Usage

1. Open a Flutter project
2. Click **Pubgrade** on the right edge
3. Outdated packages are listed first
4. Click a package to read its changelog
5. Click **Update to X.X.X**

## Run it

```bash
cd clients/intellij
./gradlew runIde
```

Opens a fresh IntelliJ with the plugin installed. For Android Studio:

```bash
./gradlew runIde -PlocalPath="/Applications/Android Studio.app"
```

## Test it

```bash
./gradlew test
```

75 unit tests, no IDE needed.

## Build a zip

```bash
./gradlew buildPlugin
```

Drops `build/distributions/pubgrade-2.1.0.zip`. Install with **Settings > Plugins > gear icon > Install Plugin from Disk**.

## Layout

Three layers, imports only point downward.

```
PubgradeController.kt   wiring: background tasks, notifications
  ├─ ui/                what the user sees      → imports com.intellij
  ├─ Workspace.kt       files, processes        → imports com.intellij + java.io
  ├─ PackageService.kt  the one stateful object
  ├─ ChangelogService.kt
  └─ pub/               HTTP to pub.dev         → imports java.net.http + gson
        └─ core/        the rules               → imports nothing
```

`core/` must never import `com.intellij`, `java.io`, or gson. That is what keeps the tests running in a second without an IDE.

## Requirements

JDK 17 or newer. The Gradle wrapper fetches the rest.

## License

[MIT](../../LICENSE)
