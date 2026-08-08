package dev.pubgrade

import dev.pubgrade.core.SemVer
import dev.pubgrade.core.UpdateType
import dev.pubgrade.core.formatRelativeTime
import dev.pubgrade.core.isInRange
import dev.pubgrade.core.isOutdated
import dev.pubgrade.core.stripConstraint
import dev.pubgrade.core.updateType
import java.time.Duration
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class StripConstraintTest {

    @Test
    fun `drops the operators we know how to rewrite`() {
        assertEquals("1.2.3", stripConstraint("^1.2.3"))
        assertEquals("2.0.0", stripConstraint(">=2.0.0"))
        assertEquals("1.2.3", stripConstraint("1.2.3"))
        assertEquals("1.2.3", stripConstraint("  ^1.2.3  "))
    }

    @Test
    fun `leaves ranges unparseable on purpose, so we never guess at them`() {
        assertFalse(isOutdated(stripConstraint(">=1.0.0 <2.0.0"), "3.0.0"))
        assertFalse(isOutdated(stripConstraint("any"), "3.0.0"))
    }
}

class SemVerTest {

    @Test
    fun `parses only a whole plain version`() {
        assertEquals(SemVer(1, 2, 3), SemVer.parse("1.2.3"))
        assertEquals(SemVer(1, 2, 3), SemVer.parse("v1.2.3"))
        assertEquals(SemVer(1, 2, 3), SemVer.parse(" 1.2.3 "))
        assertEquals(SemVer(1, 2, 3), SemVer.parse("1.2.3+build.7"))
        assertNull(SemVer.parse("1.2"))
        assertNull(SemVer.parse("any"))
        assertNull(SemVer.parse(">=1.0.0 <2.0.0"))
        assertNull(SemVer.parse("1.2.3 - Monorepo Support"))
    }

    @Test
    fun `orders prereleases below the release they lead to`() {
        assertTrue(SemVer.parse("1.0.0-beta.1")!! < SemVer.parse("1.0.0")!!)
        assertTrue(SemVer.parse("1.0.0-alpha")!! < SemVer.parse("1.0.0-beta")!!)
        assertTrue(SemVer.parse("1.0.0-beta.2")!! < SemVer.parse("1.0.0-beta.11")!!)
        assertTrue(SemVer.parse("1.0.0-1")!! < SemVer.parse("1.0.0-alpha")!!)
    }

    @Test
    fun `coerce digs a version out of looser text`() {
        assertEquals(SemVer(1, 2, 0), SemVer.coerce("1.2"))
        assertEquals(SemVer(1, 0, 0), SemVer.coerce("v1"))
        assertEquals(SemVer(2, 0, 0), SemVer.coerce("2.0.0 - Monorepo Support"))
        assertNull(SemVer.coerce("nonsense"))
    }
}

class IsOutdatedTest {

    @Test
    fun `compares semantically, not as text`() {
        assertTrue(isOutdated("1.9.0", "1.10.0"))
        assertFalse(isOutdated("2.0.0", "2.0.0"))
        assertFalse(isOutdated("2.1.0", "2.0.0"))
    }

    @Test
    fun `treats prereleases as older than the release`() {
        assertTrue(isOutdated("1.0.0-beta.1", "1.0.0"))
        assertFalse(isOutdated("1.0.0", "1.0.0-beta.1"))
    }

    @Test
    fun `says no when either side is not a version`() {
        assertFalse(isOutdated("any", "1.0.0"))
        assertFalse(isOutdated("1.0.0", ""))
    }
}

class UpdateTypeTest {

    @Test
    fun `names the size of the jump`() {
        assertEquals(UpdateType.MAJOR, updateType("1.0.0", "2.0.0"))
        assertEquals(UpdateType.MINOR, updateType("1.0.0", "1.1.0"))
        assertEquals(UpdateType.PATCH, updateType("1.0.0", "1.0.1"))
        assertEquals(UpdateType.NONE, updateType("1.0.0", "1.0.0"))
    }

    @Test
    fun `reports nothing for downgrades and unparseable versions`() {
        assertEquals(UpdateType.NONE, updateType("2.0.0", "1.0.0"))
        assertEquals(UpdateType.NONE, updateType("any", "1.0.0"))
    }

    @Test
    fun `reports the highest changed component`() {
        assertEquals(UpdateType.MAJOR, updateType("1.2.3", "2.0.1"))
        assertEquals(UpdateType.MINOR, updateType("1.2.3", "1.3.0"))
    }
}

class IsInRangeTest {

    @Test
    fun `covers what an update would actually bring in`() {
        assertTrue(isInRange("1.1.0", "1.0.0", "2.0.0"))
        assertTrue(isInRange("2.0.0", "1.0.0", "2.0.0")) // inclusive at the top
        assertFalse(isInRange("1.0.0", "1.0.0", "2.0.0")) // exclusive at the bottom
        assertFalse(isInRange("2.0.1", "1.0.0", "2.0.0"))
    }

    @Test
    fun `accepts versions written loosely in changelogs`() {
        assertTrue(isInRange("v1.5.0", "1.0.0", "2.0.0"))
        assertFalse(isInRange("nonsense", "1.0.0", "2.0.0"))
    }
}

class FormatRelativeTimeTest {

    private val now: Instant = Instant.parse("2025-06-15T12:00:00Z")

    private fun ago(duration: Duration) = formatRelativeTime(now.minus(duration), now)

    @Test
    fun `picks the largest unit that fits`() {
        assertEquals("just now", ago(Duration.ofSeconds(30)))
        assertEquals("5 minutes ago", ago(Duration.ofMinutes(5)))
        assertEquals("3 hours ago", ago(Duration.ofHours(3)))
        assertEquals("3 days ago", ago(Duration.ofDays(3)))
        assertEquals("2 months ago", ago(Duration.ofDays(60)))
        assertEquals("2 years ago", ago(Duration.ofDays(800)))
    }

    @Test
    fun `does not say 1 days ago`() {
        assertEquals("1 minute ago", ago(Duration.ofMinutes(1)))
        assertEquals("1 day ago", ago(Duration.ofDays(1)))
    }

    @Test
    fun `never reports 0 years ago for dates just under a year`() {
        assertEquals("12 months ago", ago(Duration.ofDays(362)))
    }
}
