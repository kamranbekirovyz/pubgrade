package dev.pubgrade.ui

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import dev.pubgrade.PubgradeController

/** Re-checks every dependency against pub.dev. */
class RefreshAction : AnAction("Refresh Packages", "Check pub.dev for newer versions", AllIcons.Actions.Refresh), DumbAware {

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        PubgradeController.getInstance(project).refresh()
    }
}
