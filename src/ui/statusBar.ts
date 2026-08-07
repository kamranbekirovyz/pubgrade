import * as vscode from 'vscode';

/** "3 outdated packages" in the status bar, click to refresh. */
export class StatusBar {
  private readonly item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );

  constructor() {
    this.item.command = 'pubgrade.refresh';
  }

  show(outdatedCount: number): void {
    this.item.text =
      outdatedCount > 0
        ? `$(warning) ${outdatedCount} outdated ${pluralPackages(outdatedCount)}`
        : '$(check) All packages up to date';
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}

/** Badge on the activity bar icon. Hidden when nothing is outdated. */
export function setBadge(view: vscode.TreeView<unknown>, outdatedCount: number): void {
  view.badge =
    outdatedCount > 0
      ? {
          value: outdatedCount,
          tooltip: `${outdatedCount} outdated ${pluralPackages(outdatedCount)}`
        }
      : undefined;
}

function pluralPackages(count: number): string {
  return count === 1 ? 'package' : 'packages';
}
