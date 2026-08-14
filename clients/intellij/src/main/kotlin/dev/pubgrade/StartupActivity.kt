package dev.pubgrade

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity

/**
 * Checks pub.dev once the project is open, so the count is there before you go
 * looking for it. The VS Code client already refreshes on activation.
 *
 * Projects with no pubspec.yaml are skipped, so a Java project never sees a
 * Pubgrade progress bar it has no use for.
 */
internal class PubgradeStartupActivity : ProjectActivity {

    override suspend fun execute(project: Project) {
        val hasFlutterCode = ReadAction.compute<Boolean, RuntimeException> {
            Workspace.findPubspecs(project).isNotEmpty()
        }
        if (hasFlutterCode) {
            PubgradeController.getInstance(project).refresh()
        }
    }
}
