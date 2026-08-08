package dev.pubgrade

import dev.pubgrade.core.setDependencyVersion
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

private val PUBSPEC = listOf(
    "name: my_app",
    "version: 1.0.0+1",
    "",
    "dependencies:",
    "  http: ^1.2.0",
    "  provider: 6.0.5",
    "  dio: ^5.0.0 # networking",
    "",
    "dev_dependencies:",
    "  build_runner: ^2.4.0",
    ""
).joinToString("\n")

class SetDependencyVersionTest {

    @Test
    fun `keeps a caret constraint a caret constraint`() {
        assertTrue(setDependencyVersion(PUBSPEC, "http", "1.3.0")!!.contains("  http: ^1.3.0"))
    }

    @Test
    fun `keeps an exact pin exact`() {
        val updated = setDependencyVersion(PUBSPEC, "provider", "6.1.0")!!
        assertTrue(updated.contains("  provider: 6.1.0"))
        assertFalse(updated.contains("^6.1.0"))
    }

    @Test
    fun `updates dev dependencies too`() {
        assertTrue(
            setDependencyVersion(PUBSPEC, "build_runner", "2.5.0")!!
                .contains("  build_runner: ^2.5.0")
        )
    }

    @Test
    fun `leaves trailing comments alone`() {
        assertTrue(
            setDependencyVersion(PUBSPEC, "dio", "5.4.0")!!.contains("  dio: ^5.4.0 # networking")
        )
    }

    @Test
    fun `changes nothing else in the file`() {
        val updated = setDependencyVersion(PUBSPEC, "http", "1.3.0")!!
        assertEquals(PUBSPEC.lines().size, updated.lines().size)
        assertTrue(updated.contains("name: my_app"))
        assertTrue(updated.contains("  provider: 6.0.5"))
    }

    @Test
    fun `never touches root-level keys that share a name`() {
        val yaml = "version: 1.0.0\n\ndependencies:\n  version: 2.0.0\n"
        assertEquals(
            "version: 1.0.0\n\ndependencies:\n  version: 3.0.0\n",
            setDependencyVersion(yaml, "version", "3.0.0")
        )
    }

    @Test
    fun `returns null when the dependency is not there`() {
        assertNull(setDependencyVersion(PUBSPEC, "missing_pkg", "1.0.0"))
    }

    @Test
    fun `returns null for dependencies with no inline version`() {
        assertNull(setDependencyVersion("dependencies:\n  flutter:\n    sdk: flutter\n", "flutter", "1.0.0"))
    }

    @Test
    fun `treats the package name as text, not as a pattern`() {
        val yaml = "dependencies:\n  a.b: 1.0.0\n  axb: 2.0.0\n"
        val updated = setDependencyVersion(yaml, "a.b", "1.1.0")!!
        assertTrue(updated.contains("  a.b: 1.1.0"))
        assertTrue(updated.contains("  axb: 2.0.0"))
    }
}
