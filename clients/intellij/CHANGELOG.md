# Changelog

## 2.1.3

- Packages are checked when the project opens, not only when you open the tool window
- Changelogs open at the top instead of scrolled to the bottom
- The Changelog tab is now a panel with a Close link, so a narrow tool window no longer folds both tabs into a dropdown
- The status bar no longer says "Packages up to date" before anything has been checked
- Wider margins in the changelog

## 2.1.2

- Replaced the platform's internal badge API, which JetBrains Marketplace rejects on 2024.2 and 2024.3

## 2.1.1

- Replaced the platform's internal button styling API, which JetBrains Marketplace rejects

## 2.1.0

- First JetBrains release: packages and changelog tool window
- Every dependency listed with its current and latest version
- Outdated packages sorted first, coloured by how big the jump is
- Changelogs pulled from pub.dev, cut down to the versions you would gain
- One-click updates that keep your `^` constraints
- Monorepo support: every pubspec.yaml is found and grouped
