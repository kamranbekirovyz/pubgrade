package dev.pubgrade.ui

import com.intellij.icons.AllIcons
import com.intellij.ui.ColoredTreeCellRenderer
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.JBUI
import dev.pubgrade.PackageService
import dev.pubgrade.core.Package
import dev.pubgrade.core.Project
import dev.pubgrade.core.UpdateType
import dev.pubgrade.core.byOutdatedCountThenName
import dev.pubgrade.core.byOutdatedThenName
import dev.pubgrade.core.countOutdated
import dev.pubgrade.core.updateTooltip
import java.awt.BorderLayout
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.BorderFactory
import javax.swing.JPanel
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel
import javax.swing.tree.TreePath

/** A row in the tree: either a pubspec.yaml or one of its dependencies. */
sealed interface Node {
    data class ProjectRow(val project: Project) : Node
    data class PackageRow(val pkg: Package, val pubspecPath: String) : Node
}

/**
 * The package list. Mirrors the VS Code sidebar: outdated first, coloured by
 * how big the jump is, one click opens the changelog.
 */
class PackagesTreePanel(
    private val service: PackageService,
    private val onOpen: (Package, String) -> Unit
) : JPanel(BorderLayout()) {

    private val root = DefaultMutableTreeNode()
    private val model = DefaultTreeModel(root)
    private val tree = Tree(model).apply {
        isRootVisible = false
        showsRootHandles = true
        cellRenderer = Renderer()
        border = JBUI.Borders.empty(4)
    }

    init {
        border = BorderFactory.createEmptyBorder()
        add(JBScrollPane(tree), BorderLayout.CENTER)

        tree.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(event: MouseEvent) {
                if (event.clickCount != 1) return
                val path = tree.getPathForLocation(event.x, event.y) ?: return
                val row = (path.lastPathComponent as? DefaultMutableTreeNode)?.userObject
                if (row is Node.PackageRow) onOpen(row.pkg, row.pubspecPath)
            }
        })
    }

    /** Rebuilds the whole tree. The list is small, so there is nothing to diff. */
    fun render() {
        root.removeAllChildren()

        val projects = service.all
        // A single project shows a flat package list; a monorepo groups by project.
        if (projects.size == 1) {
            projects.first().addPackagesTo(root)
        } else {
            for (project in projects.sortedWith(byOutdatedCountThenName)) {
                val node = DefaultMutableTreeNode(Node.ProjectRow(project))
                project.addPackagesTo(node)
                root.add(node)
            }
        }

        model.reload()
        expandAll()
    }

    private fun Project.addPackagesTo(parent: DefaultMutableTreeNode) {
        for (pkg in packages.sortedWith(byOutdatedThenName)) {
            parent.add(DefaultMutableTreeNode(Node.PackageRow(pkg, pubspecPath)))
        }
    }

    private fun expandAll() {
        var row = 0
        while (row < tree.rowCount) {
            tree.expandRow(row)
            row++
        }
        if (root.childCount > 0) tree.selectionPath = TreePath(root.path)
    }

    private class Renderer : ColoredTreeCellRenderer() {
        override fun customizeCellRenderer(
            tree: JTree,
            value: Any?,
            selected: Boolean,
            expanded: Boolean,
            leaf: Boolean,
            row: Int,
            hasFocus: Boolean
        ) {
            when (val node = (value as? DefaultMutableTreeNode)?.userObject) {
                is Node.ProjectRow -> {
                    val outdated = countOutdated(node.project)
                    icon = AllIcons.Nodes.Folder
                    append(node.project.name)
                    append("  ")
                    append(
                        if (outdated > 0) "$outdated outdated" else "all up to date",
                        SimpleTextAttributes.GRAYED_ATTRIBUTES
                    )
                }

                is Node.PackageRow -> {
                    val pkg = node.pkg
                    append(pkg.name)
                    append("  ")
                    if (pkg.isOutdated) {
                        icon = iconFor(pkg.updateType)
                        append(
                            "${pkg.currentVersion} → ${pkg.latestVersion}",
                            SimpleTextAttributes.GRAYED_ATTRIBUTES
                        )
                        toolTipText = updateTooltip(pkg)
                    } else {
                        icon = AllIcons.General.InspectionsOK
                        append(pkg.currentVersion, SimpleTextAttributes.GRAYED_ATTRIBUTES)
                        toolTipText = "Up to date"
                    }
                }

                else -> Unit
            }
        }

        /** Red asks for care, blue is safe. Same reading as the VS Code icons. */
        private fun iconFor(type: UpdateType) = when (type) {
            UpdateType.MAJOR -> AllIcons.General.Error
            UpdateType.MINOR -> AllIcons.General.Warning
            UpdateType.PATCH -> AllIcons.General.Information
            UpdateType.NONE -> AllIcons.General.Warning
        }
    }
}
