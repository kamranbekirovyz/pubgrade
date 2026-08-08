package dev.pubgrade.core

import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * How many pub.dev requests run at once during a refresh. Four is roughly 4x
 * faster than checking packages one by one and pub.dev is fine with it.
 */
const val CONCURRENT_REQUESTS = 4

/**
 * Runs [task] over every item, at most [limit] at a time, and blocks until all
 * of them are done. Results come back in input order; [onSettled] fires as each
 * item finishes, which is what drives the progress bar.
 *
 * The pool is created and shut down per call. A refresh happens a few times an
 * hour at most, so a long-lived pool would only be an object to keep alive and
 * remember to dispose.
 */
fun <T, R> mapWithLimit(
    items: List<T>,
    limit: Int,
    task: (T) -> R,
    onSettled: () -> Unit = {}
): List<R?> {
    if (items.isEmpty()) return emptyList()

    val results = arrayOfNulls<Any?>(items.size)
    val pool = Executors.newFixedThreadPool(minOf(limit, items.size))

    try {
        val futures = items.mapIndexed { index, item ->
            pool.submit {
                results[index] = runCatching { task(item) }.getOrNull()
                onSettled()
            }
        }
        futures.forEach { it.get() }
    } finally {
        pool.shutdown()
        pool.awaitTermination(1, TimeUnit.MINUTES)
    }

    @Suppress("UNCHECKED_CAST")
    return results.toList() as List<R?>
}
