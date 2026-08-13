package dev.pubgrade.ui

import com.intellij.icons.AllIcons
import com.intellij.ui.JBColor
import com.intellij.util.ui.JBUI
import java.awt.Component
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
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

    /** Shown while something is waiting to be updated. */
    val ToolWindowBadged: Icon = BadgedIcon(ToolWindow)
}

/**
 * The stripe icon with a dot in its top right corner.
 *
 * The platform has BadgeIconSupplier for this, but it stayed marked internal
 * until 2025.1 and the Marketplace verifier rejects it on every build before
 * that. Painting the dot ourselves is a dozen lines and works on every version
 * the plugin supports.
 *
 * The colour is read from the theme by name, so it follows the IDE rather than
 * being a hardcoded blue that fights a light or high contrast look.
 */
private class BadgedIcon(private val base: Icon) : Icon {

    override fun getIconWidth() = base.iconWidth

    override fun getIconHeight() = base.iconHeight

    override fun paintIcon(component: Component?, graphics: Graphics, x: Int, y: Int) {
        base.paintIcon(component, graphics, x, y)

        val g = graphics.create() as Graphics2D
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            val size = JBUI.scale(DOT)
            g.color = DOT_COLOR
            g.fillOval(x + iconWidth - size, y, size, size)
        } finally {
            g.dispose()
        }
    }

    private companion object {
        /** Unscaled, because the stripe icon is 13 pixels wide at 100%. */
        const val DOT = 5

        val DOT_COLOR = JBColor.namedColor(
            "IconBadge.informationBackground",
            JBColor(0x3574F0, 0x3574F0)
        )
    }
}
