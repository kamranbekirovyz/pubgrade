package dev.pubgrade.core

/**
 * Domain model. Plain data only, no behaviour, no IntelliJ, no I/O.
 */

/** How big the jump from the installed version to the latest one is. */
enum class UpdateType { MAJOR, MINOR, PATCH, NONE }

/** A single entry under `dependencies:` or `dev_dependencies:` in pubspec.yaml. */
data class Dependency(
    val name: String,
    /** The constraint exactly as written, e.g. `^1.2.3` or `1.2.3`. */
    val constraint: String,
    val isDev: Boolean,
    /** True when the constraint starts with `^`. Decides how we write updates back. */
    val hasCaret: Boolean
)

/** A dependency after we have asked pub.dev what the latest version is. */
data class Package(
    val name: String,
    /** The version actually in use: from pubspec.lock when available, else the constraint. */
    var currentVersion: String,
    val latestVersion: String,
    var isOutdated: Boolean,
    var updateType: UpdateType
)

/** One pubspec.yaml and everything it depends on. A monorepo has several. */
data class Project(
    val name: String,
    val pubspecPath: String,
    val packages: List<Package>
)

/** One `## 1.2.3` block of a changelog. */
data class ChangelogSection(
    val version: String,
    /** Plain-text body of the section, without the version heading. */
    val body: String
)
