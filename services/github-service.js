// services/github-service.js — GitHub API: repo creation + file upload via tree API
// Uses real GitHub REST API v3. No simulation.

const GITHUB_API = 'https://api.github.com';

async function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

/**
 * Validate a GitHub Personal Access Token.
 * @returns {{ username: string, name: string }}
 */
export async function validateGithubToken(token) {
  const res = await fetch(`${GITHUB_API}/user`, { headers: await ghHeaders(token) });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('Token is invalid or expired. Generate a new one at github.com/settings/tokens');
    }
    throw new Error(`GitHub API returned ${res.status}`);
  }
  const user = await res.json();
  if (!user.login) throw new Error('Unexpected GitHub API response');
  return { username: user.login, name: user.name || user.login };
}

/**
 * Get an existing repo or create a new one.
 * Always creates with auto_init: true so the repo is never empty.
 * @param {Object} [opts] - { description, private, auto_init } overrides
 * @returns {Object} GitHub repo object
 */
export async function getOrCreateRepo(token, repoName, username, onLog, opts = {}) {
  const headers = await ghHeaders(token);

  // Check if repo exists
  onLog(`🔍 Checking repo ${username}/${repoName}...`);
  const check = await fetch(`${GITHUB_API}/repos/${username}/${repoName}`, { headers });

  if (check.ok) {
    const repo = await check.json();
    onLog(`✓ Repo exists: ${repo.html_url}`);
    return repo;
  }

  if (check.status !== 404) {
    const err = await check.json().catch(() => ({}));
    if (check.status === 403) {
      throw new Error(`Permission denied checking repo. Token needs 'repo' scope. (${check.status})`);
    }
    throw new Error(`Failed to check repo: ${err.message || check.status}`);
  }

  // Create new repo — always with auto_init so the repo has at least one commit
  onLog(`📁 Creating repo ${repoName}...`);
  const create = await fetch(`${GITHUB_API}/user/repos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: repoName,
      auto_init: opts.auto_init !== undefined ? opts.auto_init : true,
      private: opts.private || false,
      description: opts.description || 'Deployed via Gold_Crew',
    }),
  });

  if (!create.ok) {
    const err = await create.json().catch(() => ({}));
    if (create.status === 422) {
      throw new Error(`Repo "${repoName}" already exists but you don't have access, or the name is invalid.`);
    }
    if (create.status === 403) {
      throw new Error('Permission denied creating repo. Token needs "repo" scope (Classic) or "Administration" permission (Fine-grained).');
    }
    throw new Error(`Failed to create repo: ${err.message || create.status}`);
  }

  const repo = await create.json();
  onLog(`✓ Repo created: ${repo.html_url}`);
  return repo;
}

/**
 * Initialize an empty repo by creating a README via the Contents API.
 * This gives the repo its first commit so the Git Data API can create trees.
 */
