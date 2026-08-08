package dev.pubgrade

import dev.pubgrade.core.ChangelogSection
import dev.pubgrade.core.extractChangelogText
import dev.pubgrade.core.htmlToText
import dev.pubgrade.core.parseSections
import dev.pubgrade.core.selectRange
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HtmlToTextTest {

    @Test
    fun `keeps headings and bullets readable`() {
        val text = htmlToText("<h2>1.2.0</h2><ul><li>Added a thing</li><li>Fixed a thing</li></ul>")
        assertTrue(text.contains("## 1.2.0"))
        assertTrue(text.contains("- Added a thing"))
        assertTrue(text.contains("- Fixed a thing"))
    }

    @Test
    fun `drops scripts, styles and leftover tags`() {
        assertEquals("hi", htmlToText("<script>alert(1)</script><style>p{}</style><p><b>hi</b></p>"))
    }

    @Test
    fun `decodes entities without double-decoding`() {
        assertEquals("a &lt; b", htmlToText("<p>a &amp;lt; b</p>"))
        assertEquals("1 < 2 && 3 > 2", htmlToText("<p>1 &lt; 2 &amp;&amp; 3 &gt; 2</p>"))
    }
}

class ExtractChangelogTextTest {

    @Test
    fun `prefers the pub dev changelog container`() {
        val html = """
            <main>
              <section>
                <div class="detail-tabs-content">
                  <h2>2.0.0</h2><ul><li>A much longer entry so it passes the length check</li></ul>
                </div>
              </section>
            </main>
        """.trimIndent()
        assertTrue(extractChangelogText(html).contains("## 2.0.0"))
    }

    @Test
    fun `falls back to main when the container markup changes`() {
        val html = "<main><h2>1.0.0</h2><p>First release of this rather nice package.</p></main>"
        assertTrue(extractChangelogText(html).contains("## 1.0.0"))
    }

    @Test
    fun `returns empty string when nothing looks like a changelog`() {
        assertEquals("", extractChangelogText("<html><body>nope</body></html>"))
    }
}

class ParseSectionsTest {

    @Test
    fun `splits on the heading styles authors actually use`() {
        val text = listOf(
            "## 3.0.0",
            "- breaking change",
            "# v2.1.0",
            "- a feature",
            "## [2.0.0]",
            "- older",
            "v1.9.0",
            "- oldest"
        ).joinToString("\n")

        assertEquals(
            listOf("3.0.0", "2.1.0", "2.0.0", "1.9.0"),
            parseSections(text).map { it.version }
        )
    }

    @Test
    fun `keeps a title after the version out of the version itself`() {
        assertEquals(
            ChangelogSection("2.0.0", "- stuff"),
            parseSections("## 2.0.0 - Monorepo Support\n- stuff").first()
        )
    }

    @Test
    fun `keeps prerelease suffixes`() {
        assertEquals("1.0.0-beta.2", parseSections("## 1.0.0-beta.2\n- wip").first().version)
    }

    @Test
    fun `does not mistake prose starting with a number for a version`() {
        val sections = parseSections("## 1.1.0\n- fix\n2.0.0 is coming soon\n- more")
        assertEquals(listOf("1.1.0"), sections.map { it.version })
        assertTrue(sections.first().body.contains("2.0.0 is coming soon"))
    }

    @Test
    fun `drops headings with no body and ignores text before the first heading`() {
        val sections = parseSections("preamble\n\n## 1.0.0\n\n## 0.9.0\n- real content")
        assertEquals(listOf("0.9.0"), sections.map { it.version })
    }

    @Test
    fun `returns nothing for text with no versions`() {
        assertEquals(emptyList(), parseSections("just some prose"))
    }
}

class SelectRangeTest {

    private val sections = listOf("3.0.0", "2.1.0", "2.0.0", "1.0.0")
        .map { ChangelogSection(it, "notes for $it") }

    @Test
    fun `keeps what an update would bring in and nothing else`() {
        assertEquals(
            listOf("3.0.0", "2.1.0"),
            selectRange(sections, "2.0.0", "3.0.0").map { it.version }
        )
    }

    @Test
    fun `excludes the version you already have`() {
        assertEquals(listOf("3.0.0"), selectRange(sections, "2.1.0", "3.0.0").map { it.version })
    }

    @Test
    fun `finds nothing when the versions do not line up`() {
        assertEquals(emptyList(), selectRange(sections, "9.0.0", "9.1.0"))
        assertEquals(emptyList(), selectRange(sections, "any", "3.0.0"))
    }

    @Test
    fun `is not fooled by changelogs listed oldest first`() {
        assertEquals(
            listOf("2.1.0", "3.0.0"),
            selectRange(sections.reversed(), "2.0.0", "3.0.0").map { it.version }
        )
    }
}
