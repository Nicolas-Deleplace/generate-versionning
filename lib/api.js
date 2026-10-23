import { logInfo, logWarning } from './logger.js';

const BASE_URL = 'https://api.github.com';

/**
 * Perform a GitHub REST API request and return the parsed response.
 *
 * Non-2xx responses are NOT thrown from here — callers inspect `status` and
 * decide what to do (e.g. `getTags` treats 404 as "no tags yet"). A missing
 * or non-JSON body yields `{}` so callers can always destructure safely.
 *
 * @param {'GET'|'POST'|'DELETE'} method - HTTP verb.
 * @param {string} path - API path starting with a leading slash (e.g. "/repos/foo/bar/git/refs/tags").
 * @param {string} token - GitHub token used for the Authorization header.
 * @param {object|null} [body=null] - Optional JSON payload; serialized only when provided.
 * @returns {Promise<{ status: number, data: any }>} HTTP status and parsed JSON body.
 */
async function githubRequest(method, path, token, body = null) {
    const url = `${BASE_URL}${path}`;
    const options = {
      method,
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'versioning-action',
      },
    };
    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({})); // fallback if no JSON body
    return { status: res.status, data };
}

/**
 * Fetch the raw list of tag refs from the repository.
 * Returns an empty array when the repository has no tags yet (HTTP 404).
 *
 * @param {string} token - GitHub token with contents:read access.
 * @param {string} repo - Repository in "owner/name" form.
 * @returns {Promise<Array<{ ref: string }>>} All tag refs as returned by the GitHub API.
 * @throws {Error} When the API responds with anything other than 200 or 404.
 */
async function fetchRawTags(token, repo) {
    const path = `/repos/${repo}/git/refs/tags`;
    const { status, data } = await githubRequest('GET', path, token);

    if (status === 404) return []; // No tags
    if (status !== 200) throw new Error(`Failed to fetch tags: ${status} ${JSON.stringify(data)}`);

    logInfo('🔍 Tags received:', data.map(d => d.ref));

    return data;
}

/**
 * Fetch existing tags that match the given prefix.
 *
 * These are the tags that drive the version lifecycle of the current semantic
 * (e.g. staging, prod): they determine `currentTag`, `oldTag` and the next
 * semver bump, and they are the only tags this workflow is allowed to delete.
 *
 * @param {string} token - GitHub token with contents:read access.
 * @param {string} repo - Repository in "owner/name" form.
 * @param {string} prefix - Optional prefix used to scope the match (e.g. "staging"). Empty string matches non-prefixed `auto-v*` tags.
 * @returns {Promise<Array<{ ref: string }>>} Tags matching `${prefix}-auto-vX.Y.Z-BUILD` (or `auto-vX.Y.Z-BUILD` when `prefix` is empty).
 */
export async function getTags(token, repo, prefix) {
    const data = await fetchRawTags(token, repo);

    const effectivePrefix = prefix ? `${prefix}-auto` : `auto`;
    const regex = new RegExp(`^refs/tags/${effectivePrefix}-v(\\d+\\.\\d+\\.\\d+)-(\\d+)$`);

    const filtered = data.filter(ref => regex.test(ref.ref));

    logInfo(`🔍 Found ${filtered.length} matching tags for prefix "${prefix || '(none)'}": ${filtered.map(t => t.ref).join(', ')}`);

    return filtered;
}

/**
 * Fetch every auto-versioned tag across the repository, regardless of prefix.
 *
 * Used to compute a build number that is shared across all semantics running
 * against the same repo (e.g. staging + prod). The caller keeps using
 * `getTags` for the prefix-scoped lifecycle (version bump, tag deletion) and
 * overlays this broader list only to decide the next build number.
 *
 * Matches tags of the form `(<prefix>-)?auto-vX.Y.Z-BUILD`, where `<prefix>`
 * may itself contain dashes (e.g. `foo-bar-auto-v1.0.0-3`).
 *
 * @param {string} token - GitHub token with contents:read access.
 * @param {string} repo - Repository in "owner/name" form.
 * @returns {Promise<Array<{ ref: string }>>} All tags matching the auto-versioning pattern, any prefix.
 */
export async function getAllAutoTags(token, repo) {
    const data = await fetchRawTags(token, repo);

    const regex = /^refs\/tags\/(?:[^/\s]+-)?auto-v\d+\.\d+\.\d+-\d+$/;
    const filtered = data.filter(ref => regex.test(ref.ref));

    logInfo(`🔍 Found ${filtered.length} auto-versioned tags across all prefixes: ${filtered.map(t => t.ref).join(', ')}`);

    return filtered;
}

/**
 * Create a new lightweight tag ref pointing at the given commit.
 *
 * GitHub rejects the call with HTTP 422 when a ref of the same name already
 * exists — that atomicity is what makes parallel workflow runs safe as long
 * as their prefixes differ.
 *
 * @param {string} token - GitHub token with contents:write access.
 * @param {string} repo - Repository in "owner/name" form.
 * @param {string} tag - Tag label WITHOUT the "refs/tags/" prefix (e.g. "staging-auto-v1.0.0-3").
 * @param {string} sha - Commit SHA the tag should point at.
 * @throws {Error} When the API does not respond with 201.
 */
export async function createTag(token, repo, tag, sha) {
    const path = `/repos/${repo}/git/refs`;
    const body = { ref: `refs/tags/${tag}`, sha };
  
    const { status, data } = await githubRequest('POST', path, token, body);
    if (status !== 201) {
      throw new Error(`Failed to create tag ${tag}: ${status} ${JSON.stringify(data)}`);
    }
}


/**
 * Delete every tag ref in `refs` except those listed in `keepTags`.
 *
 * Only operate on the list the caller provided — in practice this is the
 * prefix-scoped list from `getTags`, so a staging run will never delete a
 * prod tag (and vice versa). Individual failures are logged as warnings and
 * do not abort the loop, since tag cleanup is best-effort.
 *
 * The runner passes `newTag`, `currentTag` and `oldTag` as `keepTags`, so
 * every tag label it outputs still exists when later workflow steps read it.
 *
 * @param {string} token - GitHub token with contents:write access.
 * @param {string} repo - Repository in "owner/name" form.
 * @param {Array<{ ref: string }>} refs - Tag refs to consider for deletion (must belong to the caller's prefix).
 * @param {...(string|null|undefined)} keepTags - Tag labels (without "refs/tags/") to preserve; nullish entries are ignored.
 */
export async function deleteOldTags(token, repo, refs, ...keepTags) {
    const keepSet = new Set(keepTags.filter(Boolean).map(t => `tags/${t}`));
  
    for (const ref of refs) {
      const refName = ref.ref.replace('refs/', '');
      if (!keepSet.has(refName)) {
        // Deleting a ref goes through /git/refs/<ref>; /git/tags/<sha> is the
        // unrelated "get a tag object" endpoint and always answers 404 here.
        const path = `/repos/${repo}/git/${ref.ref}`;
        const { status, data } = await githubRequest('DELETE', path, token);
        if (status === 204) {
          logInfo(`Deleted old tag: ${refName}`);
        } else {
          logWarning(`Could not delete tag ${refName}: ${status} ${JSON.stringify(data)}`);
        }
      }
    }
  }