async function initEmptyRepo(token, owner, repo, branch, headers) {
  const readmeContent = btoa(`# ${repo}\n\nDeployed via Gold_Crew\n`);
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/README.md`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Initialize ${repo}`,
      content: readmeContent,
      branch: branch,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to initialize repo: ${err.message || res.status}`);
  }
}

/**
 * Upload files to a GitHub repo using the Git data API (blobs → tree → commit → ref).
 * This creates a single atomic commit with all files.
 */
export async function uploadFiles(token, owner, repo, files, branch, onLog) {
  const headers = await ghHeaders(token);

  // ── Step 1: Create blobs for all files (batched) ──
  onLog(`⬆️ Uploading ${files.length} files...`);
  const blobs = [];
  const BATCH = 30;
  const encoder = new TextEncoder();

  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (file) => {
      let content, encoding;
      const rawBytes = file.text !== null
        ? encoder.encode(file.text)
        : file.content;
      if (file.text !== null) {
        content = file.text;
        encoding = 'utf-8';
      } else {
        content = uint8ToBase64(file.content);
        encoding = 'base64';
      }

      const bRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content, encoding }),
      });

      if (!bRes.ok) {
        if (bRes.status === 409) {
          const sha = await computeGitBlobSha(rawBytes);
          return { path: file.path, sha, mode: '100644', type: 'blob' };
        }
        if (bRes.status === 403) {
          throw new Error(`Permission denied creating blob for "${file.path}". Check token scopes.`);
        }
        if (bRes.status === 422) {
          throw new Error(`Invalid file content for "${file.path}" (may be too large or malformed).`);
        }
        throw new Error(`Blob creation failed for "${file.path}": HTTP ${bRes.status}`);
      }

      const blob = await bRes.json();
      return { path: file.path, sha: blob.sha, mode: '100644', type: 'blob' };
    }));

    blobs.push(...results);

    // Check rate limit every 100 files
    if (i + BATCH < files.length && i > 0 && i % 100 === 0) {
      const rateRes = await fetch(`${GITHUB_API}/rate_limit`, { headers });
      if (rateRes.ok) {
        const rate = await rateRes.json();
        const remaining = rate.resources?.core?.remaining || 0;
        if (remaining < 50) {
          const resetTime = new Date(rate.resources.core.reset * 1000);
          onLog(`⚠️ GitHub rate limit low (${remaining} remaining). Resets at ${resetTime.toLocaleTimeString()}`);
          if (remaining < 10) {
            const waitMs = Math.max(0, rate.resources.core.reset * 1000 - Date.now() + 1000);
            if (waitMs > 0 && waitMs < 300000) {
              onLog(`⏳ Waiting ${Math.ceil(waitMs / 1000)}s for rate limit reset...`);
              await sleep(waitMs);
            }
          }
        }
      }
    }
  }
  onLog(`✓ ${blobs.length} blobs created`);

  // De-duplicate by path (keep first occurrence)
  const seen = new Set();
  const deduped = [];
  for (const b of blobs) {
    if (!seen.has(b.path)) {
      seen.add(b.path);
      deduped.push(b);
    }
  }

  // ── Step 2: Get base tree SHA + detect empty repo ──
  let baseTreeSha = null;
  let parentSha = null;
  let repoIsEmpty = false;

  try {
    const refRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, { headers });
    if (refRes.status === 404 || refRes.status === 409) {
      repoIsEmpty = true;
    } else if (refRes.ok) {
      const ref = await refRes.json();
      if (ref.object?.sha) {
        const commitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${ref.object.sha}`, { headers });
        if (commitRes.ok) {
          const commit = await commitRes.json();
          baseTreeSha = commit.tree?.sha || null;
          parentSha = ref.object.sha;
        }
      }
    }
  } catch {
    repoIsEmpty = true;
  }

  // If repo is empty (no commits), initialize it via Contents API
  if (repoIsEmpty) {
    onLog('🔧 Repo is empty — initializing with first commit...');
    try {
      await initEmptyRepo(token, owner, repo, branch, headers);
      const refRes2 = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, { headers });
      if (refRes2.ok) {
        const ref = await refRes2.json();
        if (ref.object?.sha) {
          const commitRes2 = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${ref.object.sha}`, { headers });
          if (commitRes2.ok) {
            const commit = await commitRes2.json();
            baseTreeSha = commit.tree?.sha || null;
            parentSha = ref.object.sha;
          }
        }
      }
    } catch (initErr) {
      onLog(`⚠️ Could not initialize empty repo: ${initErr.message}. Trying direct upload...`);
    }
  }

  if (repoIsEmpty && !parentSha) {
    throw new Error('GitHub repository is empty and could not be initialized. Delete this repo on GitHub, then try again (it will be recreated with an initial commit).');
  }

  // ── Step 3: Create tree ──
  onLog('🌳 Creating git tree...');
  const treeBody = { tree: deduped };
  if (baseTreeSha) treeBody.base_tree = baseTreeSha;

  const treeRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify(treeBody),
  });

  if (!treeRes.ok) {
    const err = await treeRes.json().catch(() => ({}));
    throw new Error(`Tree creation failed: ${err.message || treeRes.status}`);
  }
  const tree = await treeRes.json();
  if (!tree.sha) throw new Error('GitHub did not return a tree SHA');

  // ── Step 4: Create commit ──
  onLog('📝 Creating commit...');
  const commitBody = {
    message: `Deploy ${repo} via Gold_Crew`,
    tree: tree.sha,
  };

  if (parentSha) {
    commitBody.parents = [parentSha];
  }

  const commitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify(commitBody),
  });

  if (!commitRes.ok) {
    const err = await commitRes.json().catch(() => ({}));
    throw new Error(`Commit creation failed: ${err.message || commitRes.status}`);
  }
  const commit = await commitRes.json();
  if (!commit.sha) throw new Error('GitHub did not return a commit SHA');

  // ── Step 5: Update or create ref ──
  onLog('🔗 Updating branch ref...');
  const refUrl = `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`;

  if (parentSha) {
    const patchRes = await fetch(refUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });
    if (!patchRes.ok) {
      await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
      });
    }
  } else {
    const createRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });

    if (!createRes.ok) {
      await fetch(refUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ sha: commit.sha, force: true }),
      });
    }
  }

  onLog(`✅ Code pushed to ${owner}/${repo}@${branch} (${commit.sha.substring(0, 7)})`);
  return { sha: commit.sha, url: `${owner}/${repo}` };
}

function uint8ToBase64(bytes) {
  let binary = '';
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Compute git blob SHA1 deterministically: SHA1("blob <size>\0<content>")
 */
async function computeGitBlobSha(bytes) {
  const encoder = new TextEncoder();
  const header = encoder.encode(`blob ${bytes.length}\0`);
  const full = new Uint8Array(header.length + bytes.length);
  full.set(header);
  full.set(bytes, header.length);
  const hash = await crypto.subtle.digest('SHA-1', full);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Fetch all files from a GitHub repo using the Git tree API (recursive).
 * Used for deploying from a GitHub URL instead of a ZIP upload.
 * @param {string} token - GitHub token (can be empty for public repos)
 * @param {string} owner - Repo owner
 * @param {string} repo - Repo name
 * @param {string} branch - Branch to fetch
 * @param {Function} onLog - Log callback
 * @returns {Array} files in the same format as parseZip()
 */
export async function fetchRepoFiles(token, owner, repo, branch, onLog) {
  const headers = token ? await ghHeaders(token) : {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  onLog && onLog('📥 Fetching repo tree for ' + owner + '/' + repo + '@' + branch + '...');
  const treeRes = await fetch(
    GITHUB_API + '/repos/' + owner + '/' + repo + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1',
    { headers }
  );
  if (!treeRes.ok) {
    if (treeRes.status === 404) throw new Error('Repository or branch not found: ' + owner + '/' + repo + '@' + branch);
    throw new Error('Failed to fetch repo tree: HTTP ' + treeRes.status);
  }
  const tree = await treeRes.json();
  if (tree.truncated) {
    onLog && onLog('⚠️ Repo is very large — some files may be missing');
  }

  const blobItems = (tree.tree || []).filter(function(item) {
    return item.type === 'blob' && item.path &&
      !item.path.startsWith('__MACOSX/') &&
      !item.path.split('/').some(function(p) { return p.startsWith('._'); });
  });

  onLog && onLog('📂 Found ' + blobItems.length + ' files in repository');
  if (blobItems.length === 0) throw new Error('Repository is empty');
  if (blobItems.length > 3000) throw new Error('Repository has too many files (' + blobItems.length + '). Max 3000 files supported.');

  var files = [];
  var BATCH = 25;

  for (var i = 0; i < blobItems.length; i += BATCH) {
    var batch = blobItems.slice(i, i + BATCH);
    var results = await Promise.all(batch.map(function(item) {
      return fetch(GITHUB_API + '/repos/' + owner + '/' + repo + '/git/blobs/' + item.sha, { headers: headers })
        .then(function(res) {
          if (!res.ok) return null;
          return res.json();
        })
        .then(function(data) {
          if (!data) return null;
          var bytes;
          var text = null;
          if (data.encoding === 'base64') {
            bytes = base64ToUint8Array(data.content);
            if (isTextFile(item.path, bytes)) {
              try { text = new TextDecoder().decode(bytes); } catch(e) { text = null; }
            }
          } else {
            text = data.content || '';
            bytes = new TextEncoder().encode(text);
          }
          return { path: item.path, content: bytes, size: bytes.length, text: text };
        });
    }));

    for (var j = 0; j < results.length; j++) {
      if (results[j]) files.push(results[j]);
    }

    if (onLog && i + BATCH < blobItems.length && i > 0 && i % 200 === 0) {
      onLog('  ⬇️ Downloaded ' + Math.min(i + BATCH, blobItems.length) + '/' + blobItems.length + ' files...');
    }
  }

  onLog && onLog('✓ Downloaded ' + files.length + ' files from repository');
  return files;
}

/**
 * Get the default branch of a GitHub repo.
 * Used to auto-detect "main", "master", or other default branches
 * when deploying from a GitHub URL without a specified branch.
 * @param {string} token - GitHub token (can be empty for public repos)
 * @param {string} owner - Repo owner
 * @param {string} repo - Repo name
 * @returns {string} Default branch name (e.g. "main", "master")
 */
export async function getDefaultBranch(token, owner, repo) {
  var headers = token ? await ghHeaders(token) : {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  var res = await fetch(GITHUB_API + '/repos/' + owner + '/' + repo, { headers: headers });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Repository not found: ' + owner + '/' + repo + '. Is it private? Add a GitHub token in Settings.');
    throw new Error('Failed to fetch repo info: HTTP ' + res.status);
  }
  var data = await res.json();
  return data.default_branch || 'main';
}

function base64ToUint8Array(base64) {
  var binary = atob(base64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isTextFile(path, content) {
  var exts = ['.js','.ts','.json','.html','.css','.md','.txt','.yml','.yaml','.toml','.cfg','.ini','.env','.sh','.py','.rb','.go','.rs','.java','.xml','.svg','.jsx','.tsx','.vue','.svelte','.lock','.conf','.rc','.mjs','.cjs','.php','.pl','.lua','.r','.dart','.kt','.swift','.c','.cpp','.h','.hpp','.cs'];
  var ext = '.' + path.split('.').pop().toLowerCase();
  if (exts.indexOf(ext) !== -1) return true;
  var check = content.slice(0, 8192);
  for (var i = 0; i < check.length; i++) { if (check[i] === 0) return false; }
  return true;
}

// ══════════════════════════════════════════════════════════
//  GitHub Control Panel API — Full repo management
// ══════════════════════════════════════════════════════════

export async function getUserProfile(token) {
  const res = await fetch(`${GITHUB_API}/user`, { headers: await ghHeaders(token) });
  if (!res.ok) throw new Error(`Failed to fetch profile: ${res.status}`);
  return await res.json();
}

export async function listRepos(token, opts = {}) {
  const { page = 1, perPage = 30, sort = 'updated', direction = 'desc', type = 'all' } = opts;
  const params = new URLSearchParams({ page, per_page: perPage, sort, direction, type });
  const res = await fetch(`${GITHUB_API}/user/repos?${params}`, { headers: await ghHeaders(token) });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Token expired or invalid');
    throw new Error(`Failed to list repos: ${res.status}`);
  }
  const repos = await res.json();
  const linkHeader = res.headers.get('Link') || '';
  const lastMatch = linkHeader.match(/page=(\d+)>;\s*rel="last"/);
  const totalEstimate = lastMatch ? parseInt(lastMatch[1]) * perPage : repos.length;
  return { repos, totalEstimate };
}

export async function searchRepos(token, query, page = 1) {
  const params = new URLSearchParams({ q: query, page, per_page: 30 });
  const res = await fetch(`${GITHUB_API}/search/repositories?${params}`, { headers: await ghHeaders(token) });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return await res.json();
}

export async function getRepo(token, owner, repo) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, { headers: await ghHeaders(token) });
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Repository ${owner}/${repo} not found`);
    throw new Error(`Failed to get repo: ${res.status}`);
  }
  return await res.json();
}

