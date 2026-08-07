# Pubgrade

Never miss a package update again. Check for updates, view changelogs, and update with one click.

[📹 Watch demo video](https://pubgrade.dev/pubgrade.mp4)

## Clients

| Client | Editors | Status |
|---|---|---|
| [VS Code](clients/vscode) | VS Code, Cursor, Windsurf | Released |
| JetBrains | IntelliJ IDEA, Android Studio | Not started |

Each client lives in its own folder under `clients/` and ships on its own. They do not share code, because they are written in different languages, but they share the same behaviour and the same docs.

## Working on the VS Code client

```bash
cd clients/vscode
npm install
npm test
```

Press F5 from the repo root to launch it in a new window. Read [clients/vscode/STYLE.md](clients/vscode/STYLE.md) before changing anything.

## 🩵 Want to say "thanks"?

If you like this project, consider checking [UserOrient](https://userorient.com), my side project for Flutter apps to collect feedback from users.

<a href="https://userorient.com" target="_blank">
	<img src="https://www.userorient.com/assets/extras/sponsor.png">
</a>
