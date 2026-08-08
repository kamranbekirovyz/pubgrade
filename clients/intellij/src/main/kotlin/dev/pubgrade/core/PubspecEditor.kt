package dev.pubgrade.core

/**
 * Rewrites a dependency's version in pubspec.yaml text.
 *
 * Text in, text out. We never reserialise the YAML, because that would drop the
 * user's comments, ordering and formatting.
 *
 * Returns null when the dependency line was not found, so the caller can tell
 * "nothing to do" apart from "wrote the file".
 */
fun setDependencyVersion(
    pubspecText: String,
    packageName: String,
    newVersion: String
): String? {
    // The leading [ \t]+ is what keeps us inside dependencies:/dev_dependencies:
    // and away from root-level keys such as `version:` or `name:`.
    // \d\S* matches the version token only, so trailing comments survive.
    val line = Regex(
        """^([ \t]+${Regex.escape(packageName)}:[ \t]*)(\^?)(\d\S*)""",
        RegexOption.MULTILINE
    )

    val match = line.find(pubspecText) ?: return null
    val prefix = match.groupValues[1]
    // Keep the caret if it was there: `^4.0.0` stays a caret constraint.
    val caret = match.groupValues[2]

    return pubspecText.replaceRange(match.range, "$prefix$caret$newVersion")
}
