import core from '@actions/core';
import { runVersioningWorkflow } from './lib/runner.js';
import { logInfo, logError } from './lib/logger.js';

async function run() {
  try {
    const token = core.getInput('token');
    const prefix = core.getInput('prefix') || '';
    const increment = core.getInput('increment') || 'patch';
    const mode = core.getInput('build_number_mode') || 'sequential';
    const reinit = core.getInput('build_number_reinit') === 'true';
    const dryRun = core.getInput('dry_run') === 'true';

    const repo = process.env.GITHUB_REPOSITORY;
    const sha = process.env.GITHUB_SHA;

    if (!repo || !sha) {
      throw new Error('Missing environment variables: GITHUB_REPOSITORY or GITHUB_SHA');
    }

    const result = await runVersioningWorkflow({
      token,
      repo,
      sha,
      dryRun,
      inputs: {
        prefix,
        increment,
        build_number_mode: mode,
        build_number_reinit: reinit,
      }
    });

    // Outputs for GitHub
    core.setOutput('version_number', result.version);
    core.setOutput('build_number', result.build);
    core.setOutput('tag_label', result.tag);
    core.setOutput('old_tag_label', result.oldTag || '');
    core.setOutput('previous_tag_label', result.oldTag || '');
    
    logInfo('Version number', result.version);
    logInfo('Build number: ', result.build);
    logInfo('New tag: ', result.tag);
    logInfo('Old tag: ', result.oldTag);

    logInfo('✅ Workflow completed successfully.');
  } catch (error) {
    logError(error.message);
    core.setFailed(error.message);
  }
}

run();
