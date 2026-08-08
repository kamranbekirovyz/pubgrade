package dev.pubgrade.ui

import com.intellij.ide.BrowserUtil
import com.intellij.ide.ui.laf.darcula.ui.DarculaButtonUI
import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import com.intellij.ui.ColorUtil
import com.intellij.ui.JBColor
import com.intellij.ui.components.ActionLink
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.AsyncProcessIcon
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.pubgrade.ChangelogRequest
import dev.pubgrade.core.ChangelogSection
import dev.pubgrade.core.formatRelativeTime
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.Font
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.awt.Point
import java.awt.Rectangle
import java.time.Instant
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JEditorPane
import javax.swing.JPanel
import javax.swing.Scrollable
import javax.swing.ScrollPaneConstants
import javax.swing.event.HyperlinkEvent

/** Which pubspec.yaml the currently shown package belongs to. */
data class UpdateTarget(val pubspecPath: String, val packageName: String)

/**
 * The changelog view. One panel, reused for every package.
 *
 * The VS Code client renders this in a webview. Here it is built from Swing
 * components, because every IntelliJ IDE has those and JCEF is not guaranteed
 * to be enabled in all of them. The page is the package name, the range it
 * would move through, then one release per section with its own button, so you
 * can read what changed and stop wherever you like.
 *
 * The panel only renders. It reports the version the user picked back through
 * [onUpdate] and lets the caller do the work. The target travels with the panel
 * rather than being looked up by name, so a monorepo updates the project the
 * user actually opened.
 */
