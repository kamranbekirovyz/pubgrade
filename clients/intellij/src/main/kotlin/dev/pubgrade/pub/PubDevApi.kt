package dev.pubgrade.pub

import com.google.gson.JsonParser
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/** Everything one pub.dev package document tells us. */
data class PubPackage(
    val latestVersion: String,
    /** Publish date per version, e.g. `1.2.3` -> Instant. */
    val publishedAt: Map<String, Instant>
)

private val REQUEST_TIMEOUT: Duration = Duration.ofSeconds(15)

/**
 * Reads pub.dev. One instance per project.
 *
 * Each package document is fetched at most once and then cached, because the
 * package list, the "outdated" check and the changelog dates all want the same
 * document. Call [clearCache] on refresh.
 */
class PubDevApi(
    private val http: HttpClient = HttpClient.newBuilder()
        .connectTimeout(REQUEST_TIMEOUT)
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build()
) {
    // Values are wrapped because a ConcurrentHashMap cannot hold null, and
    // "we asked and pub.dev has no such package" is worth caching too.
    private val packages = ConcurrentHashMap<String, Box<PubPackage>>()
    private val changelogs = ConcurrentHashMap<String, Box<String>>()

    private class Box<T>(val value: T?)

    /** Null when the package is unknown or pub.dev is unreachable. */
    fun getPackage(name: String): PubPackage? =
        packages.computeIfAbsent(name) { Box(fetchPackage(it)) }.value

    /** Raw HTML of the changelog page. Null when it cannot be fetched. */
    fun getChangelogHtml(name: String): String? =
        changelogs.computeIfAbsent(name) {
            Box(get("https://pub.dev/packages/${encode(it)}/changelog"))
        }.value

    fun clearCache() {
        packages.clear()
        changelogs.clear()
    }

    private fun fetchPackage(name: String): PubPackage? {
        val body = get("https://pub.dev/api/packages/${encode(name)}") ?: return null

        val root = runCatching { JsonParser.parseString(body).asJsonObject }.getOrNull() ?: return null
        val latestVersion = root.getAsJsonObject("latest")
            ?.get("version")?.takeIf { it.isJsonPrimitive }?.asString
            ?: return null

        val publishedAt = LinkedHashMap<String, Instant>()
        root.getAsJsonArray("versions")?.forEach { element ->
            val entry = element.takeIf { it.isJsonObject }?.asJsonObject ?: return@forEach
            val version = entry.get("version")?.takeIf { it.isJsonPrimitive }?.asString ?: return@forEach
            val published = entry.get("published")?.takeIf { it.isJsonPrimitive }?.asString ?: return@forEach
            runCatching { Instant.parse(published) }.getOrNull()?.let { publishedAt[version] = it }
        }

        return PubPackage(latestVersion, publishedAt)
    }

    private fun get(url: String): String? = try {
        val request = HttpRequest.newBuilder(URI.create(url))
            .timeout(REQUEST_TIMEOUT)
            .header("User-Agent", "pubgrade-intellij")
            .GET()
            .build()

        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() in 200..299) response.body() else null
    } catch (error: Exception) {
        null
    }

    private fun encode(value: String): String =
        URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20")
}
