package dev.pubgrade.core

/**
 * A very small YAML reader, enough for pubspec.yaml and pubspec.lock.
 *
 * The VS Code client uses js-yaml. The IntelliJ platform ships no YAML parser
 * we can rely on across every IDE, and pulling one in for two files is a lot of
 * jar for very little. Both files we read are plain nested maps of strings, so
 * that is all this handles: indentation, `key: value`, and comments.
 *
 * Not supported, on purpose: lists, anchors, multi-line block scalars, flow
 * syntax. Anything it cannot read comes back as a missing key, which every
 * caller already treats as "no opinion" rather than guessing.
 */
sealed interface YamlNode {
    data class Scalar(val value: String) : YamlNode
    data class Mapping(val entries: Map<String, YamlNode>) : YamlNode
}

fun YamlNode?.asMapping(): Map<String, YamlNode> =
    (this as? YamlNode.Mapping)?.entries ?: emptyMap()

fun YamlNode?.asScalar(): String? = (this as? YamlNode.Scalar)?.value

fun YamlNode?.child(key: String): YamlNode? = asMapping()[key]

/** Always returns a mapping; a file we cannot read comes back empty. */
fun parseYaml(text: String): YamlNode.Mapping {
    val lines = text.lines().map(::Line).filter { it.isContent }
    return YamlNode.Mapping(readMapping(lines, Cursor(), minIndent = 0))
}

private class Cursor(var index: Int = 0)

private class Line(raw: String) {
    val indent: Int = raw.takeWhile { it == ' ' || it == '\t' }.length
    val text: String = raw.trim()
    val isContent: Boolean = text.isNotEmpty() && !text.startsWith("#") && !text.startsWith("-")
}

private fun readMapping(lines: List<Line>, cursor: Cursor, minIndent: Int): Map<String, YamlNode> {
    val entries = LinkedHashMap<String, YamlNode>()

    while (cursor.index < lines.size) {
        val line = lines[cursor.index]
        if (line.indent < minIndent) break

        val separator = line.text.indexOf(':')
        if (separator <= 0) {
            cursor.index++
            continue
        }

        val key = unquote(line.text.substring(0, separator).trim())
        val value = stripComment(line.text.substring(separator + 1).trim())
        cursor.index++

        entries[key] = if (value.isEmpty()) {
            // A block: everything indented further than this key belongs to it.
            val childIndent = lines.getOrNull(cursor.index)?.indent ?: 0
            if (childIndent > line.indent) {
                YamlNode.Mapping(readMapping(lines, cursor, childIndent))
            } else {
                YamlNode.Mapping(emptyMap())
            }
        } else {
            YamlNode.Scalar(unquote(value))
        }
    }

    return entries
}

/** Only a `#` with whitespace in front starts a comment, so `^1.2.3` survives. */
private fun stripComment(value: String): String {
    val comment = Regex("""\s+#""").find(value) ?: return value
    return value.substring(0, comment.range.first).trim()
}

private fun unquote(value: String): String {
    if (value.length >= 2) {
        val first = value.first()
        if ((first == '"' || first == '\'') && value.last() == first) {
            return value.substring(1, value.length - 1)
        }
    }
    return value
}