export async function listBranches(token, owner, repo) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/branches?per_page=100`, { headers: await ghHeaders(token) });
  if (!res.ok) throw new Error(`Failed to list branches: ${res.status}`);
  return await res.json();
}

export async function listCommits(token, owner, repo, opts = {}) {
  const { page = 1, perPage = 20, sha = '' } = opts;
  const params = new URLSearchParams({ page, per_page: perPage });
  if (sha) params.set('sha', sha);
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/commits?${params}`, { headers: await ghHeaders(token) });
  if (!res.ok) throw new Error(`Failed to list commits: ${res.status}`);
  return await res.json();
}

export async function getContents(token, owner, repo, path = '', ref = '') {
  let url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;
  if (ref) url += `?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, { headers: await ghHeaders(token) });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Failed to get contents: ${res.status}`);
  }
  const data = await res.json();
  if (Array.isArray(data)) return data;
  return [data];
}

export async function getFileContent(token, owner, repo, path, ref = '') {
  let url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;
  if (ref) url += `?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, {
    headers: {
      ...(await ghHeaders(token)),
      Accept: 'application/vnd.github.raw+json',
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
  return await res.text();
}

export async function createNewRepo(token, name, opts = {}) {
  const body = {
    name,
    description: opts.description || '',
    private: opts.private || false,
    auto_init: opts.auto_init !== undefined ? opts.auto_init : true,
  };
  if (opts.gitignore_template) body.gitignore_template = opts.gitignore_template;
  if (opts.license_template) body.license_template = opts.license_template;

  const res = await fetch(`${GITHUB_API}/user/repos`, {
    method: 'POST',
    headers: await ghHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 422) throw new Error(`Repo "${name}" already exists or invalid name`);
    throw new Error(err.message || `Failed to create repo: ${res.status}`);
  }
  return await res.json();
}

export async function deleteRepo(token, owner, repo) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    method: 'DELETE',
    headers: await ghHeaders(token),
  });
  if (!res.ok) {
    if (res.status === 403) throw new Error('Token needs "delete_repo" scope to delete repositories');
    throw new Error(`Failed to delete repo: ${res.status}`);
  }
  return true;
}

export async function upsertFile(token, owner, repo, path, content, message, sha = '', branch = '') {
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
  };
  if (sha) body.sha = sha;
  if (branch) body.branch = branch;

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: await ghHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to save file: ${res.status}`);
  }
  return await res.json();
}

