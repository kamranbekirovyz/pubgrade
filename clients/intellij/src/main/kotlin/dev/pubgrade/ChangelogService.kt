package dev.pubgrade

import dev.pubgrade.core.ChangelogSection
import dev.pubgrade.core.Package
import dev.pubgrade.core.extractChangelogText
import dev.pubgrade.core.parseSections
import dev.pubgrade.core.selectRange
import dev.pubgrade.pub.PubDevApi
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/** Everything the changelog panel needs to render. */
data class ChangelogRequest(
    val packageName: String,
    val fromVersion: String,
    val toVersion: String,
    val sections: List<ChangelogSection>,
    val publishedAt: Map<String, Instant>,
    /** Set when we could not match the changelog to the version range. */
    val showingEverything: Boolean
)

/** A whole changelog can be hundreds of releases; nobody scrolls that far. */
private const val MAX_FALLBACK_SECTIONS = 20

/**
 * Turns a package into something the changelog panel can render: fetch the
 * page, cut it into versions, keep the ones the update would bring in.
 *
 * Results are cached per package and version range, so reopening the same
 * changelog is instant while two projects pinning different versions of the
 * same package still each get their own.
 */
class ChangelogService(private val api: PubDevApi) {

    private val cache = ConcurrentHashMap<String, ChangelogRequest>()

    /** Blocking: call it from a background task, never the UI thread. */
    fun load(pkg: Package): ChangelogRequest {
        val key = "${pkg.name}@${pkg.currentVersion}->${pkg.latestVersion}"
        return cache.computeIfAbsent(key) { build(pkg) }
    }

    fun clearCache() {
        cache.clear()
    }

    private fun build(pkg: Package): ChangelogRequest {
        val html = api.getChangelogHtml(pkg.name)
        val remote = api.getPackage(pkg.name)

        val all = if (html != null) parseSections(extractChangelogText(html)) else emptyList()
        val inRange = selectRange(all, pkg.currentVersion, pkg.latestVersion)
        val showingEverything = inRange.isEmpty() && all.isNotEmpty()

        return ChangelogRequest(
            packageName = pkg.name,
            fromVersion = pkg.currentVersion,
            toVersion = pkg.latestVersion,
            sections = if (showingEverything) all.take(MAX_FALLBACK_SECTIONS) else inRange,
            publishedAt = remote?.publishedAt ?: emptyMap(),
            showingEverything = showingEverything
        )
    }
}
