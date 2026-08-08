package dev.pubgrade

import dev.pubgrade.core.parseDependencies
import dev.pubgrade.core.parseLockedVersions
import dev.pubgrade.core.parseProjectName
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

private val PUBSPEC = """
name: my_app
version: 1.0.0+1

environment:
  sdk: ">=3.0.0 <4.0.0"

dependencies:
  flutter:
    sdk: flutter
  http: ^1.2.0
  provider: 6.0.5
  my_fork:
    git:
      url: https://github.com/me/my_fork.git
  local_pkg:
    path: ../local_pkg

dev_dependencies:
  flutter_test:
    sdk: flutter
  build_runner: ^2.4.0
""".trimIndent()

class ParseDependenciesTest {

    private val byName = parseDependencies(PUBSPEC).associateBy { it.name }

    @Test
    fun `reads both dependency sections`() {
        assertEquals(listOf("build_runner", "http", "provider"), byName.keys.sorted())
        assertTrue(byName.getValue("build_runner").isDev)
        assertFalse(byName.getValue("http").isDev)
    }

    @Test
    fun `skips SDK packages, which are not on pub dev`() {
        assertFalse("flutter" in byName)
        assertFalse("flutter_test" in byName)
    }

    @Test
    fun `skips git and path dependencies, which have no pub dev version`() {
        assertFalse("my_fork" in byName)
        assertFalse("local_pkg" in byName)
    }

    @Test
    fun `records whether the constraint is a caret`() {
        assertEquals("^1.2.0", byName.getValue("http").constraint)
        assertTrue(byName.getValue("http").hasCaret)
        assertEquals("6.0.5", byName.getValue("provider").constraint)
        assertFalse(byName.getValue("provider").hasCaret)
    }

    @Test
    fun `returns nothing rather than throwing on broken input`() {
        assertEquals(emptyList(), parseDependencies("this: is: not: yaml:"))
        assertEquals(emptyList(), parseDependencies(""))
        assertEquals(emptyList(), parseDependencies("name: only"))
    }

    @Test
    fun `keeps a constraint that carries a trailing comment out of the version`() {
        val deps = parseDependencies("dependencies:\n  dio: ^5.0.0 # networking\n")
        assertEquals("^5.0.0", deps.single().constraint)
    }
}

class ParseProjectNameTest {

    @Test
    fun `reads the name field`() {
        assertEquals("my_app", parseProjectName(PUBSPEC))
    }

    @Test
    fun `returns null when there is nothing usable`() {
        assertNull(parseProjectName("dependencies:\n  http: ^1.0.0"))
        assertNull(parseProjectName("name:\n  - not a string"))
        assertNull(parseProjectName("%%% broken"))
    }
}

class ParseLockedVersionsTest {

    private val lock = """
        packages:
          http:
            dependency: "direct main"
            source: hosted
            version: "1.4.0"
          meta:
            dependency: transitive
            source: hosted
            version: "1.15.0"
          broken:
            dependency: transitive
        sdks:
          dart: ">=3.0.0"
    """.trimIndent()

    @Test
    fun `maps every package to its resolved version`() {
        val versions = parseLockedVersions(lock)
        assertEquals("1.4.0", versions["http"])
        assertEquals("1.15.0", versions["meta"])
    }

    @Test
    fun `ignores entries without a version`() {
        assertFalse("broken" in parseLockedVersions(lock))
    }

    @Test
    fun `returns an empty map for missing or broken lock files`() {
        assertEquals(0, parseLockedVersions("").size)
        assertEquals(0, parseLockedVersions("sdks:\n  dart: \"3.0.0\"").size)
        assertEquals(0, parseLockedVersions("%%% broken").size)
    }
}
