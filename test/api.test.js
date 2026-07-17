import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTags, getAllAutoTags, createTag, deleteOldTags } from '../lib/api.js';

/**
 * Helper — build a fake `Response`-like object as returned by `fetch`.
 * Exposes `status` and a `json()` method returning the supplied body.
 */
function fakeResponse(status, body = {}) {
  return { status, json: async () => body };
}

/**
 * Helper — build a tag ref payload matching what the GitHub REST API would
 * return from `/repos/{owner}/{repo}/git/refs/tags`.
 */
function ref(name) {
  return { ref: `refs/tags/${name}` };
}

describe('api.js', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getTags', () => {
    test('returns only tags matching the given prefix', async () => {
      fetchMock.mockResolvedValue(fakeResponse(200, [
        ref('staging-auto-v1.0.0-1'),
        ref('staging-auto-v1.0.0-2'),
        ref('auto-v1.0.0-3'),
        ref('prod-auto-v1.0.0-4'),
        ref('v1.0.0'),
      ]));

      const result = await getTags('token', 'owner/repo', 'staging');

      expect(result.map(t => t.ref)).toEqual([
        'refs/tags/staging-auto-v1.0.0-1',
        'refs/tags/staging-auto-v1.0.0-2',
      ]);
    });

    test('empty prefix returns only non-prefixed auto tags', async () => {
      fetchMock.mockResolvedValue(fakeResponse(200, [
        ref('staging-auto-v1.0.0-1'),
        ref('auto-v1.0.0-3'),
        ref('prod-auto-v1.0.0-4'),
      ]));

      const result = await getTags('token', 'owner/repo', '');

      expect(result.map(t => t.ref)).toEqual(['refs/tags/auto-v1.0.0-3']);
    });

    test('hits the correct GitHub endpoint with auth header', async () => {
      fetchMock.mockResolvedValue(fakeResponse(200, []));

      await getTags('my-token', 'acme/proj', 'staging');

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        'https://api.github.com/repos/acme/proj/git/refs/tags',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'token my-token',
            'Accept': 'application/vnd.github+json',
          }),
        }),
      );
    });

    test('returns [] when the repo has no tags (404)', async () => {
      fetchMock.mockResolvedValue(fakeResponse(404, { message: 'Not Found' }));

      const result = await getTags('token', 'owner/repo', 'staging');

      expect(result).toEqual([]);
    });

    test('throws on unexpected HTTP status', async () => {
      fetchMock.mockResolvedValue(fakeResponse(500, { message: 'boom' }));

      await expect(getTags('token', 'owner/repo', 'staging'))
        .rejects.toThrow(/Failed to fetch tags: 500/);
    });
  });

  describe('getAllAutoTags', () => {
    test('accepts prefixed and non-prefixed auto tags, rejects unrelated refs', async () => {
      fetchMock.mockResolvedValue(fakeResponse(200, [
        ref('auto-v1.0.0-1'),
        ref('staging-auto-v1.0.0-2'),
        ref('prod-auto-v1.0.0-3'),
        ref('multi-word-prefix-auto-v1.0.0-4'),
        ref('v1.0.0'),
        ref('release-123'),
        ref('auto-v1.0.0'),          // missing -build
        ref('some-auto-variant'),    // no version
        ref('auto-vX.Y.Z-1'),        // non-numeric version
        ref('auto-v1.0.0-abc'),      // non-numeric build
      ]));

      const result = await getAllAutoTags('token', 'owner/repo');

      expect(result.map(t => t.ref).sort()).toEqual([
        'refs/tags/auto-v1.0.0-1',
        'refs/tags/multi-word-prefix-auto-v1.0.0-4',
        'refs/tags/prod-auto-v1.0.0-3',
        'refs/tags/staging-auto-v1.0.0-2',
      ]);
    });

    test('returns [] when no tags match the auto pattern', async () => {
      fetchMock.mockResolvedValue(fakeResponse(200, [
        ref('v1.0.0'),
        ref('release-123'),
      ]));

      const result = await getAllAutoTags('token', 'owner/repo');

      expect(result).toEqual([]);
    });

    test('returns [] when the repo has no tags (404)', async () => {
      fetchMock.mockResolvedValue(fakeResponse(404, {}));

      const result = await getAllAutoTags('token', 'owner/repo');

      expect(result).toEqual([]);
    });
  });

  describe('createTag', () => {
    test('POSTs the expected body to the refs endpoint and resolves on 201', async () => {
      fetchMock.mockResolvedValue(fakeResponse(201, {}));

      await createTag('token', 'owner/repo', 'staging-auto-v1.0.0-3', 'abc123');

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        'https://api.github.com/repos/owner/repo/git/refs',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'token token',
          }),
          body: JSON.stringify({
            ref: 'refs/tags/staging-auto-v1.0.0-3',
            sha: 'abc123',
          }),
        }),
      );
    });

    test('throws with the failing status when API rejects the create (e.g. 422 duplicate)', async () => {
      fetchMock.mockResolvedValue(fakeResponse(422, { message: 'Reference already exists' }));

      await expect(createTag('token', 'owner/repo', 'auto-v1.0.0-3', 'sha'))
        .rejects.toThrow(/Failed to create tag auto-v1.0.0-3: 422/);
    });
  });

  describe('deleteOldTags', () => {
    test('deletes every ref except those listed in keepTags', async () => {
      fetchMock.mockResolvedValue(fakeResponse(204, {}));

      const refs = [
        ref('auto-v1.0.0-1'),
        ref('auto-v1.0.0-2'),
        ref('auto-v1.0.0-3'),
      ];
      await deleteOldTags('token', 'owner/repo', refs, 'auto-v1.0.0-3', 'auto-v1.0.0-2');

      // Only auto-v1.0.0-1 should be deleted.
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        'https://api.github.com/repos/owner/repo/git/tags/auto-v1.0.0-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    test('ignores nullish entries in keepTags (null, undefined, empty string)', async () => {
      fetchMock.mockResolvedValue(fakeResponse(204, {}));

      const refs = [ref('auto-v1.0.0-1')];
      await deleteOldTags('token', 'owner/repo', refs, null, undefined, '', 'auto-v1.0.0-1');

      // The only ref is in keepTags → no delete call.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test('continues the loop when an individual delete call fails', async () => {
      fetchMock
        .mockResolvedValueOnce(fakeResponse(404, { message: 'gone' }))
        .mockResolvedValueOnce(fakeResponse(204, {}));

      const refs = [
        ref('auto-v1.0.0-1'),
        ref('auto-v1.0.0-2'),
      ];
      await deleteOldTags('token', 'owner/repo', refs);

      // Both delete calls must have been attempted despite the first 404.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test('no-op when refs is empty', async () => {
      await deleteOldTags('token', 'owner/repo', []);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
