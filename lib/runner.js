import { generateVersionAndBuild } from './versioning.js';
import { getTags, createTag, deleteOldTags } from './api.js';
import { logInfo } from './logger.js';

export async function runVersioningWorkflow({ token, repo, sha, inputs, dryRun = false }) {
    const { prefix = '', increment = 'patch', build_number_mode = 'sequential', build_number_reinit = false } = inputs;
  
    console.log("🔍 Checking tags from API...");

    const existingTags = await getTags(token, repo, prefix);
    
    console.log("✔️ Tags found:", existingTags.map(t => t.ref));


    const {
      nextVersion,
      nextBuildNumber,
      newTag,
      currentTag,
      oldTag,
    } = generateVersionAndBuild(existingTags, increment, build_number_mode, build_number_reinit === true, prefix);
  
    if (dryRun) {
      logInfo(`[dry-run] Would create tag: ${newTag}`);
      logInfo(`[dry-run] Would keep tag: ${currentTag}`);
      if (oldTag) logInfo(`[dry-run] Would delete old tag: ${oldTag}`);
      return {
        version: nextVersion,
        build: nextBuildNumber,
        tag: newTag,
        dryRun: true,
      };
    }
  
    await createTag(token, repo, newTag, sha);
    if (oldTag) {
      await deleteOldTags(token, repo, existingTags, newTag, currentTag);
    }
  
    return {
      version: nextVersion,
      build: nextBuildNumber,
      tag: newTag,
      oldTag,
      currentTag,
    };
}