class ChangelogPanel(
    parent: Disposable,
    private val onUpdate: (UpdateTarget, String) -> Unit
) : JPanel(BorderLayout()) {

    private var target: UpdateTarget? = null

    private val content = ContentPanel()
    private val scroll = JBScrollPane(content).apply {
        horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
        // On the pane rather than on the first row, so every state gets the
        // same gap below the tab strip: the title, the spinner, the placeholder.
        border = JBUI.Borders.emptyTop(GAP)
    }
    private val spinner = AsyncProcessIcon("Pubgrade changelog")
        .also { Disposer.register(parent, it) }

    init {
        add(scroll, BorderLayout.CENTER)
        showEmpty()
    }

    fun showEmpty() {
        target = null
        spinner.suspend()
        content.reset()
        content.addRow(muted("Pick an outdated package to see what changed."))
        content.finish()
    }

    /**
     * Called the moment a package is clicked, before the fetch starts.
     *
     * Without it the tab keeps whatever was on it, so you see the previous
     * package's changelog for as long as the request takes and cannot tell
     * whether it is stale or is the answer. Clearing to the name you clicked
     * plus a spinner makes the wait readable.
     *
     * The spinner is a row in the page rather than an overlay, because an
     * overlay fades out on its own timer and so stays on screen after the
     * content behind it has already been drawn. A row is gone the moment the
     * content replaces it.
     */
    fun showLoading(packageName: String) {
        target = null
        content.reset()
        content.addRow(title(packageName))
        content.addRow(loadingRow())
        content.finish()
        spinner.resume()
    }

    private fun loadingRow() = JPanel().apply {
        isOpaque = false
        layout = BoxLayout(this, BoxLayout.X_AXIS)
        border = JBUI.Borders.empty(GAP_SECTION, SIDE, 0, SIDE)

        add(spinner)
        add(Box.createHorizontalStrut(JBUI.scale(GAP)))
        add(JBLabel("Fetching changelog").apply { foreground = UIUtil.getInactiveTextColor() })
        add(Box.createHorizontalGlue())
    }

    fun showFailure(packageName: String, reason: String?) {
        target = null
        spinner.suspend()
        content.reset()
        content.addRow(title(packageName))
        content.addRow(muted(reason ?: "Could not load this changelog."))
        content.finish()
    }

    fun show(request: ChangelogRequest, target: UpdateTarget) {
        this.target = target
        spinner.suspend()
        content.reset()

        content.addRow(title(request.packageName))
        content.addRow(subtitle(request))

        if (request.showingEverything) {
            content.addRow(
                muted(
                    "Could not match this changelog to ${request.fromVersion} → " +
                        "${request.toVersion}. Showing the whole changelog."
                )
            )
        }

        if (request.sections.isEmpty()) {
            content.addRow(muted("No changelog entries found for this version range."))
        }

        request.sections.forEachIndexed { index, section ->
            content.addRow(releaseHead(section, request.publishedAt, isFirst = index == 0))
            content.addRow(body(renderText(section.body)))
        }

        content.addRow(footer(request.packageName))
        content.finish()
        scroll.viewport.viewPosition = Point(0, 0)
    }

    private fun title(packageName: String) = JBLabel(packageName).apply {
        font = font.deriveFont(Font.BOLD, font.size + 8f)
        border = JBUI.Borders.empty(GAP_SECTION, SIDE, 0, SIDE)
    }

    /**
     * What the update is, as a caption rather than as a row with its own button.
     *
     * The button that used to live here did the same thing as the button on the
     * first release below, and two primary actions a few pixels apart make you
     * stop and work out the difference. The range is information, so it is
     * written as information; the newest release keeps the action.
     */
    private fun subtitle(request: ChangelogRequest) =
        JBLabel(
            buildString {
                append("${request.fromVersion} → ${request.toVersion}")
                // Only meaningful when the sections really are the ones this
                // update would bring in.
                if (!request.showingEverything && request.sections.isNotEmpty()) {
                    val count = request.sections.size
                    append("  ·  $count release${if (count == 1) "" else "s"} behind")
                }
            }
        ).apply {
            foreground = UIUtil.getInactiveTextColor()
            border = JBUI.Borders.empty(GAP_TIGHT, SIDE, 0, SIDE)
        }

    /**
     * Laid out by hand rather than with a FlowLayout, because FlowLayout puts a
     * gap in front of the first component and that would leave every release
     * heading a few pixels right of the title and subtitle above it.
     *
     * Every release after the first is preceded by a rule and a wide gap. The
     * bullets inside a release are close together, so without that the whole
     * page reads as one long list and you cannot see where a version ends.
     */
    private fun releaseHead(
        section: ChangelogSection,
        publishedAt: Map<String, Instant>,
        isFirst: Boolean
    ) =
        JPanel().apply {
            isOpaque = false
            layout = BoxLayout(this, BoxLayout.X_AXIS)
            border = if (isFirst) {
                JBUI.Borders.empty(GAP_SECTION, SIDE, GAP, SIDE)
            } else {
                JBUI.Borders.compound(
                    JBUI.Borders.empty(GAP_SECTION, SIDE, 0, SIDE),
                    JBUI.Borders.compound(
                        JBUI.Borders.customLine(JBColor.border(), 1, 0, 0, 0),
                        JBUI.Borders.empty(GAP_SECTION, 0, GAP, 0)
                    )
                )
            }

            add(JBLabel(section.version).apply { font = font.deriveFont(Font.BOLD) })

            publishedAt[section.version]?.let {
                add(Box.createHorizontalStrut(JBUI.scale(GAP)))
                add(
                    JBLabel(formatRelativeTime(it)).apply {
                        foreground = UIUtil.getInactiveTextColor()
                    }
                )
            }

            add(Box.createHorizontalStrut(JBUI.scale(GAP + GAP_TIGHT)))
            add(updateButton("Update to ${section.version}", section.version, primary = isFirst))
            add(Box.createHorizontalGlue())
        }

    /**
     * The newest release is the one nearly everyone wants, so it gets the filled
     * button and the rest stay plain. Marked through the look and feel's own key
     * rather than the root pane's default button, which would also bind Enter to
     * it from anywhere in the IDE.
     */
    private fun updateButton(label: String, version: String, primary: Boolean = false) =
        JButton(label).apply {
            if (primary) putClientProperty(DarculaButtonUI.DEFAULT_STYLE_KEY, true)
            addActionListener {
                val current = target ?: return@addActionListener
                onUpdate(current, version)
            }
        }

    private fun muted(text: String) = JBLabel(text).apply {
        foreground = UIUtil.getInactiveTextColor()
        border = JBUI.Borders.empty(GAP + GAP_TIGHT, SIDE)
    }

    /**
     * Sits behind the same rule that separates two releases, so it reads as
     * belonging to the page rather than to whichever release happens to be last.
     */
    private fun footer(packageName: String) = JPanel().apply {
        isOpaque = false
        layout = BoxLayout(this, BoxLayout.X_AXIS)
        border = JBUI.Borders.compound(
            JBUI.Borders.empty(GAP_SECTION, SIDE, GAP_SECTION, SIDE),
            JBUI.Borders.compound(
                JBUI.Borders.customLine(JBColor.border(), 1, 0, 0, 0),
                JBUI.Borders.emptyTop(GAP_SECTION)
            )
        )

        add(
            ActionLink("Open on pub.dev") {
                BrowserUtil.browse("https://pub.dev/packages/$packageName/changelog")
            }
        )
        add(Box.createHorizontalGlue())
    }

    private fun body(html: String) = WrappingHtmlPane(document(html))

    /**
     * Bullet lists and paragraphs are all a changelog needs.
     *
     * The catch is that changelogs are hard-wrapped, so one bullet arrives as
     * several lines. Treating each line as its own block turns the second half
     * of every sentence into a paragraph of its own, sitting left of the bullet
     * it belongs to and spaced as if it were a new point. So a line that is not
     * itself a bullet continues the block above it, and only a blank line ends
     * one.
     */
    private fun renderText(text: String): String {
        val html = StringBuilder()
        var block: StringBuilder? = null
        var isBullet = false
        var inList = false

        fun flush() {
            val current = block ?: return
            block = null
            if (isBullet) {
                if (!inList) {
                    html.append("<ul>")
                    inList = true
                }
                html.append("<li>").append(escape(current.toString())).append("</li>")
            } else {
                if (inList) {
                    html.append("</ul>")
                    inList = false
                }
                html.append("<p>").append(escape(current.toString())).append("</p>")
            }
        }

        for (rawLine in text.lines()) {
            val line = rawLine.trim()
            val bullet = BULLET.find(line)

            when {
                bullet != null -> {
                    flush()
                    isBullet = true
                    block = StringBuilder(bullet.groupValues[1])
                }

                line.isEmpty() -> flush()

                block != null -> block!!.append(' ').append(line)

                else -> {
                    isBullet = false
                    block = StringBuilder(line)
                }
            }
        }
        flush()
        if (inList) html.append("</ul>")

        return html.toString().ifEmpty { "<p><i>No details available.</i></p>" }
    }

    /**
     * Swing's HTML renderer has no theme awareness, so the colours are injected.
     *
     * The font deliberately is not: naming a family in CSS makes the renderer
     * go looking for it and quietly fall back to a serif default when the IDE's
     * own font is not one Swing can resolve by name. The pane sets
     * `HONOR_DISPLAY_PROPERTIES` instead, which makes it use whatever font the
     * component has, which is the IDE's.
     */
    private fun document(content: String): String {
        val foreground = ColorUtil.toHex(UIUtil.getLabelForeground())
        val link = ColorUtil.toHex(JBUI.CurrentTheme.Link.Foreground.ENABLED)

        // Bottom margins only. Swing's renderer does not collapse adjacent
        // margins the way a browser does, so a top and a bottom margin on
        // neighbouring blocks would add up to twice the gap that was asked for.
        return """
            <html><head><style>
              body { color: #$foreground; margin: 0; }
              p { margin: 0 0 ${GAP}px 0; }
              ul { margin: 0 0 ${GAP}px 0; padding-left: ${SIDE}px; }
              li { margin: 0 0 ${GAP_LIST_ITEM}px 0; }
              a { color: #$link; }
            </style></head><body>$content</body></html>
        """.trimIndent()
    }

    private fun escape(text: String): String = text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;")

    private companion object {
        val BULLET = Regex("""^[-*•]\s+(.*)$""")
    }
}

