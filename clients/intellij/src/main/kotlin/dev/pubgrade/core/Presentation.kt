package dev.pubgrade.core

/**
 * What each update type means to the reader. Red asks for care, blue is safe.
 *
 * The VS Code client stores the theme's icon and colour ids here too. Those are
 * editor-specific names, so on this side they live in the UI layer and only the
 * wording stays shared.
 */
val UPDATE_NOTES: Map<UpdateType, String> = mapOf(
    UpdateType.MAJOR to "Breaking changes possible",
    UpdateType.MINOR to "New features",
    UpdateType.PATCH to "Bug fixes",
    UpdateType.NONE to ""
)

/** The tooltip shown on an outdated package. */
fun updateTooltip(pkg: Package): String {
    val note = UPDATE_NOTES[pkg.updateType].orEmpty()
    val kind = pkg.updateType.name.lowercase().replaceFirstChar { it.uppercase() }
    return if (note.isNotEmpty()) {
        "$kind update available: ${pkg.latestVersion} ($note)"
    } else {
        "Update available: ${pkg.latestVersion}"
    }
}

/** Outdated first, then alphabetical. The reason to open the panel is on top. */
val byOutdatedThenName: Comparator<Package> =
    compareByDescending<Package> { it.isOutdated }.thenBy { it.name }

/** Same idea one level up: the project with the most work to do goes first. */
val byOutdatedCountThenName: Comparator<Project> =
    compareByDescending<Project> { countOutdated(it) }.thenBy { it.name }

fun countOutdated(project: Project): Int = project.packages.count { it.isOutdated }

fun pluralPackages(count: Int): String = if (count == 1) "package" else "packages"
