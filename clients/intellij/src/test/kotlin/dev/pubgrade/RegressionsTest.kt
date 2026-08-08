/**
 * Behaviour that was wrong once and got fixed. Each test here exists because a
 * user hit the bug on the VS Code client. If one starts failing here, the same
 * bug has been ported along with the feature.
 */
package dev.pubgrade

import dev.pubgrade.core.CONCURRENT_REQUESTS
import dev.pubgrade.core.Dependency
import dev.pubgrade.core.EXCLUDED_DIRS
import dev.pubgrade.core.Package
import dev.pubgrade.core.Project
import dev.pubgrade.core.UPDATE_NOTES
import dev.pubgrade.core.UpdateType
import dev.pubgrade.core.byOutdatedCountThenName
import dev.pubgrade.core.byOutdatedThenName
import dev.pubgrade.core.currentVersionOf
import dev.pubgrade.core.isExcluded
import dev.pubgrade.core.mapWithLimit
import dev.pubgrade.core.progressStep
import dev.pubgrade.core.updateTooltip
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private fun pkg(
    name: String,
    isOutdated: Boolean = false,
    updateType: UpdateType = UpdateType.NONE,
    latestVersion: String = "1.0.0"
) = Package(name, "1.0.0", latestVersion, isOutdated, updateType)

private fun dep(constraint: String = "^1.2.0", hasCaret: Boolean = true) =
    Dependency("http", constraint, isDev = false, hasCaret = hasCaret)

private fun project(name: String, packages: List<Package>) =
    Project(name, "/$name/pubspec.yaml", packages)

class PubspecScanningTest {

    // The list used to fill with the Flutter SDK's own pubspecs when FVM was in
    // use, and with plugin copies under the platform folders.
    @Test
    fun `excludes the FVM SDK checkout`() {
        assertTrue(".fvm" in EXCLUDED_DIRS)
        assertTrue(isExcluded("/repo/.fvm/flutter_sdk/packages/flutter/pubspec.yaml"))
    }

    @Test
    fun `excludes generated output and platform folders`() {
        for (dir in listOf("build", ".dart_tool", ".symlinks", ".plugin_symlinks")) {
            assertTrue(isExcluded("/repo/$dir/pubspec.yaml"), dir)
        }
        for (dir in listOf("ios", "android", "web", "macos", "linux", "windows")) {
            assertTrue(isExcluded("/repo/$dir/pubspec.yaml"), dir)
        }
    }

    @Test
    fun `keeps real project pubspecs, including nested monorepo packages`() {
        assertFalse(isExcluded("/repo/pubspec.yaml"))
        assertFalse(isExcluded("/repo/packages/core/pubspec.yaml"))
        assertFalse(isExcluded("C:\\repo\\apps\\admin\\pubspec.yaml"))
    }

    @Test
    fun `is not fooled by a folder whose name merely contains an excluded one`() {
        assertFalse(isExcluded("/repo/website/pubspec.yaml"))
        assertFalse(isExcluded("/repo/android_utils/pubspec.yaml"))
    }
}

class LockFileWinsTest {

    // Before this, `^1.2.0` resolved to 1.4.0 was still reported as "1.2.0,
    // update available" even though the user already had the newest version.
    private val locked = mapOf("http" to "1.4.0")

    @Test
    fun `uses the resolved version for a caret constraint`() {
        assertEquals("1.4.0", currentVersionOf(dep("^1.2.0", hasCaret = true), locked))
    }

    @Test
    fun `uses the constraint for an exact pin, even when the lock file differs`() {
        assertEquals("1.2.0", currentVersionOf(dep("1.2.0", hasCaret = false), locked))
    }

    @Test
    fun `falls back to the constraint when the lock file has no entry`() {
        assertEquals("1.2.0", currentVersionOf(dep("^1.2.0"), emptyMap()))
    }
}

class ProgressTest {

    @Test
    fun `fills the bar from empty to full`() {
        assertEquals(0.0, progressStep(0, 7).fraction)
        assertEquals(1.0, progressStep(7, 7).fraction)
    }

    @Test
    fun `says how many of how many, not just a percentage`() {
        assertEquals("3 of 40 packages checked", progressStep(3, 40).message)
    }

