/**
 * Rewrites a dependency's version in pubspec.yaml text.
 *
 * Text in, text out — we never reserialise the YAML, because that would drop
 * the user's comments, ordering and formatting.
 *
 * Returns null when the dependency line was not found, so the caller can tell
 * "nothing to do" apart from "wrote the file".
 */
export function setDependencyVersion(
  pubspecText: string,
  packageName: string,
  newVersion: string
): string | null {
  // The leading [ \t]+ is what keeps us inside dependencies:/dev_dependencies:
  // and away from root-level keys such as `version:` or `name:`.
  // \d\S* matches the version token only, so trailing comments survive.
  const line = new RegExp(`^([ \\t]+${escapeRegExp(packageName)}:[ \\t]*)(\\^?)(\\d\\S*)`, 'm');

  let replaced = false;
  const updated = pubspecText.replace(line, (_match, prefix: string, caret: string) => {
    replaced = true;
    // Keep the caret if it was there: `^4.0.0` stays a caret constraint.
    return `${prefix}${caret}${newVersion}`;
  });

  return replaced ? updated : null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
