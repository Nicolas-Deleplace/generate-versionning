import semver from 'semver';

/**
 * Parse a list of GitHub tag refs into the structured triples used by the
 * versioning logic. Refs that do not match the `(<prefix>-)?auto-vX.Y.Z-BUILD`
 * shape are dropped silently — this keeps the function robust against
 * unrelated tags that may live in the same repository.
 *
 * @param {Array<{ ref: string }>} tags - Tag refs as returned by the GitHub API.
 * @returns {Array<{ prefix: string, version: string, build: string, full: string }>} Parsed tag metadata.
 */
function parseTags(tags) {
  return tags
    .map(t => {
      const match = t.ref.match(/^refs\/tags\/(?:(.+)-)?auto-v(\d+\.\d+\.\d+)-(\d+)$/);
      return match
        ? {
            prefix: match[1] || '',
            version: match[2],
            build: match[3],
            full: t.ref.replace('refs/tags/', ''),
          }
        : null;
    })
    .filter(Boolean);
}

/**
 * Decide the next version, build number and tag label for a workflow run.
 *
 * The function operates on two distinct pools of tags:
 * - `scopedTags` drives the semver lifecycle of the current prefix
 *   (`currentTag`, `oldTag`, `nextVersion`). Only tags of the caller's
 *   prefix belong here.
 * - `allTags` drives the build number computation and is meant to be a
 *   superset spanning every prefix sharing the same counter (e.g. staging +
 *   prod). When omitted, it falls back to `scopedTags`, which preserves the
 *   legacy single-pool behaviour for callers that do not need cross-prefix
 *   synchronisation.
 *
 * Sharing one build counter across prefixes requires the workflows calling
 * this action to be serialised (see README: `concurrency:` at job level).
 * Without serialisation two parallel runs may both observe the same max
 * build and produce duplicate numbers.
 *
 * @param {Array<{ ref: string }>} scopedTags - Tags for the current prefix only.
 * @param {'patch'|'minor'|'major'|'bug'|'feature'|'no change'|'none'|'build number only'|'build'} increment - Version bump strategy.
 * @param {'sequential'|'date'} mode - How the build number is computed.
 * @param {boolean} reinit - When true (and mode is sequential), reset the build number to 1.
 * @param {string} prefix - Tag prefix used when emitting the new tag label (without the trailing "-auto").
 * @param {Array<{ ref: string }>} [allTags=scopedTags] - Superset of tags used to compute the build number across every prefix sharing the counter.
 * @returns {{ nextVersion: string, nextBuildNumber: string, currentTag: string|null, newTag: string|null, oldTag: string|null }} Decisions for the caller to act on.
 */
export function generateVersionAndBuild(scopedTags, increment, mode, reinit, prefix, allTags = scopedTags) {
  const effectivePrefix = prefix ? `${prefix}-auto` : 'auto';

  const scopedVersions = parseTags(scopedTags);
  const allVersions = parseTags(allTags);

  // Sort descending: highest version first, then highest build within the same version
  const sortedScoped = scopedVersions.sort((a, b) => {
    if (a.version !== b.version) {
      return semver.rcompare(a.version, b.version);
    }
    return compareBuild(a.build, b.build);
  });

  const latest = sortedScoped[0] || null;
  const previous = sortedScoped[1] || null;

  let nextVersion = '0.0.1';
  let nextBuild = computeNextBuild(allVersions, mode, reinit);
  let currentTag = null;
  let oldTag = null;
  let newTag = null;

  if (latest) {
    const currentVersion = latest.version;
    const currentBuild = latest.build;

    currentTag = latest.full;
    nextVersion = computeNextVersion(currentVersion, increment);

    oldTag = previous ? previous.full : null;

    if (increment === 'no change' || increment === 'none') {
      nextVersion = currentVersion;
      nextBuild = currentBuild;
      newTag = null;
    } else if (increment === 'build number only' || increment === 'build') {
      nextVersion = currentVersion;
      newTag = `${effectivePrefix}-v${currentVersion}-${nextBuild}`;
    } else {
      newTag = `${effectivePrefix}-v${nextVersion}-${nextBuild}`;
    }
  } else {
    nextVersion = computeNextVersion('0.0.0', increment);
    newTag = (increment === 'no change' || increment === 'none')
      ? null
      : `${effectivePrefix}-v${nextVersion}-${nextBuild}`;
  }

  return {
    nextVersion,
    nextBuildNumber: nextBuild,
    currentTag,
    newTag,
    oldTag,
  };
}

/**
 * Compute the next build number from the global tag pool.
 *
 * Sequential mode takes `max(build) + 1` across every parsed tag, so it
 * naturally shares a counter between prefixes when `allVersions` contains
 * every prefix's tags. Date mode produces `YYYYMMDD<NN>` where `<NN>` is the
 * next 2-digit counter among tags whose build already starts with today's
 * date — it resets automatically on a new day.
 *
 * @param {Array<{ build: string }>} allVersions - Parsed tags used as the counter source.
 * @param {'sequential'|'date'} mode - Build number strategy.
 * @param {boolean} reinit - Sequential-only: when true, the next build is "1".
 * @returns {string} Next build number as a string (so it can be appended to tag labels directly).
 */
function computeNextBuild(allVersions, mode, reinit) {
  if (mode === 'date') {
    const today = getTodayString();
    const todayBuilds = allVersions
      .filter(v => v.build.startsWith(today))
      .map(v => parseInt(v.build.slice(today.length)))
      .filter(n => !isNaN(n));

    const nextIncrement = Math.max(0, ...todayBuilds) + 1;
    return `${today}${nextIncrement.toString().padStart(2, '0')}`;
  }

  if (reinit) return '1';

  const builds = allVersions
    .map(v => parseInt(v.build.split('.').pop()))
    .filter(n => !isNaN(n));

  if (builds.length === 0) return '1';

  return (Math.max(...builds) + 1).toString();
}

/**
 * Apply a semver bump according to the action's increment vocabulary.
 * Unknown or non-bumping increments (`no change`, `none`, `build number only`,
 * `build`) return the input version unchanged.
 *
 * @param {string} version - Current semver (e.g. "2.3.1").
 * @param {string} increment - Increment strategy from the action input.
 * @returns {string} The next semver, or `version` when no bump applies.
 */
function computeNextVersion(version, increment) {
  if (['no change', 'none', 'build number only', 'build'].includes(increment)) return version;

  const typeMap = {
    patch: 'patch',
    bug: 'patch',
    minor: 'minor',
    feature: 'minor',
    major: 'major',
  };

  const type = typeMap[increment] || null;

  if (!type || !semver.valid(version)) {
    return version; // fallback: unknown increment or malformed version → no-op
  }

  return semver.inc(version, type);
}

/**
 * Compare two build numbers in descending order. Works for both sequential
 * (`"42"`) and date-based (`"2025042403"`) formats because the numeric
 * extraction preserves ordering in each.
 *
 * @param {string} a - First build string.
 * @param {string} b - Second build string.
 * @returns {number} Negative when `a` is greater, positive when `b` is greater, zero when equal.
 */
function compareBuild(a, b) {
  const aNum = parseInt(a.replace(/\D/g, ''));
  const bNum = parseInt(b.replace(/\D/g, ''));
  return bNum - aNum;
}

/**
 * Return today's date as `YYYYMMDD` in UTC, matching the prefix used by
 * date-mode build numbers.
 *
 * @returns {string} Eight-character date string.
 */
function getTodayString() {
  const now = new Date();
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}
