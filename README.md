# Pubgrade

Never miss a package update again. Check for updates, view changelogs, and update with one click.

[📹 Watch demo video](https://pubgrade.dev/pubgrade.mp4)

## Clients

| Client | Editors | Status |
|---|---|---|
| [VS Code](clients/vscode) | VS Code, Cursor, Windsurf | Released |
| [JetBrains](clients/intellij) | IntelliJ IDEA, Android Studio | Works, not released |

## Working on the VS Code client

```bash
cd clients/vscode
npm install
npm test
```

Press F5 from the repo root to launch it in a new window. Read [clients/vscode/STYLE.md](clients/vscode/STYLE.md) before changing anything.

## Working on the JetBrains client

```bash
cd clients/intellij
./gradlew test
./gradlew runIde
```

`runIde` opens a throwaway IntelliJ with the plugin already installed. See [clients/intellij/README.md](clients/intellij/README.md).

## 🩵 Want to say "thanks"?

If you like this project, consider checking [UserOrient](https://userorient.com), my side project for Flutter apps to collect feedback from users.

<a href="https://userorient.com" target="_blank">
	<img src="https://www.userorient.com/assets/extras/sponsor.png">
</a>