export async function removeFile(token, owner, repo, path, message, sha, branch = '') {
  const body = { message, sha };
  if (branch) body.branch = branch;

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'DELETE',
    headers: await ghHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to delete file: ${res.status}`);
  }
  return await res.json();
}

export async function getRateLimit(token) {
  const res = await fetch(`${GITHUB_API}/rate_limit`, { headers: await ghHeaders(token) });
  if (!res.ok) throw new Error(`Failed to check rate limit: ${res.status}`);
  return await res.json();
}

export async function listLanguages(token, owner, repo) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/languages`, { headers: await ghHeaders(token) });
  if (!res.ok) return {};
  return await res.json();
}

export async function listReleases(token, owner, repo, perPage = 10) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/releases?per_page=${perPage}`, { headers: await ghHeaders(token) });
  if (!res.ok) return [];
  return await res.json();
}

// ══════════════════════════════════════════════════════════
//  GitHub Pages API — Enable/disable/configure Pages
// ══════════════════════════════════════════════════════════

export async function enableGitHubPages(token, owner, repo, branch = 'main', path = '/') {
  var headers = await ghHeaders(token);
  var body = { source: { branch: branch, path: path } };

  var res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body),
  });

  if (res.ok) return await res.json();

  if (res.status === 409) {
    var upd = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages`, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(body),
    });
    if (upd.ok) return await upd.json();
    var e2 = await upd.json().catch(() => ({}));
    throw new Error('Failed to update GitHub Pages: ' + (e2.message || upd.status));
  }

  var err = await res.json().catch(() => ({}));
  if (res.status === 404) throw new Error('Repository not found. Push code first, then enable Pages.');
  if (res.status === 403) throw new Error('Permission denied. Token needs "repo" scope.');
  throw new Error('Failed to enable GitHub Pages: ' + (err.message || res.status));
}

