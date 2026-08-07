/** What to show for one step of the refresh. */
export interface ProgressStep {
  message: string;
  /** Percentage points to add to the bar since the previous step. */
  increment: number;
}

/**
 * Turns "checked 3 of 40" into the increments a progress bar wants.
 *
 * The bar takes deltas, not totals, so it only fills correctly if each step
 * reports the difference from the last one. Increments across a whole run add
 * up to exactly 100.
 */
export class ProgressTracker {
  private reportedPercent = 0;

  step(checked: number, total: number): ProgressStep {
    const percent = total > 0 ? (checked / total) * 100 : 100;
    const increment = percent - this.reportedPercent;
    this.reportedPercent = percent;

    return {
      message: `${checked} of ${total} packages checked`,
      increment
    };
  }
}
