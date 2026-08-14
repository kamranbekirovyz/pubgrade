package dev.pubgrade

import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project as IdeProject
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.wm.WindowManager
import dev.pubgrade.core.Package
import dev.pubgrade.core.progressStep
import dev.pubgrade.ui.ChangelogPanel
import dev.pubgrade.ui.PubgradeIcons
import dev.pubgrade.ui.PubgradeToolWindowFactory
import dev.pubgrade.ui.UpdateTarget
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Wiring only: keep the views in sync, run the slow parts off the UI thread,
 * turn failures into notifications. All the thinking lives in `core`,
 * [PackageService] and `pub`.
 *
 * The panels register themselves here when the tool window is first opened, so
 * a refresh triggered before that simply has nothing to redraw.
 */
@Service(Service.Level.PROJECT)
class PubgradeController(private val project: IdeProject) {

    private val packages get() = PackageService.getInstance(project)

    var onRender: (() -> Unit)? = null
    var changelog: ChangelogPanel? = null
    var toolWindow: ToolWindow? = null

    /** Swaps the tool window between the package list and the changelog. */
    var showCard: ((String) -> Unit)? = null

    private val refreshing = AtomicBoolean(false)

    val isRefreshing: Boolean get() = refreshing.get()

    fun render() {
        onEdt {
            onRender?.invoke()
            showCount(packages.outdatedCount)
            updateStatusBar()
        }
    }

    private fun updateStatusBar() {
        WindowManager.getInstance().getStatusBar(project)?.updateWidget(STATUS_BAR_WIDGET_ID)
    }

    /**
     * A dot on the stripe icon: 13 pixels wide, so nothing legible fits there.
     *
     * Looked up by id when the field is still null, which is the case for the
     * scan that runs at startup, before anyone has opened the panel.
     */
    private fun showCount(outdated: Int) {
        val window = toolWindow
            ?: ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID)
        window?.setIcon(
            if (outdated > 0) PubgradeIcons.ToolWindowBadged else PubgradeIcons.ToolWindow
        )
    }

    /**
     * Rescans every pubspec.yaml and re-checks every dependency against pub.dev.
     *
     * One at a time: opening the tool window mid-scan would otherwise start a
     * second pass, and the two would race to write the same list.
     */
    fun refresh() {
        if (!refreshing.compareAndSet(false, true)) return
        onEdt { updateStatusBar() }

        object : Task.Backgroundable(project, "Pubgrade", false) {
            override fun run(indicator: ProgressIndicator) {
                indicator.isIndeterminate = false
                packages.refresh { checked, total ->
                    val step = progressStep(checked, total)
                    indicator.text = step.message
                    indicator.fraction = step.fraction
                }
            }

            override fun onThrowable(error: Throwable) {
                Workspace.notify(project, "Failed to refresh packages: ${error.message}", NotificationType.ERROR)
            }

            override fun onFinished() {
                refreshing.set(false)
                render()
            }
        }.queue()
    }

    /** Clicking a row: outdated packages open their changelog, the rest just say so. */
    fun open(pkg: Package, pubspecPath: String) {
        if (!pkg.isOutdated) {
            Workspace.notify(
                project,
                "${pkg.name} is up to date (${pkg.currentVersion})",
                NotificationType.INFORMATION
            )
            return
        }

        // Before the task is queued, so the panel never sits on the previous
        // package's changelog while this one is on its way.
        onEdt {
            changelog?.showLoading(pkg.name)
            showCard?.invoke(PubgradeToolWindowFactory.CHANGELOG_CARD)
        }

        object : Task.Backgroundable(project, "Fetching changelog for ${pkg.name}", false) {
            override fun run(indicator: ProgressIndicator) {
                indicator.isIndeterminate = true
                val request = packages.changelogs.load(pkg)
                onEdt { changelog?.show(request, UpdateTarget(pubspecPath, pkg.name)) }
            }

            override fun onThrowable(error: Throwable) {
                onEdt { changelog?.showFailure(pkg.name, error.message) }
                Workspace.notify(
                    project,
                    "Failed to fetch changelog for ${pkg.name}: ${error.message}",
                    NotificationType.ERROR
                )
            }
        }.queue()
    }

    /** Writes the version, then runs `flutter pub get`. Both off the UI thread. */
    fun update(target: UpdateTarget, version: String) {
        object : Task.Backgroundable(project, "Updating ${target.packageName}", false) {
            override fun run(indicator: ProgressIndicator) {
                indicator.isIndeterminate = true
                val written = packages.update(target.pubspecPath, target.packageName, version)
                if (written) {
                    render()
                    showPackages()
                } else {
                    Workspace.notify(
                        project,
                        "Could not find ${target.packageName} in ${target.pubspecPath}",
                        NotificationType.WARNING
                    )
                }
            }

            override fun onThrowable(error: Throwable) {
                Workspace.notify(
                    project,
                    "Failed to update ${target.packageName}: ${error.message}",
                    NotificationType.ERROR
                )
            }
        }.queue()
    }

    /**
     * Where you end up after an update lands.
     *
     * The changelog you were reading described a jump you have just taken, so
     * leaving it on screen would offer buttons for versions you already have.
     * The list is the thing that changed, and opening the same package again
     * builds its changelog afresh from the new current version.
     */
    fun showPackages() {
        onEdt {
            changelog?.showEmpty()
            showCard?.invoke(PubgradeToolWindowFactory.PACKAGES_CARD)
        }
    }

    private fun onEdt(action: () -> Unit) =
        ApplicationManager.getApplication().invokeLater(action)

    companion object {
        const val STATUS_BAR_WIDGET_ID = "Pubgrade"

        /** Must match the toolWindow id in plugin.xml. */
        const val TOOL_WINDOW_ID = "Pubgrade"

        fun getInstance(project: IdeProject): PubgradeController = project.service()
    }
}
