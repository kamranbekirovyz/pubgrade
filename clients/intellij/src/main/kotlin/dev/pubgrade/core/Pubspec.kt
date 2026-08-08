package dev.pubgrade.core

/** Provided by the Flutter SDK, never on pub.dev. */
private val SDK_PACKAGES = setOf("flutter", "flutter_test")

/**
 * Reads `dependencies:` and `dev_dependencies:` out of pubspec.yaml text.
 *
 * Only plain string constraints are returned. Entries written as a map
 * (`git:`, `path:`, `sdk:`, `hosted:`) have no pub.dev version to compare
 * against, so they are skipped.
 */
fun parseDependencies(pubspecText: String): List<Dependency> {
    val doc = parseYaml(pubspecText)
    return collect(doc.child("dependencies"), isDev = false) +
        collect(doc.child("dev_dependencies"), isDev = true)
}

private fun collect(section: YamlNode?, isDev: Boolean): List<Dependency> =
    section.asMapping().mapNotNull { (name, node) ->
        if (name in SDK_PACKAGES) return@mapNotNull null
        val constraint = node.asScalar() ?: return@mapNotNull null
        Dependency(
            name = name,
            constraint = constraint,
            isDev = isDev,
            hasCaret = constraint.trimStart().startsWith("^")
        )
    }

/** The `name:` field of pubspec.yaml, or null when it is missing or malformed. */
fun parseProjectName(pubspecText: String): String? =
    parseYaml(pubspecText).child("name").asScalar()?.takeIf { it.isNotEmpty() }

/**
 * Reads pubspec.lock into `package name -> resolved version`.
 *
 * This is what is actually installed. For a caret constraint like `^1.2.0` the
 * lock file may say `1.4.0`, and comparing against `1.2.0` would report an
 * update the user already has.
 */
fun parseLockedVersions(lockText: String): Map<String, String> {
    val packages = parseYaml(lockText).child("packages").asMapping()
    return packages.mapNotNull { (name, info) ->
        val version = info.child("version").asScalar() ?: return@mapNotNull null
        name to version
    }.toMap()
}

/**
 * The version to compare against pub.dev.
 *
 * For a caret constraint the pubspec only states a floor: `^1.2.0` may well
 * have resolved to `1.4.0`. Using the constraint would report updates the user
 * already has, so the lock file wins whenever it has an answer. An exact pin
 * means what it says, and always uses the constraint.
 */
fun currentVersionOf(dependency: Dependency, lockedVersions: Map<String, String>): String {
    val locked = lockedVersions[dependency.name]
    if (dependency.hasCaret && locked != null) return locked
    return stripConstraint(dependency.constraint)
}
