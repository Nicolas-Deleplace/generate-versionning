import core from '@actions/core';

/**
 * Format a single log argument into a human-readable string.
 * Objects and arrays are JSON-stringified so they show up readably in the
 * GitHub Actions log (otherwise they would render as `[object Object]`).
 *
 * @param {unknown} arg - Value to format.
 * @returns {string} Safe string representation.
 */
function formatArg(arg) {
  if (arg === null || arg === undefined) return String(arg);
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

/**
 * Join a variadic list of log arguments into the single string expected by
 * `@actions/core`. Accepts any mix of strings, numbers, arrays and objects.
 *
 * @param {unknown[]} args - Arguments passed to a log call.
 * @returns {string} Space-separated message.
 */
function formatMessage(args) {
  return args.map(formatArg).join(' ');
}

/**
 * Log an info-level message to the GitHub Actions runner output.
 *
 * Variadic: `logInfo('Build number:', 42)` emits `"Build number: 42"` — call
 * sites can pass a label plus one or more values without pre-formatting.
 *
 * @param {...unknown} args - Message fragments.
 */
export function logInfo(...args) {
  core.info(formatMessage(args));
}

/**
 * Log a warning-level message (yellow annotation in the Actions UI).
 *
 * @param {...unknown} args - Message fragments.
 */
export function logWarning(...args) {
  core.warning(formatMessage(args));
}

/**
 * Log an error-level message (red annotation in the Actions UI). Does not
 * fail the job on its own — use `core.setFailed` from the entry point for
 * that.
 *
 * @param {...unknown} args - Message fragments.
 */
export function logError(...args) {
  core.error(formatMessage(args));
}
