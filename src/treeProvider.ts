import * as vscode from 'vscode';
import { PackageInfo, ProjectGroup } from './types';

export class ProjectTreeItem extends vscode.TreeItem {
  constructor(
    public readonly projectGroup: ProjectGroup,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(projectGroup.projectName, collapsibleState);

    this.tooltip = projectGroup.pubspecPath;
    this.contextValue = 'project';
    
    // Set description to show outdated count
    if (projectGroup.outdatedCount > 0) {
      this.description = `${projectGroup.outdatedCount} outdated`;
      this.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('editorWarning.foreground'));
    } else {
      this.description = 'up to date';
      this.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('testing.iconPassed'));
    }
  }
}

export class PackageTreeItem extends vscode.TreeItem {
  constructor(
    public readonly packageInfo: PackageInfo,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(packageInfo.name, collapsibleState);

    if (packageInfo.isOutdated) {
      this.description = `${packageInfo.currentVersion} → ${packageInfo.latestVersion}`;

      // Set icon and tooltip based on update type
      switch (packageInfo.updateType) {
        case 'major':
          this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
          this.tooltip = `Major update available: ${packageInfo.latestVersion} (Breaking changes possible)`;
          break;
        case 'minor':
          this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
          this.tooltip = `Minor update available: ${packageInfo.latestVersion} (New features)`;
          break;
        case 'patch':
          this.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('editorInfo.foreground'));
          this.tooltip = `Patch update available: ${packageInfo.latestVersion} (Bug fixes)`;
          break;
        default:
          this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
          this.tooltip = `Update available: ${packageInfo.latestVersion}`;
      }
    } else {
      this.description = packageInfo.currentVersion;
      this.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
      this.tooltip = 'Up to date';
    }
    
    this.contextValue = packageInfo.isOutdated ? 'outdatedPackage' : 'upToDatePackage';
    
    // Add click command
    this.command = {
      command: 'pubgrade.itemClick',
      title: 'Package Actions',
      arguments: [this]
    };
  }
}

export class PackageTreeProvider implements vscode.TreeDataProvider<ProjectTreeItem | PackageTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ProjectTreeItem | PackageTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  private packages: PackageInfo[] = [];
  private projectGroups: ProjectGroup[] = [];

  setPackages(packages: PackageInfo[]) {
    this.packages = packages;
    this.projectGroups = this.groupPackagesByProject(packages);
    this._onDidChangeTreeData.fire();
  }

  private groupPackagesByProject(packages: PackageInfo[]): ProjectGroup[] {
    const groupMap = new Map<string, PackageInfo[]>();
    
    // Group packages by pubspec path
    for (const pkg of packages) {
      const existing = groupMap.get(pkg.pubspecPath) || [];
      existing.push(pkg);
      groupMap.set(pkg.pubspecPath, existing);
    }

    // Convert to ProjectGroup array
    const groups: ProjectGroup[] = [];
    for (const [pubspecPath, pkgs] of groupMap.entries()) {
      const projectName = pkgs[0].projectName;
      const outdatedCount = pkgs.filter(p => p.isOutdated).length;
      
      groups.push({
        projectName,
        pubspecPath,
        packages: pkgs,
        outdatedCount
      });
    }

    // Sort groups: projects with outdated packages first, then alphabetically
    return groups.sort((a, b) => {
      if (a.outdatedCount > 0 && b.outdatedCount === 0) return -1;
      if (a.outdatedCount === 0 && b.outdatedCount > 0) return 1;
      return a.projectName.localeCompare(b.projectName);
    });
  }

  getOutdatedCount(): number {
    return this.packages.filter(p => p.isOutdated).length;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ProjectTreeItem | PackageTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ProjectTreeItem | PackageTreeItem): Promise<(ProjectTreeItem | PackageTreeItem)[]> {
    if (!element) {
      // Root level: show project groups
      return Promise.resolve(
        this.projectGroups.map(group => 
          new ProjectTreeItem(group, vscode.TreeItemCollapsibleState.Expanded)
        )
      );
    }
    
    if (element instanceof ProjectTreeItem) {
      // Project level: show packages sorted by outdated status
      const sorted = [...element.projectGroup.packages].sort((a, b) => {
        if (a.isOutdated && !b.isOutdated) return -1;
        if (!a.isOutdated && b.isOutdated) return 1;
        return a.name.localeCompare(b.name);
      });
      
      return Promise.resolve(
        sorted.map(pkg => new PackageTreeItem(pkg, vscode.TreeItemCollapsibleState.None))
      );
    }
    
    return Promise.resolve([]);
  }
}

