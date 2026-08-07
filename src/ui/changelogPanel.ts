import * as vscode from 'vscode';
import { ChangelogRequest } from '../changelogService';
import { ChangelogSection } from '../core/types';
import { formatRelativeTime } from '../core/versions';

/** Which pubspec.yaml the currently shown package belongs to. */
export interface UpdateTarget {
  pubspecPath: string;
  packageName: string;
}

/**
 * The changelog webview. One panel, reused for every package.
 *
 * The panel only renders; it reports the version the user picked back through
 * `onUpdate` and lets the caller do the work. The target travels with the
 * panel rather than being looked up by name, so a monorepo updates the project
 * the user actually opened.
 */
export class ChangelogPanel {
  private panel: vscode.WebviewPanel | undefined;
  private target: UpdateTarget | undefined;

  constructor(
    private readonly onUpdate: (target: UpdateTarget, version: string) => void
  ) {}

  show(request: ChangelogRequest, target: UpdateTarget): void {
    this.target = target;
    const panel = this.ensurePanel();
    panel.title = `${request.packageName} changelog`;
    panel.webview.html = render(request);
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
      if (message?.command === 'update' && message.version && this.target) {
        this.onUpdate(this.target, message.version);
      }
    });

    panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel = panel;
    return panel;
  }
}

/**
 * The webview runs with a strict CSP and no inline event handlers: values from
 * pub.dev are escaped and passed as data attributes, never spliced into script.
 */
function render(request: ChangelogRequest): string {
  const { packageName, fromVersion, toVersion, sections, publishedAt } = request;
  const nonce = makeNonce();

  const notice = request.showingEverything
    ? `<p class="notice">Could not match this changelog to ${escapeHtml(fromVersion)} → ${escapeHtml(
        toVersion
      )}. Showing the whole changelog.</p>`
    : '';

  const body =
    sections.map(section => renderSection(section, publishedAt)).join('') ||
    '<p class="empty">No changelog entries found for this version range.</p>';

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
</style>
</head>
<body>
  <h1>${escapeHtml(packageName)}</h1>
  <div class="summary">
    <span>${escapeHtml(fromVersion)} → ${escapeHtml(toVersion)}</span>
    ${updateButton(toVersion, `Update to latest (${toVersion})`)}
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
  for (const button of document.querySelectorAll('button[data-version]')) {
    button.addEventListener('click', () => {
      vscode.postMessage({ command: 'update', version: button.dataset.version });
    });
  }
</script>
</body>
</html>`;
}

function renderSection(section: ChangelogSection, publishedAt: Map<string, Date>): string {
  const date = publishedAt.get(section.version);
  const dateHtml = date ? `<span class="date">${formatRelativeTime(date)}</span>` : '';

  return `
  <div class="release">
    <div class="release-head">
      <span class="version">${escapeHtml(section.version)}</span>
      ${dateHtml}
      ${updateButton(section.version, `Update to ${section.version}`)}
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join('');
}