/**
 * The panel's spacing, in multiples of four.
 *
 * Every gap is one of these, so the layout reads as deliberate rather than as
 * whatever each row happened to need. [SIDE] is the one left and right margin
 * for every row, which is what keeps the title, the captions, the release
 * headings and the bullets on a single left edge; it stays small because the
 * packages tree beside it already insets its own rows, and a wider margin here
 * would make the changelog look indented relative to the list it came from.
 */
private const val SIDE = 8
private const val GAP_TIGHT = 4
private const val GAP = 8
private const val GAP_SECTION = 24

/**
 * Between two bullets. Deliberately off the scale above: at 4 the points run
 * together once any of them wraps, and at 8 a list stops reading as one thing.
 */
private const val GAP_LIST_ITEM = 6

/**
 * A read-only HTML block that reports its height for the width it has been
 * given rather than for one very long line.
 *
 * Swing asks a component how big it wants to be before deciding how wide it is,
 * which for wrapped text is the wrong way round. Measuring at the current width
 * is the usual way out, and it is why the changelog wraps instead of forcing a
 * horizontal scrollbar.
 */
private class WrappingHtmlPane(html: String) : JEditorPane("text/html", html) {

    init {
        isEditable = false
        isOpaque = false
        // Use the IDE's own UI font rather than the renderer's serif default.
        putClientProperty(JEditorPane.HONOR_DISPLAY_PROPERTIES, true)
        font = UIUtil.getLabelFont()
        border = JBUI.Borders.empty(0, SIDE)
        addHyperlinkListener { event ->
            if (event.eventType == HyperlinkEvent.EventType.ACTIVATED) {
                event.url?.let { BrowserUtil.browse(it) }
            }
        }
    }

