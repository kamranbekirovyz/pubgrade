/**
 * Which folders are never a user's project.
 *
 * Every one of these can contain a pubspec.yaml that is not the thing the user
 * is working on: build output, generated tool caches, the plugin copies under
 * the platform folders, and the Flutter SDK that FVM checks out into `.fvm/`.
 * Listing them here is what stops the sidebar filling up with noise.
 */
export const EXCLUDED_DIRS = [
  'build',
  '.dart_tool',
  '.symlinks',
  '.plugin_symlinks',
  '.fvm',
  'ios',
  'android',
  'web',
  'macos',
  'linux',
  'windows'
] as const;

/** The exclude glob handed to the editor's file search. */
export const EXCLUDE_GLOB = `{${EXCLUDED_DIRS.map(dir => `**/${dir}/**`).join(',')}}`;

/** True when a path lies inside any excluded folder. Uses `/` or `\` separators. */
export function isExcluded(filePath: string): boolean {
  const segments = filePath.split(/[/\\]/);
  return EXCLUDED_DIRS.some(dir => segments.includes(dir));
}
