# Pubgrade for JetBrains IDEs

The same thing as the VS Code client, for IntelliJ IDEA, Android Studio, and every other JetBrains IDE.

## Run it

```bash
cd clients/intellij
./gradlew runIde
```

That opens a fresh IntelliJ with the plugin installed. Open a Flutter project in it, and Pubgrade appears on the right edge.

To run it in Android Studio instead:

```bash
./gradlew runIde -PlocalPath="/Applications/Android Studio.app"
```

## Test it

```bash
./gradlew test
```

75 unit tests, no IDE needed. They cover the parsing, the version maths and the changelog reader, which is where the bugs live.

## Build an installable zip

```bash
./gradlew buildPlugin
```

Drops `build/distributions/pubgrade-2.1.0.zip`. Install it with **Settings > Plugins > gear icon > Install Plugin from Disk**.

## What is different from the VS Code client

Same logic, different surface. Three things had to change:

**Two tabs instead of a webview.** VS Code opens the changelog as an editor tab beside your code. JetBrains has no equivalent that works in every IDE, so the tool window has a Packages tab and a Changelog tab, and clicking a package switches to the second one.

The changelog itself is the package name, the range the update would move through, then every release with its own button, so you can read what changed and stop wherever you like. The newest release gets the filled button. Updating takes you back to the Packages tab, since the changelog you were reading describes a jump you have just taken.

**Notifications instead of a terminal.** VS Code runs `flutter pub get` in a reusable terminal tab. Here the process is run directly and its result comes back as a notification. Using the real terminal would mean depending on the terminal plugin, which not every IDE ships.

**Its own YAML and semver code.** The VS Code client uses js-yaml and the semver npm package. The IntelliJ platform ships neither, so `core/Yaml.kt` and `core/SemVer.kt` implement exactly the parts we use and nothing more.

## Layout

Same three layers as the VS Code client, same rule: imports only point downward.

```
PubgradeController.kt   wiring: background tasks, notifications
  ├─ ui/                what the user sees      → imports com.intellij
  ├─ Workspace.kt       files, processes        → imports com.intellij + java.io
  ├─ PackageService.kt  the one stateful object
  ├─ ChangelogService.kt
  └─ pub/               HTTP to pub.dev         → imports java.net.http + gson
        └─ core/        the rules               → imports nothing
```

`core/` must never import `com.intellij`, `java.io`, or gson. That is what makes the 75 tests run in a second without starting an IDE.

## Requirements

JDK 17 or newer. Nothing else, the Gradle wrapper fetches the rest.
