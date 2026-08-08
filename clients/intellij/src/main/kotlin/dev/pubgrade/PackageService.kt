package dev.pubgrade

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project as IdeProject
import dev.pubgrade.core.CONCURRENT_REQUESTS
import dev.pubgrade.core.Dependency
import dev.pubgrade.core.Package
import dev.pubgrade.core.Project
import dev.pubgrade.core.currentVersionOf
import dev.pubgrade.core.isOutdated
import dev.pubgrade.core.mapWithLimit
import dev.pubgrade.core.parseDependencies
import dev.pubgrade.core.parseLockedVersions
import dev.pubgrade.core.parseProjectName
import dev.pubgrade.core.setDependencyVersion
import dev.pubgrade.core.updateType
import dev.pubgrade.pub.PubDevApi
import java.io.File

/**
 * Owns the package list: builds it from the project, keeps it in sync when a
 * package is updated. The only stateful part of the plugin.
 *
 * Registered as a project-level service so every window gets its own, which is
 * what a monorepo opened twice needs.
 */
@Service(Service.Level.PROJECT)
class PackageService(private val ideProject: IdeProject) {

    val api = PubDevApi()
    val changelogs = ChangelogService(api)

    @Volatile
    var all: List<Project> = emptyList()
        private set

    val outdatedCount: Int
        get() = all.sumOf { project -> project.packages.count { it.isOutdated } }

    /** Rescans every pubspec.yaml and re-checks every dependency against pub.dev. */
    fun refresh(report: (checked: Int, total: Int) -> Unit) {
        api.clearCache()
        changelogs.clearCache()

        val sources = Workspace.findPubspecs(ideProject).mapNotNull(::readProject)
        val total = sources.sumOf { it.dependencies.size }
        var checked = 0
        report(0, total)

        val projects = mutableListOf<Project>()
        for (source in sources) {
            val packages = mapWithLimit(
                items = source.dependencies,
                limit = CONCURRENT_REQUESTS,
                task = { resolve(it, source.lockedVersions) },
                onSettled = { report(synchronized(this) { ++checked }, total) }
            ).filterNotNull()

            if (packages.isNotEmpty()) {
                projects.add(Project(source.name, source.pubspecPath, packages))
            }
        }

        all = projects
    }

    /**
     * Writes the new version into pubspec.yaml, refreshes the in-memory package
     * and runs `flutter pub get`. Returns false when nothing was written.
     */
    fun update(pubspecPath: String, packageName: String, version: String): Boolean {
        val content = Workspace.readTextFile(pubspecPath) ?: return false
        val updated = setDependencyVersion(content, packageName, version) ?: return false

        Workspace.writeTextFile(pubspecPath, updated)
        applyVersion(pubspecPath, packageName, version)
        Workspace.runPubGet(ideProject, pubspecPath)
        return true
    }

    private fun resolve(dependency: Dependency, lockedVersions: Map<String, String>): Package? {
        val remote = api.getPackage(dependency.name) ?: return null
        val currentVersion = currentVersionOf(dependency, lockedVersions)

        return Package(
            name = dependency.name,
            currentVersion = currentVersion,
            latestVersion = remote.latestVersion,
            isOutdated = isOutdated(currentVersion, remote.latestVersion),
            updateType = updateType(currentVersion, remote.latestVersion)
        )
    }

    private fun applyVersion(pubspecPath: String, packageName: String, version: String) {
        val pkg = all.firstOrNull { it.pubspecPath == pubspecPath }
            ?.packages?.firstOrNull { it.name == packageName }
            ?: return

        pkg.currentVersion = version
        pkg.isOutdated = isOutdated(version, pkg.latestVersion)
        pkg.updateType = updateType(version, pkg.latestVersion)
    }

    companion object {
        fun getInstance(project: IdeProject): PackageService = project.service()
    }
}

private class ProjectSource(
    val name: String,
    val pubspecPath: String,
    val dependencies: List<Dependency>,
    val lockedVersions: Map<String, String>
)

private fun readProject(pubspecPath: String): ProjectSource? {
    val content = Workspace.readTextFile(pubspecPath) ?: return null

    val dependencies = parseDependencies(content)
    if (dependencies.isEmpty()) return null

    val lockText = if (dependencies.any { it.hasCaret }) Workspace.readLockFile(pubspecPath) else null

    return ProjectSource(
        name = parseProjectName(content) ?: File(pubspecPath).parentFile?.name.orEmpty(),
        pubspecPath = pubspecPath,
        dependencies = dependencies,
        lockedVersions = lockText?.let(::parseLockedVersions) ?: emptyMap()
    )
}
