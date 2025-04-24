import { test, expect, vi } from 'vitest';
import { runVersioningWorkflow } from '../lib/runner.js';

vi.mock('../lib/api.js', () => ({
  getTags: vi.fn().mockResolvedValue([
    { ref: 'refs/tags/auto-v2.0.0-1' },
    { ref: 'refs/tags/auto-v2.0.0-2' }
  ]),
  createTag: vi.fn(),
  deleteOldTags: vi.fn()
}));

test('Generates correct tag in dry-run mode', async () => {
  const result = await runVersioningWorkflow({
    token: 'fake-token',
    repo: 'nicolas/test',
    sha: 'abc123',
    dryRun: true,
    inputs: {
      prefix: '',
      increment: 'patch',
      build_number_mode: 'sequential',
      build_number_reinit: false
    }
  });

  expect(result.version).toBe('2.0.1');
  expect(result.build).toBe('3');
  expect(result.dryRun).toBe(true);
});