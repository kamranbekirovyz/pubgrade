package dev.pubgrade.core

/**
 * Which folders are never a user's project.
 *
 * Every one of these can contain a pubspec.yaml that is not the thing the user
 * is working on: build output, generated tool caches, the plugin copies under
 * the platform folders, and the Flutter SDK that FVM checks out into `.fvm/`.
 * Listing them here is what stops the tool window filling up with noise.
 */
val EXCLUDED_DIRS = listOf(
    "build",
    ".dart_tool",
    ".symlinks",
    ".plugin_symlinks",
    ".fvm",
    "ios",
    "android",
    "web",
    "macos",
    "linux",
    "windows"
)

/** True when a path lies inside any excluded folder. Uses `/` or `\` separators. */
fun isExcluded(filePath: String): Boolean {
    val segments = filePath.split('/', '\\')
    return EXCLUDED_DIRS.any { it in segments }
}
