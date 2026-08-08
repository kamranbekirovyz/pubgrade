package dev.pubgrade.core

import java.time.Duration
import java.time.Instant

/**
 * Drops leading constraint operators: `^1.2.3` -> `1.2.3`, `>=2.0.0` -> `2.0.0`.
 *
 * Ranges such as `>=1.0.0 <2.0.0` and keywords such as `any` come out as
 * something [SemVer.parse] cannot read. That is deliberate: we only ever offer
 * updates for constraints we know how to rewrite safely, and everything else is
 * reported as up to date rather than guessed at.
 */
fun stripConstraint(constraint: String): String =
    constraint.trim().trimStart('^', '>', '=', '<').trim()

fun isOutdated(current: String, latest: String): Boolean {
    val a = SemVer.parse(current) ?: return false
    val b = SemVer.parse(latest) ?: return false
    return b > a
}

fun updateType(current: String, latest: String): UpdateType {
    val a = SemVer.parse(current) ?: return UpdateType.NONE
    val b = SemVer.parse(latest) ?: return UpdateType.NONE
    if (b <= a) return UpdateType.NONE
    return when {
        b.major != a.major -> UpdateType.MAJOR
        b.minor != a.minor -> UpdateType.MINOR
        else -> UpdateType.PATCH
    }
}

/** True when [version] is newer than [from] and no newer than [to]. */
fun isInRange(version: String, from: String, to: String): Boolean {
    val v = SemVer.coerce(version) ?: return false
    val a = SemVer.parse(from) ?: return false
    val b = SemVer.parse(to) ?: return false
    return v > a && v <= b
}

private const val MINUTE = 60L
private const val HOUR = 60 * MINUTE
private const val DAY = 24 * HOUR
private const val MONTH = 30 * DAY
private const val YEAR = 365 * DAY

/** `2 days ago`. [now] is a parameter so tests do not depend on the clock. */
fun formatRelativeTime(date: Instant, now: Instant = Instant.now()): String {
    val seconds = Duration.between(date, now).seconds

    return when {
        seconds < MINUTE -> "just now"
        seconds < HOUR -> plural(seconds / MINUTE, "minute")
        seconds < DAY -> plural(seconds / HOUR, "hour")
        seconds < MONTH -> plural(seconds / DAY, "day")
        seconds < YEAR -> plural(seconds / MONTH, "month")
        else -> plural(seconds / YEAR, "year")
    }
}

private fun plural(count: Long, unit: String): String =
    "$count $unit${if (count == 1L) "" else "s"} ago"
