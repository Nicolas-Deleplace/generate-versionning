import { describe, test, expect, vi, beforeEach } from 'vitest';
import { runVersioningWorkflow } from '../lib/runner.js';

vi.mock('../lib/api.js', () => ({
  getTags: vi.fn(),
  getAllAutoTags: vi.fn(),
  createTag: vi.fn(),
  deleteOldTags: vi.fn(),
}));

import * as api from '../lib/api.js';

/**
 * Helper — build the minimal set of inputs expected by runVersioningWorkflow.
 * Callers can override any field. Keeps every test focused on the branch it
 * exercises without repeating boilerplate.
 */
function makeCall(overrides = {}) {
  return {
    token: 'fake-token',
    repo: 'owner/repo',
    sha: 'abc123',
    dryRun: false,
    inputs: {
      prefix: '',
      increment: 'patch',
      build_number_mode: 'sequential',
      build_number_reinit: false,
    },
    ...overrides,
  };
}

describe('runVersioningWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getTags.mockResolvedValue([]);
    api.getAllAutoTags.mockResolvedValue([]);
  });

  test('Generates correct tag in dry-run mode', async () => {
    const tags = [
      { ref: 'refs/tags/auto-v2.0.0-1' },
      { ref: 'refs/tags/auto-v2.0.0-2' },
    ];
    api.getTags.mockResolvedValue(tags);
    api.getAllAutoTags.mockResolvedValue(tags);

    const result = await runVersioningWorkflow(makeCall({ dryRun: true }));

    expect(result.version).toBe('2.0.1');
    expect(result.build).toBe('3');
    expect(result.dryRun).toBe(true);
    expect(api.createTag).not.toHaveBeenCalled();
    expect(api.deleteOldTags).not.toHaveBeenCalled();
  });

  test('Happy path: createTag is called with the computed label and sha, and deleteOldTags is called with the scoped list', async () => {
    const scoped = [
      { ref: 'refs/tags/auto-v2.0.0-1' },
      { ref: 'refs/tags/auto-v2.0.0-2' },
    ];
    api.getTags.mockResolvedValue(scoped);
    api.getAllAutoTags.mockResolvedValue(scoped);

    const result = await runVersioningWorkflow(makeCall());

    expect(api.createTag).toHaveBeenCalledExactlyOnceWith(
      'fake-token',
      'owner/repo',
      'auto-v2.0.1-3',
      'abc123',
    );
    expect(api.deleteOldTags).toHaveBeenCalledExactlyOnceWith(
      'fake-token',
      'owner/repo',
      scoped,
      'auto-v2.0.1-3',  // newTag — must be preserved
      'auto-v2.0.0-2',  // currentTag — must be preserved
      'auto-v2.0.0-1',  // oldTag — must be preserved
    );
    expect(result.tag).toBe('auto-v2.0.1-3');
    expect(result.oldTag).toBe('auto-v2.0.0-1');
  });

  test('increment "no change" skips createTag but still prunes the outdated tag', async () => {
    const scoped = [
      { ref: 'refs/tags/auto-v1.0.0-4' },
      { ref: 'refs/tags/auto-v1.0.0-5' },
    ];
    api.getTags.mockResolvedValue(scoped);
    api.getAllAutoTags.mockResolvedValue(scoped);

    const result = await runVersioningWorkflow(
      makeCall({ inputs: { increment: 'no change' } }),
    );

    expect(result.tag).toBeNull();
    expect(api.createTag).not.toHaveBeenCalled();
    // With "no change", no new tag is created but outdated scoped tags are
    // still pruned — `currentTag` and `oldTag` are preserved, `newTag` is null.
    expect(api.deleteOldTags).toHaveBeenCalledExactlyOnceWith(
      'fake-token',
      'owner/repo',
      scoped,
      null,
      'auto-v1.0.0-5',
      'auto-v1.0.0-4',
    );
  });

  test('old_tag_label is never deleted: the tag handed to the caller survives the prune', async () => {
    const scoped = [
      { ref: 'refs/tags/auto-v1.0.0-1' },
      { ref: 'refs/tags/auto-v1.0.0-2' },
      { ref: 'refs/tags/auto-v1.0.0-3' },
      { ref: 'refs/tags/auto-v1.0.0-4' },
    ];
    api.getTags.mockResolvedValue(scoped);
    api.getAllAutoTags.mockResolvedValue(scoped);

    const result = await runVersioningWorkflow(makeCall());

    expect(result.tag).toBe('auto-v1.0.1-5');
    expect(result.currentTag).toBe('auto-v1.0.0-4');
    expect(result.oldTag).toBe('auto-v1.0.0-3');

    // Replay the captured call through the real deleteOldTags, with fetch
    // stubbed, to see which refs would actually be deleted.
    const fetchMock = vi.fn().mockResolvedValue({ status: 204, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { deleteOldTags } = await vi.importActual('../lib/api.js');
      await deleteOldTags(...api.deleteOldTags.mock.calls[0]);
    } finally {
      vi.unstubAllGlobals();
    }

    const deleted = fetchMock.mock.calls.map(([url]) => url.split('/git/refs/tags/')[1]);
    expect(deleted).toEqual(['auto-v1.0.0-1', 'auto-v1.0.0-2']);
  });

  test('Single scoped tag: createTag runs but deleteOldTags is skipped (no oldTag)', async () => {
    const scoped = [{ ref: 'refs/tags/auto-v1.0.0-5' }];
    api.getTags.mockResolvedValue(scoped);
    api.getAllAutoTags.mockResolvedValue(scoped);

    await runVersioningWorkflow(makeCall());

    expect(api.createTag).toHaveBeenCalledExactlyOnceWith(
      'fake-token',
      'owner/repo',
      'auto-v1.0.1-6',
      'abc123',
    );
    expect(api.deleteOldTags).not.toHaveBeenCalled();
  });

  test('Shared counter: scoped pool empty but global pool drives the build number', async () => {
    // Simulates the first staging run on a repo where prod has already tagged.
    api.getTags.mockResolvedValue([]);
    api.getAllAutoTags.mockResolvedValue([
      { ref: 'refs/tags/auto-v1.0.0-10' },
      { ref: 'refs/tags/auto-v1.0.0-11' },
    ]);

    const result = await runVersioningWorkflow(
      makeCall({ dryRun: true, inputs: { prefix: 'staging', increment: 'patch' } }),
    );

    expect(result.build).toBe('12');
    expect(result.tag).toBe('staging-auto-v0.0.1-12');
  });
});
