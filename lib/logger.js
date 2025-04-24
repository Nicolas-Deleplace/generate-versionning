import core from '@actions/core';

/**
 * Log info-level messages.
 * @param {string} message
 */
export function logInfo(message) {
    core.info(message);
}
  
/**
 * Log warning messages.
 * @param {string} message
 */
export function logWarning(message) {
    core.warning(message);
}

/**
 * Log error messages.
 * @param {string} message
 */
export function logError(message) {
    core.error(message);
}