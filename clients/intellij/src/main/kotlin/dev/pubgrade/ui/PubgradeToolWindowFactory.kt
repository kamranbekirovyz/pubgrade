package dev.pubgrade.ui

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import dev.pubgrade.PackageService
import dev.pubgrade.PubgradeController
import java.awt.CardLayout
import javax.swing.JPanel

private const val PACKAGES = "packages"
private const val CHANGELOG = "changelog"

/**
 * Builds the tool window and hands its panels to the controller.
 *
 * One panel that swaps its contents rather than two tabs: clicking a package
 * covers the list, and the changelog's own close link uncovers it.
 */
class PubgradeToolWindowFactory : ToolWindowFactory, DumbAware {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val controller = PubgradeController.getInstance(project)
        val service = PackageService.getInstance(project)

        val cards = CardLayout()
        val root = JPanel(cards)

        val changelog = ChangelogPanel(
            parent = toolWindow.disposable,
            onUpdate = { target, version -> controller.update(target, version) },
            onClose = { controller.showPackages() }
        )
        val packages = PackagesTreePanel(service) { pkg, pubspecPath ->
            controller.open(pkg, pubspecPath)
        }

        root.add(packages, PACKAGES)
        root.add(changelog, CHANGELOG)

        controller.changelog = changelog
        controller.onRender = { packages.render() }
        controller.showCard = { name -> cards.show(root, name) }

        toolWindow.contentManager.addContent(
            ContentFactory.getInstance().createContent(root, "", false).apply { isCloseable = false }
        )

        // Refresh lives in the tool window's own title bar, next to the options
        // menu. A toolbar inside the panel would cost a whole row above the list
        // for one button, which is what VS Code avoids by putting it in the view
        // header rather than in the view.
        toolWindow.setTitleActions(
            listOfNotNull(ActionManager.getInstance().getAction("Pubgrade.Refresh"))
        )

        controller.toolWindow = toolWindow

        // The startup scan usually got here first, so opening the panel just
        // draws what it found rather than checking pub.dev all over again.
        if (service.hasScanned) controller.render() else controller.refresh()
    }

    companion object {
        const val PACKAGES_CARD = PACKAGES
        const val CHANGELOG_CARD = CHANGELOG
    }
}
