// services/deploy-engine.js — Orchestrates real deployment pipeline
// Supports two sources: ZIP file upload OR GitHub repository URL.
// Platform: Vercel only (direct API upload, no GitHub needed)

import { parseZip, autoDetectProject } from './zip-parser.js';
import { validateGithubToken, fetchRepoFiles, getDefaultBranch } from './github-service.js';
import { validateVercelToken, deployToVercel } from './vercel-service.js';

/**
 * Parse a GitHub URL into { owner, repo, branch }.
 */
function parseGithubUrl(url) {
  if (!url || typeof url !== 'string') return null;
  url = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try {
    var u = new URL(url);
    if (!/github\.com$/i.test(u.hostname)) return null;
    var parts = u.pathname.replace(/^\//, '').split('/').filter(Boolean);
    if (parts.length < 2) return null;
    var owner = parts[0];
    var repo = parts[1].replace(/\.git$/, '');
    var branch = null;
    if (parts.length >= 4 && parts[2] === 'tree') {
      branch = parts.slice(3).join('/');
    }
    return { owner: owner, repo: repo, branch: branch };
  } catch (e) {
    return null;
  }
}

/**
 * Run full deployment pipeline.
 */
export async function deploy(config, settings, onLog, onProgress) {
  var pct = function (v) { onProgress && onProgress(Math.min(100, Math.max(0, v))); };

  // ── Step 1: Get files ──
  var files;
  if (config.githubUrl) {
    onLog('🔗 Fetching files from GitHub repository...');
    pct(5);
    var ghParts = parseGithubUrl(config.githubUrl);
    if (!ghParts) {
      throw new Error('Invalid GitHub URL. Expected format: https://github.com/owner/repo or https://github.com/owner/repo/tree/branch');
    }
    var ghBranch = ghParts.branch || null;
    onLog('📦 Repository: ' + ghParts.owner + '/' + ghParts.repo);
    try {
      if (!ghBranch) {
        onLog('🔍 Detecting default branch...');
        ghBranch = await getDefaultBranch(settings.githubToken || '', ghParts.owner, ghParts.repo);
        onLog('📋 Default branch: ' + ghBranch);
      }
      files = await fetchRepoFiles(settings.githubToken || '', ghParts.owner, ghParts.repo, ghBranch, onLog);
    } catch (err) {
      if (err.message.indexOf('404') !== -1 || err.message.indexOf('not found') !== -1) {
        throw new Error('Repository not found: ' + ghParts.owner + '/' + ghParts.repo + '. If private, add a GitHub token in Settings.');
      }
      throw new Error('Failed to fetch GitHub repo: ' + err.message);
    }
    if (files.length === 0) throw new Error('Repository is empty');
    var totalSizeMB = (files.reduce(function (s, f) { return s + f.size; }, 0) / 1048576).toFixed(1);
    onLog('✓ Fetched ' + files.length + ' files (' + totalSizeMB + ' MB total)');
    pct(10);
  } else {
    if (!config.file) throw new Error('Please upload a ZIP file or enter a GitHub repository URL.');
    onLog('📦 Extracting ZIP file...');
    pct(5);
    try {
      files = await parseZip(config.file);
    } catch (err) {
      throw new Error('Failed to extract ZIP: ' + err.message);
    }
    if (files.length === 0) throw new Error('ZIP file is empty or corrupt');
    var totalSizeMB2 = (files.reduce(function (s, f) { return s + f.size; }, 0) / 1048576).toFixed(1);
    onLog('✓ Extracted ' + files.length + ' files (' + totalSizeMB2 + ' MB total)');
    pct(10);
  }

  // ── Step 2: Detect project ──
  onLog('🔍 Analyzing project structure...');
  var detected = autoDetectProject(files);
  onLog('📋 Runtime: ' + detected.runtime + ' | Framework: ' + (detected.framework || 'none'));
  pct(15);
  detected.projectType = config.projectType;

  // ── Step 3: Validate Vercel token ──
  onLog('🔐 Validating Vercel token...');
  if (!settings.vercelToken) {
    throw new Error('Vercel token is required. Go to Settings → API Keys and add your Vercel token.');
  }
  try {
    var vUser = await validateVercelToken(settings.vercelToken);
    onLog('✓ Vercel: authenticated as ' + vUser.username);
  } catch (err) {
    throw new Error('Vercel token invalid: ' + err.message + '. Go to Settings and update your token.');
  }
  pct(25);

  var slug = config.projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'project';
  if (slug.length > 50) slug = slug.substring(0, 50).replace(/-+$/, '');

  // ── Step 4: Deploy to Vercel ──
  onLog('☁️ Deploying to Vercel...');
  pct(35);

  var result;
  try {
    result = await deployToVercel(
      settings.vercelToken, files, slug, config.envVars, detected, config.vercelOptions || {}, onLog, pct
    );
  } catch (err) {
    if (err.message.indexOf('Failed to fetch') !== -1 || err.message.indexOf('NetworkError') !== -1) {
      throw new Error('Network error reaching Vercel API. Check your internet connection.');
    }
    throw err;
  }

  pct(100);
  return {
    url: result.url,
    platform: 'vercel',
    deploymentId: result.id,
    status: result.status,
    fileCount: files.length,
    runtime: detected.runtime,
  };
}
