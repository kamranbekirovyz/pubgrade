import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { EXCLUDE_GLOB } from './core/discovery';

/**
 * Everything that touches the user's machine: finding files, reading and
 * writing them, running `flutter pub get`. Kept in one place so the rest of
 * the extension can stay pure.
 */

/** Every project pubspec.yaml across all open workspace folders, sorted by path. */
export async function findPubspecs(): Promise<string[]> {
  const folders = vscode.workspace.workspaceFolders ?? [];

  const perFolder = await Promise.all(
    folders.map(folder =>
      vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/pubspec.yaml'),
        EXCLUDE_GLOB
      )
    )
  );

  const paths = perFolder.flat().map(uri => uri.fsPath);
  return [...new Set(paths)].sort();
}

/** Null when the file does not exist or cannot be read. */
export function readTextFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function writeTextFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf8');
}

/** The pubspec.lock sitting next to a pubspec.yaml, if there is one. */
export function readLockFile(pubspecPath: string): string | null {
  return readTextFile(path.join(path.dirname(pubspecPath), 'pubspec.lock'));
}

let pubGetTerminal: vscode.Terminal | undefined;
let terminalCwd: string | undefined;

/**
 * Runs `flutter pub get` in the folder that owns `pubspecPath`.
 *
 * The working directory matters: in a monorepo, running it at the workspace
 * root would resolve the wrong project. We set it when creating the terminal
 * rather than sending a `cd` command, because shell syntax differs between
 * PowerShell, cmd and the POSIX shells.
 *
 * The terminal is reused so repeated updates do not pile up tabs, and replaced
 * whenever the target project changes.
 */
export function runPubGet(pubspecPath: string): void {
  const cwd = path.dirname(pubspecPath);

  if (!pubGetTerminal || pubGetTerminal.exitStatus || terminalCwd !== cwd) {
    pubGetTerminal?.dispose();
    pubGetTerminal = vscode.window.createTerminal({ name: 'Pubgrade', cwd });
    terminalCwd = cwd;
  }

  pubGetTerminal.sendText('flutter pub get');
  pubGetTerminal.show();
}

export function disposeTerminal(): void {
  pubGetTerminal?.dispose();
  pubGetTerminal = undefined;
  terminalCwd = undefined;
}
