package dev.pubgrade.ui

import com.intellij.icons.AllIcons
import com.intellij.openapi.util.ScalableIcon
import com.intellij.ui.JBColor
import java.awt.Component
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import javax.swing.Icon
import kotlin.math.roundToInt

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
 * [ScalableIcon] is not optional here: the tool window stripe casts whatever it
 * is handed, so a plain Icon throws before it ever gets painted.
 *
 * The colour is read from the theme by name, so it follows the IDE rather than
 * being a hardcoded blue that fights a light or high contrast look.
 */
private class BadgedIcon(
    private val base: Icon,
    private val scale: Float = 1f
) : Icon, ScalableIcon {

    override fun getIconWidth() = base.iconWidth

    override fun getIconHeight() = base.iconHeight

    override fun getScale() = scale

    override fun scale(scaleFactor: Float): Icon {
        val scaled = (base as? ScalableIcon)?.scale(scaleFactor) ?: return this
        return BadgedIcon(scaled, scaleFactor)
    }

    override fun paintIcon(component: Component?, graphics: Graphics, x: Int, y: Int) {
        base.paintIcon(component, graphics, x, y)

        val g = graphics.create() as Graphics2D
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            // Taken from the icon rather than scaled from a constant, so the dot
            // stays the same fraction of the glyph at every display scale.
            val size = (iconWidth * DOT_RATIO).roundToInt().coerceAtLeast(3)
            g.color = DOT_COLOR
            g.fillOval(x + iconWidth - size, y, size, size)
        } finally {
            g.dispose()
        }
    }

    private companion object {
        /** Five pixels against the stock 13 pixel stripe glyph. */
        const val DOT_RATIO = 5f / 13f

        val DOT_COLOR = JBColor.namedColor(
            "IconBadge.informationBackground",
            JBColor(0x3574F0, 0x3574F0)
        )
    }
}