    @Test
    fun `completes immediately when there is nothing to check`() {
        assertEquals(1.0, progressStep(0, 0).fraction)
    }
}

class MapWithLimitTest {

    // Serial checking made a refresh of a large project take minutes.
    @Test
    fun `checks several packages at a time`() {
        assertTrue(CONCURRENT_REQUESTS >= 4)
    }

    @Test
    fun `returns results in input order, not completion order`() {
        val results = mapWithLimit(listOf(1, 2, 3, 4, 5), 2, { value ->
            Thread.sleep((5 - value) * 3L)
            value
        })
        assertEquals(listOf(1, 2, 3, 4, 5), results)
    }

    @Test
    fun `never runs more than the limit at once`() {
        val active = AtomicInteger()
        val peak = AtomicInteger()

        mapWithLimit(listOf(1, 2, 3, 4, 5, 6, 7, 8), 3, {
            peak.accumulateAndGet(active.incrementAndGet(), ::maxOf)
            Thread.sleep(20)
            active.decrementAndGet()
        })

        assertEquals(3, peak.get())
    }

    @Test
    fun `reports progress once per item`() {
        val settled = AtomicInteger()
        mapWithLimit(listOf(1, 2, 3), 2, { it }, { settled.incrementAndGet() })
        assertEquals(3, settled.get())
    }

    @Test
    fun `handles an empty list without hanging`() {
        assertEquals(emptyList(), mapWithLimit(emptyList<Int>(), 4, { it }))
    }

    @Test
    fun `handles fewer items than the limit`() {
        assertEquals(listOf(2, 4), mapWithLimit(listOf(1, 2), 10, { it * 2 }))
    }

    @Test
    fun `turns a failing item into null instead of losing the whole refresh`() {
        val results = mapWithLimit(listOf(1, 2, 3), 2, { value ->
            if (value == 2) error("pub.dev said no") else value
        })
        assertEquals(listOf(1, null, 3), results)
    }
}

class UpdateTypesAreToldApartTest {

    @Test
    fun `gives major, minor and patch their own wording`() {
        val notes = listOf(UpdateType.MAJOR, UpdateType.MINOR, UpdateType.PATCH)
            .map { UPDATE_NOTES.getValue(it) }
        assertEquals(3, notes.toSet().size)
        assertEquals("Breaking changes possible", UPDATE_NOTES.getValue(UpdateType.MAJOR))
    }

    @Test
    fun `explains the risk in the tooltip`() {
        assertEquals(
            "Major update available: 2.0.0 (Breaking changes possible)",
            updateTooltip(pkg("http", updateType = UpdateType.MAJOR, latestVersion = "2.0.0"))
        )
        assertTrue(
            updateTooltip(pkg("http", updateType = UpdateType.PATCH, latestVersion = "1.0.1"))
                .contains("Bug fixes")
        )
    }

    @Test
    fun `still says something useful when the type is unknown`() {
        assertEquals(
            "Update available: 2.0.0",
            updateTooltip(pkg("http", updateType = UpdateType.NONE, latestVersion = "2.0.0"))
        )
    }
}

class SortingTest {

    @Test
    fun `sorts outdated packages first, then alphabetically`() {
        val packages = listOf(
            pkg("zeta"),
            pkg("beta", isOutdated = true),
            pkg("alpha"),
            pkg("alpha_out", isOutdated = true)
        )
        assertEquals(
            listOf("alpha_out", "beta", "alpha", "zeta"),
            packages.sortedWith(byOutdatedThenName).map { it.name }
        )
    }

    @Test
    fun `sorts projects by how many outdated packages they have`() {
        val projects = listOf(
            project("clean", listOf(pkg("a"))),
            project("messy", listOf(pkg("a", isOutdated = true), pkg("b", isOutdated = true))),
            project("some", listOf(pkg("a", isOutdated = true)))
        )
        assertEquals(
            listOf("messy", "some", "clean"),
            projects.sortedWith(byOutdatedCountThenName).map { it.name }
        )
    }

    @Test
    fun `breaks ties on project name`() {
        val projects = listOf(project("b", listOf(pkg("x"))), project("a", listOf(pkg("x"))))
        assertEquals(listOf("a", "b"), projects.sortedWith(byOutdatedCountThenName).map { it.name })
    }
}
