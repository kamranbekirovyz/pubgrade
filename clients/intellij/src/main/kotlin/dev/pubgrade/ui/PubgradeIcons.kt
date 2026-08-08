package dev.pubgrade.ui

import com.intellij.icons.AllIcons
import javax.swing.Icon

/**
 * The icons the plugin shows.
 *
 * The tool window uses the platform's own dependencies glyph rather than a
 * drawing of our own. It already means "the packages this project pulls in",
 * which is what Pubgrade lists, and only stock icons carry the metadata the
 * platform needs to recolour them against the selected stripe.
 */
object PubgradeIcons {
    val ToolWindow: Icon = AllIcons.Toolwindows.Dependencies
}
