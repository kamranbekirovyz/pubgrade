package dev.pubgrade.ui

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.util.Consumer
import dev.pubgrade.PackageService
import dev.pubgrade.PubgradeController
import dev.pubgrade.core.pluralPackages
import java.awt.event.MouseEvent

/** "3 outdated packages" in the status bar, click to refresh. */
class PubgradeStatusBarWidgetFactory : StatusBarWidgetFactory, DumbAware {

    override fun getId(): String = PubgradeController.STATUS_BAR_WIDGET_ID

    override fun getDisplayName(): String = "Pubgrade"

    override fun createWidget(project: Project): StatusBarWidget = Widget(project)

    private class Widget(private val project: Project) :
        StatusBarWidget, StatusBarWidget.TextPresentation {

        override fun ID(): String = PubgradeController.STATUS_BAR_WIDGET_ID

        override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

        override fun install(statusBar: StatusBar) = Unit

        override fun dispose() = Unit

        override fun getText(): String {
            val outdated = PackageService.getInstance(project).outdatedCount
            return if (outdated > 0) {
                "$outdated outdated ${pluralPackages(outdated)}"
            } else {
                "Packages up to date"
            }
        }

        override fun getTooltipText(): String = "Pubgrade: click to re-check pub.dev"

        override fun getAlignment(): Float = java.awt.Component.LEFT_ALIGNMENT

        override fun getClickConsumer(): Consumer<MouseEvent> = Consumer {
            PubgradeController.getInstance(project).refresh()
        }
    }
}