export async function getGitHubPages(token, owner, repo) {
  var headers = await ghHeaders(token);
  var res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages`, { headers });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error('Failed to get GitHub Pages info: ' + res.status);
  }
  return await res.json();
}

export async function disableGitHubPages(token, owner, repo) {
  var headers = await ghHeaders(token);
  var res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pages`, {
    method: 'DELETE',
    headers: headers,
  });
  if (!res.ok && res.status !== 404) {
    throw new Error('Failed to disable GitHub Pages: ' + res.status);
  }
  return true;
}

// ══════════════════════════════════════════════════════════
//  Image Hosting — Upload images to a GitHub repo
// ══════════════════════════════════════════════════════════

/**
 * Upload an image file to a GitHub repo and return the raw URL.
 * Creates the repo if it doesn't exist.
 */
export async function uploadImageToRepo(token, username, file, repoName) {
  repoName = repoName || 'goldcrew-images';

  var repo = await getOrCreateRepo(token, repoName, username, function() {}, {
    description: 'Image hosting via Gold_Crew',
    auto_init: true,
    private: false,
  });

  // Use the actual default branch from the repo object (avoids race condition + extra API call)
  var branch = repo.default_branch || 'main';

  var base64 = await new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function() {
      var result = reader.result;
      resolve(result.split(',')[1]);
    };
    reader.onerror = function() { reject(new Error('Failed to read file')); };
    reader.readAsDataURL(file);
  });

  var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  var filename = Date.now() + '-' + safeName;
  var path = 'images/' + filename;

  var headers = await ghHeaders(token);
  var sha = '';
  try {
    var checkRes = await fetch(GITHUB_API + '/repos/' + username + '/' + repoName + '/contents/' + path + '?ref=' + encodeURIComponent(branch), { headers });
    if (checkRes.ok) { var d = await checkRes.json(); sha = d.sha || ''; }
  } catch(e) { /* ignore */ }

  var uploadBody = { message: 'Upload image: ' + file.name, content: base64, branch: branch };
  if (sha) uploadBody.sha = sha;

  var res = await fetch(GITHUB_API + '/repos/' + username + '/' + repoName + '/contents/' + path, {
    method: 'PUT',
    headers: headers,
    body: JSON.stringify(uploadBody),
  });

  if (!res.ok) {
    var errData = await res.json().catch(() => ({}));
    if (res.status === 403) throw new Error('Permission denied. Check your GitHub token scopes.');
    if (res.status === 422) throw new Error('Invalid file. Image may be too large.');
    throw new Error('Upload failed: ' + (errData.message || res.status));
  }

  // Parse the API response to get the actual download_url and SHA
  var data = await res.json();
  var content = data.content || {};
  var rawUrl = content.download_url || ('https://raw.githubusercontent.com/' + username + '/' + repoName + '/' + branch + '/' + path);
  var htmlUrl = content.html_url || ('https://github.com/' + username + '/' + repoName + '/blob/' + branch + '/' + path);
  var cdnUrl = 'https://cdn.jsdelivr.net/gh/' + username + '/' + repoName + '@' + branch + '/' + path;
  var uploadedSha = content.sha || '';

  return { rawUrl: rawUrl, htmlUrl: htmlUrl, cdnUrl: cdnUrl, path: path, filename: filename, sha: uploadedSha };
}

