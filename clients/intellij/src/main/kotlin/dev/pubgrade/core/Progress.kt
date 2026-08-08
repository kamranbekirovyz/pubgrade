package dev.pubgrade.core

/** What to show for one step of the refresh. */
data class ProgressStep(
    val message: String,
    /** How full the bar should be, 0.0 to 1.0. */
    val fraction: Double
)

/**
 * Turns "checked 3 of 40" into what a progress bar wants.
 *
 * The VS Code client reports deltas here because its API takes increments.
 * IntelliJ's indicator takes an absolute fraction instead, so this is the one
 * piece of the port that is genuinely different rather than translated.
 */
fun progressStep(checked: Int, total: Int) = ProgressStep(
    message = "$checked of $total packages checked",
    fraction = if (total > 0) checked.toDouble() / total else 1.0
)
