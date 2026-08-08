package dev.pubgrade

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.util.ExecUtil
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import dev.pubgrade.core.EXCLUDED_DIRS
import java.io.File

/**
 * Everything that touches the user's machine: finding files, reading and
 * writing them, running `flutter pub get`. Kept in one place so the rest of
 * the plugin can stay pure.
 */
object Workspace {

    private val excluded = EXCLUDED_DIRS.toSet()

    /**
     * Every project pubspec.yaml across all content roots, sorted by path.
     *
     * We walk the tree rather than ask the filename index, because the index is
     * unavailable while the IDE is still building it and a refresh triggered at
     * startup would silently come back empty.
     */
    fun findPubspecs(project: Project): List<String> {
        val found = sortedSetOf<String>()
        for (root in ProjectRootManager.getInstance(project).contentRoots) {
            collect(root, found)
        }
        return found.toList()
    }

    private fun collect(dir: VirtualFile, into: MutableSet<String>) {
        if (!dir.isDirectory || dir.name in excluded) return
        for (child in dir.children) {
            if (child.isDirectory) {
                collect(child, into)
            } else if (child.name == "pubspec.yaml") {
                into.add(child.path)
            }
        }
    }

    /** Null when the file does not exist or cannot be read. */
    fun readTextFile(filePath: String): String? =
        runCatching { File(filePath).readText() }.getOrNull()

    /** Writes through the VFS so an open editor tab shows the change straight away. */
    fun writeTextFile(filePath: String, content: String) {
        val file = LocalFileSystem.getInstance().refreshAndFindFileByPath(filePath)
        if (file == null) {
            File(filePath).writeText(content)
            return
        }
        ApplicationManager.getApplication().invokeAndWait {
            ApplicationManager.getApplication().runWriteAction {
                VfsUtil.saveText(file, content)
            }
        }
    }

    /** The pubspec.lock sitting next to a pubspec.yaml, if there is one. */
    fun readLockFile(pubspecPath: String): String? =
        readTextFile(File(File(pubspecPath).parent, "pubspec.lock").path)

    /**
     * Runs `flutter pub get` in the folder that owns [pubspecPath].
     *
     * The working directory matters: in a monorepo, running it at the project
     * root would resolve the wrong package.
     *
     * The VS Code client sends this to a reusable terminal tab. There is no
     * cross-IDE equivalent here that does not pull in the terminal plugin, so
     * the process is run directly and its output is reported as a notification.
     * Call this off the UI thread.
     */
    fun runPubGet(project: Project, pubspecPath: String) {
        val workDirectory = File(pubspecPath).parentFile ?: return

        val command = GeneralCommandLine("flutter", "pub", "get")
            .withWorkDirectory(workDirectory)
            .withCharset(Charsets.UTF_8)

        val result = runCatching { ExecUtil.execAndGetOutput(command) }.getOrElse { error ->
            notify(project, "flutter pub get could not start: ${error.message}", NotificationType.ERROR)
            return
        }

        if (result.exitCode == 0) {
            notify(project, "flutter pub get finished in ${workDirectory.name}", NotificationType.INFORMATION)
        } else {
            notify(project, "flutter pub get failed:\n${result.stderr.ifBlank { result.stdout }}", NotificationType.ERROR)
        }
    }

    fun notify(project: Project, message: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("Pubgrade")
            .createNotification(message, type)
            .notify(project)
    }
}
