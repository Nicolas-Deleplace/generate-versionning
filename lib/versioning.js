import semver from 'semver';
import { logInfo } from './logger.js';

/**
 * Génère les prochaines versions et tags.
 */
export function generateVersionAndBuild(existingTags, increment, mode, reinit, prefix) {
  const effectivePrefix = prefix ? `${prefix}-auto` : 'auto';

  const versions = existingTags.map(t => {
    const match = t.ref.match(/^refs\/tags\/(?:(.+)-)?auto-v(\d+\.\d+\.\d+)-(\d+)$/);
    return match ? {
      prefix: match[1] || '',
      version: match[2],
      build: match[3],
      full: t.ref.replace('refs/tags/', '')
    } : null;
  }).filter(Boolean);

  // Tri décroissant par version, puis par numéro de build
  const sorted = versions.sort((a, b) => {
    if (a.version !== b.version) {
      return semver.rcompare(a.version, b.version);
    }
    return compareBuild(a.build, b.build);
  });

  const latest = sorted[0] || null;
  const previous = sorted[1] || null;

  let nextVersion = '0.0.1';
  let nextBuild = '1';
  let currentTag = null;
  let oldTag = null;
  let newTag = null;

  if (latest) {
    const currentVersion = latest.version;
    const currentBuild = latest.build;

    currentTag = latest.full;
    nextVersion = computeNextVersion(currentVersion, increment);

    oldTag = previous ? previous.full : null;

    if (mode === 'date') {
      const today = getTodayString();

      const todayBuilds = versions
        .filter(v => v.build.startsWith(today))
        .map(v => parseInt(v.build.slice(today.length)))
        .filter(n => !isNaN(n));

      const nextIncrement = Math.max(0, ...todayBuilds) + 1;
      nextBuild = `${today}${nextIncrement.toString().padStart(2, '0')}`;
    } else {
      const currentBuildNum = parseInt(currentBuild.split('.').pop());
      nextBuild = reinit ? '1' : (currentBuildNum + 1).toString();
    }

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
    if (mode === 'date') {
      nextBuild = `${getTodayString()}01`;
    }
    currentTag = null;
    oldTag = null;
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
 * Compute the next semantic version
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
    return version; // fallback
  }

  return semver.inc(version, type);
}

/**
 * Compare two build numbers (handles numeric and date-based)
 */
function compareBuild(a, b) {
  const aNum = parseInt(a.replace(/\D/g, ''));
  const bNum = parseInt(b.replace(/\D/g, ''));
  return bNum - aNum;
}

/**
 * Get current date as YYYYMMDD
 */
function getTodayString() {
  const now = new Date();
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}
