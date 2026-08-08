package dev.pubgrade.core

/**
 * Just enough of semantic versioning to compare two pub.dev versions.
 *
 * The VS Code client leans on the `semver` npm package for this. There is no
 * equivalent in the IntelliJ platform, so the four things we actually use are
 * implemented here: strict parsing, lenient coercion, ordering, and prerelease
 * precedence. Everything else that library does is unused, so it is not here.
 */
data class SemVer(
    val major: Int,
    val minor: Int,
    val patch: Int,
    /** Dot-separated identifiers after `-`. Empty means a stable release. */
    val prerelease: List<String> = emptyList()
) : Comparable<SemVer> {

    val isPrerelease: Boolean get() = prerelease.isNotEmpty()

    override fun compareTo(other: SemVer): Int {
        major.compareTo(other.major).let { if (it != 0) return it }
        minor.compareTo(other.minor).let { if (it != 0) return it }
        patch.compareTo(other.patch).let { if (it != 0) return it }
        return comparePrerelease(prerelease, other.prerelease)
    }

    override fun toString(): String {
        val core = "$major.$minor.$patch"
        return if (prerelease.isEmpty()) core else "$core-${prerelease.joinToString(".")}"
    }

    companion object {
        /** `1.2.3`, `v1.2.3`, `1.2.3-beta.1+build`. Null for anything else. */
        private val STRICT =
            Regex("""^[v=\s]*(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?\s*$""")

        /** The first version-looking run of digits anywhere in the string. */
        private val LENIENT = Regex("""(\d+)(?:\.(\d+))?(?:\.(\d+))?""")

        /**
         * Null when the whole string is not one plain version. A range such as
         * `>=1.0.0 <2.0.0` or a keyword such as `any` deliberately fails here:
         * we only offer updates for constraints we know how to rewrite safely.
         */
        fun parse(version: String): SemVer? {
            val match = STRICT.matchEntire(version.trim()) ?: return null
            return SemVer(
                major = match.groupValues[1].toIntOrNull() ?: return null,
                minor = match.groupValues[2].toIntOrNull() ?: return null,
                patch = match.groupValues[3].toIntOrNull() ?: return null,
                prerelease = match.groupValues[4]
                    .takeIf { it.isNotEmpty() }
                    ?.split(".")
                    ?: emptyList()
            )
        }

        /**
         * Digs a version out of noisier text: `1.2` becomes `1.2.0`, and a
         * changelog heading such as `1.2.3 - Fixes` still resolves. Prerelease
         * suffixes are dropped, matching what the VS Code client does.
         */
        fun coerce(version: String): SemVer? {
            val match = LENIENT.find(version) ?: return null
            return SemVer(
                major = match.groupValues[1].toIntOrNull() ?: return null,
                minor = match.groupValues[2].toIntOrNull() ?: 0,
                patch = match.groupValues[3].toIntOrNull() ?: 0
            )
        }

        /** A stable release outranks any prerelease of the same numbers. */
        private fun comparePrerelease(a: List<String>, b: List<String>): Int {
            if (a.isEmpty() && b.isEmpty()) return 0
            if (a.isEmpty()) return 1
            if (b.isEmpty()) return -1

            for (i in 0 until minOf(a.size, b.size)) {
                val result = compareIdentifier(a[i], b[i])
                if (result != 0) return result
            }
            return a.size.compareTo(b.size)
        }

        /** Numeric identifiers sort below alphanumeric ones, and numerically. */
        private fun compareIdentifier(a: String, b: String): Int {
            val left = a.toIntOrNull()
            val right = b.toIntOrNull()
            return when {
                left != null && right != null -> left.compareTo(right)
                left != null -> -1
                right != null -> 1
                else -> a.compareTo(b)
            }
        }
    }
}
