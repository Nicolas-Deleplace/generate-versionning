/**
 * Create a mock tag object similar to GitHub API response
 * @param {string} version - Semantic version (e.g. "2.0.0")
 * @param {string|number} build - Build number (e.g. "3" or "2025042401")
 * @param {string} prefix - Optional prefix (e.g. "staging")
 * @returns {{ ref: string }}
 */
export function mockTag(version, build, prefix = '') {
    const effectivePrefix = prefix ? `${prefix}-auto` : 'auto';
    return {
      ref: `refs/tags/${effectivePrefix}-v${version}-${build}`
    };
  }