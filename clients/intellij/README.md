# Never miss a package update with Pubgrade

You added packages to your Flutter app. They get updates. You miss them all. Pubgrade shows every one, and what changed, right in your editor.

Available for [VS Code](https://marketplace.visualstudio.com/items?itemName=KamranBekirov.flutter-pubgrade), [VS Code forks](https://open-vsx.org/extension/KamranBekirov/flutter-pubgrade) (Cursor, Antigravity, Windsurf, VSCodium), and [IntelliJ IDEA and Android Studio](https://plugins.jetbrains.com/plugin/33426-pubgrade).

## Features

📋 **See every package at once.** Open the panel and your whole dependency list is there, each one showing the version you have and the version that exists.

📖 **Read what actually changed.** Click a package and Pubgrade fetches its changelog from pub.dev so you can be aware before updating the package.

⚡ **Update in one click.** Pubgrade writes the new version into your `pubspec.yaml` and runs `flutter pub get` for you. If you pinned a package with a caret, it stays a caret.

🚦 **Know how big the jump is.** Major, minor and patch updates are coloured differently, so a release that could break your app never looks the same as a bug fix.

📦 **Works in a monorepo.** Every `pubspec.yaml` in the workspace is found and grouped under its own project, so a melos repo reads as cleanly as a single app.

🔒 **Nothing runs behind your back.** No telemetry, and no commands on your machine beyond the `flutter pub get` you asked for. Pubgrade reads your pubspec files and talks to pub.dev.

## License

[MIT](../../LICENSE)
