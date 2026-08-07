import * as vscode from 'vscode';
import { ChangelogRequest } from '../changelogService';
import { isBlockedVersion } from '../core/conflicts';
import { isBlocked } from '../core/presentation';
import { ChangelogSection, Package, PackageUpdate } from '../core/types';
import { formatRelativeTime } from '../core/versions';
import { CONFLICT_CSS, conflictBanner } from './conflictBanner';
import { escapeHtml, makeNonce } from './html';

/** Which pubspec.yaml the currently shown package belongs to. */
export interface UpdateTarget {
  pubspecPath: string;
  packageName: string;
}

/**
 * The changelog webview. One panel, reused for every package.
 *
 * The panel only renders; it reports what the user picked back through
 * `onUpdate` and lets the caller do the work. The target travels with the
 * panel rather than being looked up by name, so a monorepo updates the project
 * the user actually opened.
 */
export class ChangelogPanel {
  private panel: vscode.WebviewPanel | undefined;
  private target: UpdateTarget | undefined;

  constructor(
    private readonly onUpdate: (pubspecPath: string, updates: PackageUpdate[]) => void,
    /** Show another package's changelog, without leaving the same project. */
    private readonly onOpen: (pubspecPath: string, packageName: string) => void
  ) {}

  show(request: ChangelogRequest, target: UpdateTarget, pkg: Package): void {
    this.target = target;
    const panel = this.ensurePanel();
    panel.title = `${request.packageName} changelog`;
    panel.webview.html = render(request, pkg);
    panel.reveal(vscode.ViewColumn.Beside);
  }

  dispose(): void {
    this.panel?.dispose();
  }

  private ensurePanel(): vscode.WebviewPanel {
    if (this.panel) return this.panel;

    const panel = vscode.window.createWebviewPanel(
      'pubgrade.changelog',
      'Changelog',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.webview.onDidReceiveMessage((message: any) => {
      if (!this.target) return;

      if (message?.command === 'open' && typeof message.package === 'string') {
        return this.onOpen(this.target.pubspecPath, message.package);
      }

      if (message?.command !== 'update') return;

      const updates = parseUpdates(message, this.target.packageName);
      if (updates.length > 0) this.onUpdate(this.target.pubspecPath, updates);
    });

    panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel = panel;
    return panel;
  }
}

/**
 * A button carries either one version (`data-version`) or a whole group
 * (`data-group`, as `name@version` pairs). Both arrive as plain strings from
 * the webview, so both are re-checked here before anything is written.
 */
function parseUpdates(message: any, packageName: string): PackageUpdate[] {
  if (typeof message.group === 'string') {
    return message.group
      .split(',')
      .map((pair: string) => {
        const at = pair.lastIndexOf('@');
        return { name: pair.slice(0, at), version: pair.slice(at + 1) };
      })
      .filter((update: PackageUpdate) => update.name && update.version);
  }

  if (typeof message.version === 'string' && message.version) {
    return [{ name: packageName, version: message.version }];
  }

  return [];
}

/**
 * The webview runs with a strict CSP and no inline event handlers: values from
 * pub.dev are escaped and passed as data attributes, never spliced into script.
 */
function render(request: ChangelogRequest, pkg: Package): string {
  const { packageName, fromVersion, toVersion, sections, publishedAt } = request;
  const nonce = makeNonce();

  const notice = request.showingEverything
    ? `<p class="notice">Could not match this changelog to ${escapeHtml(fromVersion)} → ${escapeHtml(
        toVersion
      )}. Showing the whole changelog.</p>`
    : '';

  const body =
    sections.map(section => renderSection(section, publishedAt, pkg)).join('') ||
    '<p class="empty">No changelog entries found for this version range.</p>';

  const latestLabel = isBlocked(pkg)
    ? `Update to ${toVersion} anyway`
    : `Update to latest (${toVersion})`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(packageName)} changelog</title>
<style nonce="${nonce}">
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    font-size: 13px;
    line-height: 1.6;
    padding: 20px;
  }
  h1 { font-size: 22px; margin: 0 0 12px; }
  .summary {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    background: var(--vscode-textBlockQuote-background);
    border-left: 3px solid var(--vscode-textLink-foreground);
    border-radius: 6px; padding: 12px 16px; margin-bottom: 24px;
  }
  .notice { color: var(--vscode-descriptionForeground); margin: -12px 0 20px; }
  .release { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 16px; margin-bottom: 20px; }
  .release:last-of-type { border-bottom: none; }
  .release-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .version {
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
    border-radius: 12px; padding: 4px 12px; font-weight: 600;
  }
  .date { color: var(--vscode-descriptionForeground); font-size: 12px; }
  button {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; border-radius: 4px; padding: 6px 12px;
    font-family: inherit; font-size: 12px; cursor: pointer;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  ul { margin: 8px 0; padding-left: 20px; }
  li { margin: 4px 0; }
  .empty { color: var(--vscode-descriptionForeground); text-align: center; padding: 40px; }
  footer { text-align: center; border-top: 1px solid var(--vscode-panel-border); padding-top: 16px; }
  a { color: var(--vscode-textLink-foreground); }
${CONFLICT_CSS}
</style>
</head>
<body>
  <h1>${escapeHtml(packageName)}</h1>
  ${conflictBanner(pkg)}
  <div class="summary">
    <span>${escapeHtml(fromVersion)} → ${escapeHtml(toVersion)}</span>
    ${updateButton(toVersion, latestLabel)}
  </div>
  ${notice}
  ${body}
  <footer>
    <a href="https://pub.dev/packages/${encodeURIComponent(packageName)}/changelog">
      View full changelog on pub.dev
    </a>
  </footer>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  for (const button of document.querySelectorAll('button[data-version], button[data-group]')) {
    button.addEventListener('click', () => {
      vscode.postMessage({
        command: 'update',
        version: button.dataset.version,
        group: button.dataset.group
      });
    });
  }
  for (const button of document.querySelectorAll('button[data-open]')) {
    button.addEventListener('click', () => {
      vscode.postMessage({ command: 'open', package: button.dataset.open });
    });
  }
</script>
</body>
</html>`;
}

function renderSection(
  section: ChangelogSection,
  publishedAt: Map<string, Date>,
  pkg: Package
): string {
  const date = publishedAt.get(section.version);
  const dateHtml = date ? `<span class="date">${formatRelativeTime(date)}</span>` : '';

  // Say so on the row itself, so nobody clicks a version that cannot install.
  const blocked = isBlocked(pkg) && isBlockedVersion(pkg.conflict!, section.version);
  const label = blocked ? `Update to ${section.version} anyway` : `Update to ${section.version}`;
  const warning = blocked ? '<span class="blocked-note">blocked</span>' : '';

  return `
  <div class="release">
    <div class="release-head">
      <span class="version">${escapeHtml(section.version)}</span>
      ${dateHtml}
      ${updateButton(section.version, label)}
      ${warning}
    </div>
    ${renderBody(section.body)}
  </div>`;
}

function updateButton(version: string, label: string): string {
  return `<button data-version="${escapeHtml(version)}">${escapeHtml(label)}</button>`;
}

/** Bullet lists and paragraphs are all a changelog needs. */
function renderBody(body: string): string {
  const html: string[] = [];
  let inList = false;

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);

    if (bullet) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${escapeHtml(bullet[1])}</li>`);
      continue;
    }

    if (inList) {
      html.push('</ul>');
      inList = false;
    }
    if (line) html.push(`<p>${escapeHtml(line)}</p>`);
  }

  if (inList) html.push('</ul>');
  return html.join('') || '<p><em>No details available.</em></p>';
}
