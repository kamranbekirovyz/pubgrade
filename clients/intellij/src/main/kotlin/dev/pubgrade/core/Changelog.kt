package dev.pubgrade.core

/**
 * Turning a pub.dev changelog page into version sections, in three steps:
 *
 *   extractChangelogText -> the changelog body as plain markdown-ish text
 *   parseSections        -> one entry per `## 1.2.3` heading
 *   selectRange          -> only the versions between what you have and what you want
 */

/**
 * Matches the version headings authors actually write:
 *   `## 1.2.3`   `# v1.2.3`   `## [1.2.3]`   `## 1.2.3 - Title`   `v1.2.3`
 *
 * Outside a `#` heading a leading `v` is required, otherwise ordinary prose
 * starting with a number would be read as a new version.
 * `[^\]\s]*` keeps prerelease and build suffixes (`1.2.3-beta.1`).
 */
private val VERSION_HEADING = Regex("""^(?:#+\s*\[?v?|v)(\d+\.\d+\.\d+[^\]\s]*)\]?""")

/**
 * Pulls the changelog body out of a pub.dev HTML page.
 *
 * pub.dev's markup changes now and then, so we try the specific containers
 * first and widen the net on each failure. Empty string means no luck.
 */
fun extractChangelogText(html: String): String {
    val candidates = listOf(
        Regex(
            """<div[^>]*class="[^"]*detail-tabs-content[^"]*"[^>]*>([\s\S]*?)</div>\s*</section>""",
            RegexOption.IGNORE_CASE
        ),
        Regex("""<div[^>]*class="[^"]*markdown[^"]*"[^>]*>([\s\S]*?)</div>""", RegexOption.IGNORE_CASE),
        Regex("""<main[^>]*>([\s\S]*?)</main>""", RegexOption.IGNORE_CASE)
    )

    for (pattern in candidates) {
        val match = pattern.find(html) ?: continue
        val text = htmlToText(match.groupValues[1])
        if (text.length >= 20) return text
    }
    return ""
}

/** Enough HTML-to-text to keep headings and bullets readable. */
fun htmlToText(html: String): String {
    var text = html
    text = Regex("""<(script|style)[^>]*>[\s\S]*?</\1>""", RegexOption.IGNORE_CASE).replace(text, "")
    text = Regex("""<h1[^>]*>""", RegexOption.IGNORE_CASE).replace(text, "\n# ")
    text = Regex("""<h2[^>]*>""", RegexOption.IGNORE_CASE).replace(text, "\n## ")
    text = Regex("""<h3[^>]*>""", RegexOption.IGNORE_CASE).replace(text, "\n### ")
    text = Regex("""</h[1-6]>""", RegexOption.IGNORE_CASE).replace(text, "\n")
    text = Regex("""<li[^>]*>""", RegexOption.IGNORE_CASE).replace(text, "\n- ")
    text = Regex("""<br\s*/?>""", RegexOption.IGNORE_CASE).replace(text, "\n")
    text = Regex("""</?(p|ul|ol)[^>]*>""", RegexOption.IGNORE_CASE).replace(text, "\n")
    text = Regex("""<[^>]*>""").replace(text, "")
    text = text
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&") // last, so `&amp;lt;` does not become `<`
    text = Regex("""\n{3,}""").replace(text, "\n\n")
    return text.trim()
}

/** Splits changelog text at version headings, keeping the file's own order. */
fun parseSections(text: String): List<ChangelogSection> {
    val sections = mutableListOf<ChangelogSection>()
    var version: String? = null
    var lines = mutableListOf<String>()

    fun flush() {
        val current = version ?: return
        val body = lines.joinToString("\n").trim()
        if (body.isNotEmpty()) sections.add(ChangelogSection(current, body))
    }

    for (line in text.lines()) {
        val heading = VERSION_HEADING.find(line)
        if (heading != null) {
            flush()
            version = heading.groupValues[1]
            lines = mutableListOf()
        } else if (version != null) {
            lines.add(line)
        }
    }
    flush()

    return sections
}

/**
 * Keeps the versions a user would gain by updating: newer than [from], no newer
 * than [to]. An empty result means we could not line the changelog up with the
 * versions we know about, and the caller decides what to show instead.
 */
fun selectRange(
    sections: List<ChangelogSection>,
    from: String,
    to: String
): List<ChangelogSection> = sections.filter { isInRange(it.version, from, to) }
