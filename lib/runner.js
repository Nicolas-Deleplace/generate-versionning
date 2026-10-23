import { generateVersionAndBuild } from './versioning.js';
import { getTags, getAllAutoTags, createTag, deleteOldTags } from './api.js';
import { logInfo } from './logger.js';

/**
 * Orchestrate a full versioning run: list existing tags, decide the next
 * version/build, then create the new tag and prune the outdated ones.
 *
 * The prune keeps `newTag`, `currentTag` and `oldTag`, so every tag label
 * returned here still exists when later workflow steps read it (e.g. a job
 * checking out `old_tag_label` to build a changelog). Steady state is three
 * auto-versioned tags per prefix.
 *
 * Two separate tag listings are fetched on purpose:
 * - prefix-scoped tags drive the semver lifecycle and bound the deletion
 *   scope (a staging run never deletes prod tags, and vice versa);
 * - the global list of auto-versioned tags feeds the build number
 *   computation, so that workflows with different prefixes (staging, prod)
 *   share a single monotonic counter.
 *
 * When `dryRun` is true, no GitHub write call is issued — useful for CI
 * smoke tests and for previewing what the action would do.
 *
 * @param {object} params
 * @param {string} params.token - GitHub token with contents:write access on `repo`.
 * @param {string} params.repo - Repository in "owner/name" form.
 * @param {string} params.sha - Commit SHA the new tag should point to.
 * @param {object} params.inputs - Normalised action inputs.
 * @param {string} [params.inputs.prefix] - Tag prefix (empty string for non-prefixed `auto-v*`).
 * @param {string} [params.inputs.increment='patch'] - Semver increment strategy.
 * @param {'sequential'|'date'} [params.inputs.build_number_mode='sequential'] - Build number strategy.
 * @param {boolean} [params.inputs.build_number_reinit=false] - Sequential-only: reset the build to 1.
 * @param {boolean} [params.dryRun=false] - When true, skip tag creation/deletion and report the decision.
 * @returns {Promise<{ version: string, build: string, tag: string|null, oldTag?: string|null, currentTag?: string|null, dryRun?: boolean }>} The decisions taken (and, in dry-run, a `dryRun: true` flag).
 */
export async function runVersioningWorkflow({ token, repo, sha, inputs, dryRun = false }) {
    const { prefix = '', increment = 'patch', build_number_mode = 'sequential', build_number_reinit = false } = inputs;

    logInfo('🔍 Fetching tags from GitHub API...');

    const [scopedTags, allTags] = await Promise.all([
      getTags(token, repo, prefix),
      getAllAutoTags(token, repo),
    ]);

    logInfo('✔️ Tags found for current prefix:', scopedTags.map(t => t.ref));

    const {
      nextVersion,
      nextBuildNumber,
      newTag,
      currentTag,
      oldTag,
    } = generateVersionAndBuild(
      scopedTags,
      increment,
      build_number_mode,
      build_number_reinit === true,
      prefix,
      allTags,
    );

    const keepTags = [newTag, currentTag, oldTag];

    if (dryRun) {
      logInfo(`[dry-run] Would create tag: ${newTag}`);
      if (oldTag) {
        const { kept, deleted } = previewPrune(scopedTags, keepTags);
        logInfo(`[dry-run] Would keep tags: ${kept.join(', ')}`);
        logInfo(`[dry-run] Would delete tags: ${deleted.join(', ') || '(none)'}`);
      }
      return {
        version: nextVersion,
        build: nextBuildNumber,
        tag: newTag,
        dryRun: true,
      };
    }

    if (newTag) {
      await createTag(token, repo, newTag, sha);
    }
    if (oldTag) {
      await deleteOldTags(token, repo, scopedTags, ...keepTags);
    }

    return {
      version: nextVersion,
      build: nextBuildNumber,
      tag: newTag,
      oldTag,
      currentTag,
    };
}

/**
 * Mirror the `deleteOldTags` selection without calling the API, for dry-run
 * reporting.
 *
 * @param {Array<{ ref: string }>} refs - Prefix-scoped tag refs.
 * @param {Array<string|null|undefined>} keepTags - Tag labels to preserve; nullish entries are ignored.
 * @returns {{ kept: string[], deleted: string[] }} Labels of the tags that would be kept and deleted.
 */
function previewPrune(refs, keepTags) {
    const keepSet = new Set(keepTags.filter(Boolean));
    const deleted = refs
      .map(r => r.ref.replace('refs/tags/', ''))
      .filter(label => !keepSet.has(label));
    return { kept: [...keepSet], deleted };
}
