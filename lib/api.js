import { logInfo, logWarning, logError } from './logger.js';

const BASE_URL = 'https://api.github.com';

/**
 * Make a GitHub API request
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
 * Fetch existing tags matching the given prefix
 */
export async function getTags(token, repo, prefix) {
    const path = `/repos/${repo}/git/refs/tags`;
    const { status, data } = await githubRequest('GET', path, token);
  
    logInfo(`🔍 Tags received:`, data.map(d => d.ref));

    if (status === 404) return []; // No tags
    if (status !== 200) throw new Error(`Failed to fetch tags: ${status} ${JSON.stringify(data)}`);
  
    const effectivePrefix = prefix ? `${prefix}-auto` : `auto`;
    const regex = new RegExp(`^refs/tags/${effectivePrefix}-v(\\d+\\.\\d+\\.\\d+)-(\\d+)$`);

    const filtered = data.filter(ref => regex.test(ref.ref));

    logInfo(`🔍 Found ${filtered.length} matching tags: ${filtered.map(t => t.ref).join(', ')}`);

    return filtered;
  }

/**
 * Create a new tag ref
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
 * Delete old tag refs, excluding the one to keep
 */
export async function deleteOldTags(token, repo, refs, ...keepTags) {
    const keepSet = new Set(keepTags.filter(Boolean).map(t => `tags/${t}`));
  
    for (const ref of refs) {
      const refName = ref.ref.replace('refs/', '');
      if (!keepSet.has(refName)) {
        const path = `/repos/${repo}/git/${refName}`;
        const { status, data } = await githubRequest('DELETE', path, token);
        if (status === 204) {
          logInfo(`Deleted old tag: ${refName}`);
        } else {
          logWarning(`Could not delete tag ${refName}: ${status} ${JSON.stringify(data)}`);
        }
      }
    }
  }