/**
 * List images in the goldcrew-images repo.
 */
export async function listImages(token, username, repoName) {
  repoName = repoName || 'goldcrew-images';
  var headers = token ? await ghHeaders(token) : { Accept: 'application/vnd.github+json' };

  // Detect default branch
  var branch = 'main';
  try {
    var repoRes = await fetch(GITHUB_API + '/repos/' + username + '/' + repoName, { headers: headers });
    if (repoRes.ok) {
      var rd = await repoRes.json();
      branch = rd.default_branch || 'main';
    }
  } catch(e) { /* fallback */ }

  var res = await fetch(GITHUB_API + '/repos/' + username + '/' + repoName + '/contents/images?ref=' + encodeURIComponent(branch), { headers: headers });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error('Failed to list images: ' + res.status);
  }
  var data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.filter(function(f) {
    return f.type === 'file' && /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)$/i.test(f.name);
  }).map(function(f) {
    return {
      name: f.name,
      // Use the API-provided download_url — guaranteed to work immediately
      rawUrl: f.download_url || ('https://raw.githubusercontent.com/' + username + '/' + repoName + '/' + branch + '/' + f.path),
      cdnUrl: 'https://cdn.jsdelivr.net/gh/' + username + '/' + repoName + '@' + branch + '/' + f.path,
      htmlUrl: f.html_url,
      size: f.size,
      path: f.path,
      sha: f.sha,
    };
  });
}

/**
 * Delete an image from the goldcrew-images repo.
 */
export async function deleteImage(token, username, repoName, path, sha) {
  repoName = repoName || 'goldcrew-images';
  var headers = await ghHeaders(token);

  // Detect default branch
  var branch = 'main';
  try {
    var repoRes = await fetch(GITHUB_API + '/repos/' + username + '/' + repoName, { headers: headers });
    if (repoRes.ok) {
      var rd = await repoRes.json();
      branch = rd.default_branch || 'main';
    }
  } catch(e) { /* fallback */ }

  var res = await fetch(GITHUB_API + '/repos/' + username + '/' + repoName + '/contents/' + path, {
    method: 'DELETE',
    headers: headers,
    body: JSON.stringify({ message: 'Delete image: ' + path, sha: sha, branch: branch }),
  });
  if (!res.ok) {
    var err = await res.json().catch(() => ({}));
    throw new Error('Failed to delete image: ' + (err.message || res.status));
  }
  return true;
}
