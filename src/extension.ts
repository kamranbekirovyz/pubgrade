import * as vscode from 'vscode';
import { ChangelogService } from './changelogService';
import { ProgressTracker } from './core/progress';
import { Package } from './core/types';
import { PackageService } from './packageService';
import { PubDevApi } from './pub/pubDevApi';
import { ChangelogPanel, UpdateTarget } from './ui/changelogPanel';
import { PackageItem, PackagesTree } from './ui/packagesTree';
import { setBadge, StatusBar } from './ui/statusBar';
import { disposeTerminal } from './workspace';

/**
 * Wiring only: build the pieces, register the commands, keep the views in
 * sync. All the thinking lives in `core/`, `packageService` and `pub/`.
 */
export function activate(context: vscode.ExtensionContext) {
  const api = new PubDevApi();
  const packages = new PackageService(api);
  const changelogs = new ChangelogService(api);

  const tree = new PackagesTree(packages);
  const view = vscode.window.createTreeView('pubgradePackages', { treeDataProvider: tree });
  const statusBar = new StatusBar();
  const panel = new ChangelogPanel((target, version) => update(target, version));

  function render(): void {
    tree.refresh();
    statusBar.show(packages.outdatedCount);
    setBadge(view, packages.outdatedCount);
  }

  function update(target: UpdateTarget, version: string): void {
    try {
      if (packages.update(target.pubspecPath, target.packageName, version)) {
        render();
      } else {
        vscode.window.showWarningMessage(
          `Could not find ${target.packageName} in ${target.pubspecPath}`
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update ${target.packageName}: ${error}`);
    }
  }

  async function refresh(): Promise<void> {
    changelogs.clearCache();
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Pubgrade', cancellable: false },
        progress => packages.refresh({ report: reporter(progress) })
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to refresh packages: ${error}`);
    }
    render();
  }

  async function openChangelog(pkg: Package, pubspecPath: string): Promise<void> {
    try {
      const request = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Fetching changelog for ${pkg.name}...`,
          cancellable: false
        },
        () => changelogs.load(pkg)
      );
      panel.show(request, { pubspecPath, packageName: pkg.name });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to fetch changelog for ${pkg.name}: ${error}`);
    }
  }

  context.subscriptions.push(
    view,
    statusBar,
    { dispose: () => panel.dispose() },
    { dispose: disposeTerminal },

    vscode.commands.registerCommand('pubgrade.refresh', refresh),

    // Clicking a row: outdated packages open their changelog, the rest just say so.
    vscode.commands.registerCommand('pubgrade.open', (item?: PackageItem) => {
      if (!item) return;
      if (item.pkg.isOutdated) return openChangelog(item.pkg, item.pubspecPath);
      vscode.window.showInformationMessage(
        `${item.pkg.name} is up to date (${item.pkg.currentVersion})`
      );
    })
  );

  refresh();
}

/** Feeds ProgressTracker's steps into VS Code's progress API. */
function reporter(progress: vscode.Progress<{ message?: string; increment?: number }>) {
  const tracker = new ProgressTracker();
  return (checked: number, total: number) => progress.report(tracker.step(checked, total));
}

export function deactivate() {}
