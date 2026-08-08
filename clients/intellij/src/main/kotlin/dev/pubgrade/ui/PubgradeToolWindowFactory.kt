package dev.pubgrade.ui

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import dev.pubgrade.PackageService
import dev.pubgrade.PubgradeController

/**
 * Builds the tool window and hands its panels to the controller.
 *
 * Two tabs rather than the editor-side webview the VS Code client opens: a tool
 * window is the one surface every JetBrains IDE agrees on, and putting the
 * changelog beside the list would fight for width in a docked panel.
 */
class PubgradeToolWindowFactory : ToolWindowFactory, DumbAware {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val controller = PubgradeController.getInstance(project)
        val service = PackageService.getInstance(project)

        val changelog = ChangelogPanel(toolWindow.disposable) { target, version ->
            controller.update(target, version)
        }
        val packages = PackagesTreePanel(service) { pkg, pubspecPath ->
            if (pkg.isOutdated) selectChangelogTab(toolWindow)
            controller.open(pkg, pubspecPath)
        }

        controller.changelog = changelog
        controller.onRender = { packages.render() }

        val contents = ContentFactory.getInstance()
        val packagesTab = contents.createContent(packages, "Packages", false)
            .apply { isCloseable = false }
        toolWindow.contentManager.addContent(packagesTab)
        toolWindow.contentManager.addContent(
            contents.createContent(changelog, "Changelog", false).apply { isCloseable = false }
        )

        // Refresh lives in the tool window's own title bar, next to the options
        // menu. A toolbar inside the panel would cost a whole row above the list
        // for one button, which is what VS Code avoids by putting it in the view
        // header rather than in the view.
        toolWindow.setTitleActions(
            listOfNotNull(ActionManager.getInstance().getAction("Pubgrade.Refresh"))
        )

        controller.toolWindow = toolWindow
        controller.packagesTab = packagesTab
        controller.refresh()
    }

    private fun selectChangelogTab(toolWindow: ToolWindow) {
        val manager = toolWindow.contentManager
        manager.getContent(1)?.let { manager.setSelectedContent(it) }
    }
}