    override fun getPreferredSize(): Dimension {
        val available = width
        if (available <= 0) return super.getPreferredSize()
        setSize(available, Short.MAX_VALUE.toInt())
        return Dimension(available, super.getPreferredSize().height)
    }

    override fun getMaximumSize(): Dimension = Dimension(Int.MAX_VALUE, preferredSize.height)
}

/**
 * Stacks rows top to bottom at the width of the viewport.
 *
 * `getScrollableTracksViewportWidth` is what stops the panel growing sideways,
 * which is what lets the HTML blocks above know how wide they are.
 */
private class ContentPanel : JPanel(GridBagLayout()), Scrollable {

    private var row = 0

    init {
        isOpaque = false
    }

    fun reset() {
        removeAll()
        row = 0
    }

    fun addRow(component: JComponent) {
        add(component, GridBagConstraints().apply {
            gridx = 0
            gridy = row++
            weightx = 1.0
            fill = GridBagConstraints.HORIZONTAL
            anchor = GridBagConstraints.NORTHWEST
        })
    }

    /** A greedy empty row so short changelogs stay at the top. */
    fun finish() {
        add(JPanel().apply { isOpaque = false }, GridBagConstraints().apply {
            gridx = 0
            gridy = row++
            weightx = 1.0
            weighty = 1.0
            fill = GridBagConstraints.BOTH
        })
        revalidate()
        repaint()
    }

    override fun getPreferredScrollableViewportSize(): Dimension = preferredSize

    override fun getScrollableUnitIncrement(r: Rectangle, orientation: Int, direction: Int) = 16

    override fun getScrollableBlockIncrement(r: Rectangle, orientation: Int, direction: Int) =
        r.height

    override fun getScrollableTracksViewportWidth(): Boolean = true

    override fun getScrollableTracksViewportHeight(): Boolean = false
}
