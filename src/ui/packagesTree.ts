import * as vscode from 'vscode';
import {
  byOutdatedCountThenName,
  byOutdatedThenName,
  countOutdated,
  updateTooltip,
  UPDATE_STYLES
} from '../core/presentation';
import { Package, Project } from '../core/types';
import { PackageService } from '../packageService';

/** A pubspec.yaml. Only shown when the workspace has more than one. */
class ProjectItem extends vscode.TreeItem {
  constructor(readonly project: Project) {
    super(project.name, vscode.TreeItemCollapsibleState.Collapsed);

    const outdated = countOutdated(project);
    this.iconPath = new vscode.ThemeIcon('folder');
    this.description = outdated > 0 ? `${outdated} outdated` : 'all up to date';
    this.contextValue = 'project';
  }
}

/** A single dependency. */
export class PackageItem extends vscode.TreeItem {
  constructor(readonly pkg: Package, readonly pubspecPath: string) {
    super(pkg.name, vscode.TreeItemCollapsibleState.None);

    if (pkg.isOutdated) {
      const style = UPDATE_STYLES[pkg.updateType];
      this.description = `${pkg.currentVersion} → ${pkg.latestVersion}`;
      this.iconPath = new vscode.ThemeIcon(style.icon, new vscode.ThemeColor(style.color));
      this.tooltip = updateTooltip(pkg);
      this.contextValue = 'outdatedPackage';
    } else {
      this.description = pkg.currentVersion;
      this.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
      this.tooltip = 'Up to date';
      this.contextValue = 'upToDatePackage';
    }

    this.command = { command: 'pubgrade.open', title: 'Open', arguments: [this] };
  }
}

type Node = ProjectItem | PackageItem;

export class PackagesTree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly service: PackageService) {}

  refresh(): void {
    this.changed.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    return node;
  }

  getChildren(node?: Node): Node[] {
    if (node instanceof PackageItem) return [];
    if (node instanceof ProjectItem) return packageItems(node.project);

    // A single project shows a flat package list; a monorepo groups by project.
    const projects = this.service.all;
    if (projects.length === 1) return packageItems(projects[0]);

    return [...projects].sort(byOutdatedCountThenName).map(project => new ProjectItem(project));
  }
}

function packageItems(project: Project): PackageItem[] {
  return [...project.packages]
    .sort(byOutdatedThenName)
    .map(pkg => new PackageItem(pkg, project.pubspecPath));
}
