import * as vscode from 'vscode';
import * as path from 'path';
import { PubspecParser } from './pubspecParser';
import { PubDevClient } from './pubdevClient';
import { PackageTreeProvider } from './treeProvider';
import { ChangelogView } from './changelogView';
import { Updater } from './updater';
import { PackageInfo } from './types';

let treeProvider: PackageTreeProvider;
let statusBarItem: vscode.StatusBarItem;
let treeView: vscode.TreeView<any>;

export function activate(context: vscode.ExtensionContext) {
  console.log('Flutter Pubgrade extension activated');

  // Initialize tree provider
  treeProvider = new PackageTreeProvider();
  treeView = vscode.window.createTreeView('pubgradePackages', {
    treeDataProvider: treeProvider
  });

  // Status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'pubgrade.refresh';
  context.subscriptions.push(statusBarItem);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('pubgrade.refresh', () => refreshPackages())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pubgrade.updatePackage', async (item: any) => {
      if (item && item.packageInfo) {
        const success = await Updater.updatePackage(
          item.packageInfo.pubspecPath,
          item.packageInfo.name,
          item.packageInfo.latestVersion
        );
        if (success) {
          setTimeout(() => refreshPackages(), 1000);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pubgrade.showChangelog', async (item: any) => {
      if (item && item.packageInfo) {
        await showChangelogAsDocument(item.packageInfo);
      }
    })
  );

  // Add click handler for tree items
  context.subscriptions.push(
    vscode.commands.registerCommand('pubgrade.itemClick', async (item: any) => {
      if (!item.packageInfo.isOutdated) {
        vscode.window.showInformationMessage(`${item.packageInfo.name} is up to date (${item.packageInfo.currentVersion})`);
        return;
      }
      
      // Directly show changelog
      await showChangelogAsDocument(item.packageInfo);
    })
  );

  // Auto-refresh on activation
  refreshPackages();
}

interface PubspecInfo {
  path: string;
  projectName: string;
}

async function discoverAllPubspecs(): Promise<PubspecInfo[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage('No workspace folder open');
    return [];
  }

  // Find all pubspec.yaml files (VS Code automatically excludes files.exclude and search.exclude patterns)
  // Explicitly exclude .fvm directory used by Flutter Version Management
  const pubspecFiles = await vscode.workspace.findFiles(
    '**/pubspec.yaml',
    '**/.fvm/**'
  );

  // Map to PubspecInfo with project names
  const pubspecs: PubspecInfo[] = pubspecFiles.map((uri: vscode.Uri) => {
    const fsPath = uri.fsPath;
    const dirName = path.dirname(fsPath);
    const projectName = path.basename(dirName);
    
    return {
      path: fsPath,
      projectName: projectName
    };
  });

  return pubspecs;
}

async function processPackageBatch(
  dependencies: any[], 
  startIndex: number, 
  batchSize: number, 
  pubspecPath: string, 
  projectName: string
): Promise<PackageInfo[]> {
  const batch = dependencies.slice(startIndex, startIndex + batchSize);
  const promises = batch.map(async (dep) => {
    const cleanVersion = PubspecParser.cleanVersion(dep.version);
    const latestVersion = await PubDevClient.getLatestVersion(dep.name);

    if (latestVersion) {
      const isOutdated = PubDevClient.isOutdated(cleanVersion, latestVersion);
      const updateType = PubDevClient.getUpdateType(cleanVersion, latestVersion);
      
      return {
        name: dep.name,
        currentVersion: cleanVersion,
        latestVersion: latestVersion,
        isOutdated: isOutdated,
        updateType: updateType,
        pubspecPath: pubspecPath,
        projectName: projectName
      };
    }
    return null;
  });

  const results = await Promise.all(promises);
  return results.filter((pkg): pkg is PackageInfo => pkg !== null);
}

async function refreshPackages() {
  const pubspecs = await discoverAllPubspecs();
  if (pubspecs.length === 0) {
    vscode.window.showWarningMessage('No pubspec.yaml files found in workspace');
    return;
  }

  try {
    // Clear badge while loading
    treeView.badge = undefined;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Pubgrade:',
        cancellable: false
      },
      async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        const allPackages: PackageInfo[] = [];
        let totalDependencies = 0;
        let processedDependencies = 0;

        // First, count total dependencies across all pubspecs
        const pubspecDependencies = pubspecs.map(pubspec => ({
          pubspec,
          dependencies: PubspecParser.parse(pubspec.path)
        }));

        totalDependencies = pubspecDependencies.reduce((sum, pd) => sum + pd.dependencies.length, 0);

        // Process each pubspec
        for (const { pubspec, dependencies } of pubspecDependencies) {
          const batchSize = 4;
          const totalBatches = Math.ceil(dependencies.length / batchSize);

          for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const startIndex = batchIndex * batchSize;
            const endIndex = Math.min(startIndex + batchSize, dependencies.length);
            const actualBatchSize = endIndex - startIndex;
            
            progress.report({
              message: `${processedDependencies + actualBatchSize} of ${totalDependencies} packages checked`,
              increment: (actualBatchSize / totalDependencies) * 100
            });

            const batchResults = await processPackageBatch(
              dependencies, 
              startIndex, 
              batchSize,
              pubspec.path,
              pubspec.projectName
            );
            allPackages.push(...batchResults);
            processedDependencies += actualBatchSize;
          }
        }

        treeProvider.setPackages(allPackages);
        updateBadge();
        updateStatusBar();
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to parse pubspec files: ${error}`);
    treeView.badge = undefined;
  }
}

function updateBadge() {
  const outdatedCount = treeProvider.getOutdatedCount();
  if (outdatedCount > 0) {
    treeView.badge = {
      tooltip: `${outdatedCount} outdated package${outdatedCount > 1 ? 's' : ''}`,
      value: outdatedCount
    };
  } else {
    treeView.badge = undefined;
  }
}

function updateStatusBar() {
  const outdatedCount = treeProvider.getOutdatedCount();
  if (outdatedCount > 0) {
    statusBarItem.text = `$(warning) ${outdatedCount} outdated package${outdatedCount > 1 ? 's' : ''}`;
    statusBarItem.show();
  } else {
    statusBarItem.text = `$(check) All packages up to date`;
    statusBarItem.show();
  }
}

async function showChangelogAsDocument(packageInfo: PackageInfo) {
  try {
    const changelog = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Fetching changelog for ${packageInfo.name}...`,
        cancellable: false
      },
      async () => {
        return await PubDevClient.getChangelog(
          packageInfo.name,
          packageInfo.currentVersion,
          packageInfo.latestVersion
        );
      }
    );

    ChangelogView.show(
      packageInfo.name, 
      changelog, 
      packageInfo.currentVersion, 
      packageInfo.latestVersion,
      async (packageName: string, version: string) => {
        // Handle update button click - use pubspecPath from packageInfo
        const success = await Updater.updatePackage(packageInfo.pubspecPath, packageName, version);
        if (success) {
          setTimeout(() => refreshPackages(), 1000);
        }
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to fetch changelog: ${error}`);
  }
}

export function deactivate() {}
