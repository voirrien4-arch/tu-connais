// ui/pages-view.js — GitHub Pages: deploy static sites for free via GitHub

import { getState, setState, addLog } from '../state.js';
import { showToast } from './toast-view.js';
import { validateGithubToken, getOrCreateRepo, uploadFiles, enableGitHubPages, getGitHubPages, disableGitHubPages } from '../services/github-service.js';
import { parseZip } from '../services/zip-parser.js';

const t = (key) => window.miniappI18n?.t(key) ?? key;

let step = 1;
let data = fresh();
let deploying = false;
let deployResult = null;
let deployError = '';
let ghUser = null;

function fresh() {
  return { file: null, fileName: '', fileSize: 0, projectName: '', description: '' };
}

export function resetPagesView() {
  step = 1;
  data = fresh();
  deploying = false;
  deployResult = null;
  deployError = '';
  ghUser = null;
}

export function renderPagesView(container) {
  const { settings } = getState();
  const token = settings.githubToken;

  if (!token) {
    container.innerHTML = noTokenView();
    bindNoToken(container);
    return;
  }

  container.innerHTML = `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-white flex items-center gap-2">📄 GitHub Pages</h1>
        <p class="text-slate-400 mt-1">Deploy static websites for free on GitHub Pages</p>
      </div>
      ${step === 1 ? uploadStep() : ''}
      ${step === 2 ? configStep() : ''}
      ${step === 3 && deploying ? deployingStep() : ''}
      ${step === 3 && !deploying && deployResult ? successStep() : ''}
      ${step === 3 && !deploying && deployError ? errorStep() : ''}
    </div>
  `;
  bind(container, token);
}

function noTokenView() {
  return `
    <div class="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div class="text-6xl mb-4">🔑</div>
      <h2 class="text-2xl font-bold text-white mb-2">GitHub Token Required</h2>
      <p class="text-slate-400 max-w-md mb-6">GitHub Pages deploys via your GitHub account. Add a token to start.</p>
      <div class="bg-slate-800/50 border border-white/10 rounded-2xl p-6 max-w-md w-full text-left space-y-4">
        <h3 class="text-sm font-medium text-slate-300">How to get your token:</h3>
        <ol class="text-sm text-slate-400 space-y-2 list-decimal list-inside">
          <li>Go to <a href="https://github.com/settings/tokens/new?scopes=repo&description=Gold_Crew" target="_blank" rel="noopener" class="text-amber-400 underline hover:text-amber-300">github.com/settings/tokens</a></li>
          <li>Select scope: <code class="bg-slate-700 px-1.5 py-0.5 rounded text-amber-300">repo</code></li>
          <li>Click "Generate token" and copy it</li>
          <li>Paste it in <button data-goto-settings class="text-amber-400 underline hover:text-amber-300">Settings → GitHub Token</button></li>
        </ol>
      </div>
    </div>`;
}

function uploadStep() {
  return `
    <div class="bg-white/5 border border-white/10 rounded-2xl p-6">
      <h2 class="text-lg font-bold text-white mb-2">📁 Upload your site</h2>
      <p class="text-sm text-slate-400 mb-4">Upload a ZIP file containing your static website (HTML, CSS, JS)</p>
      <div class="text-center">
        <div id="pagesDropZone" class="drop-zone border-2 border-dashed border-slate-600 rounded-2xl p-10 transition cursor-pointer hover:border-amber-500/50">
          <p class="text-4xl mb-3">📄</p>
          <p class="text-lg font-medium text-white">Drag & drop your ZIP file here</p>
          <p class="text-slate-400 mt-1">${t('deploy.or')}</p>
          <label class="inline-block mt-4 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl cursor-pointer transition">
            Browse Files
            <input type="file" id="pagesFileInput" accept=".zip" class="hidden">
          </label>
        </div>
        <div id="pagesFileInfo" class="mt-4 ${data.fileName ? '' : 'hidden'}">
          <p class="text-emerald-400 text-sm">✓ Selected: <strong class="text-white">${data.fileName}</strong> (${formatSize(data.fileSize)})</p>
        </div>
      </div>
      <div class="mt-6 flex justify-end">
        <button id="pagesNextBtn" class="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition ${data.fileName ? '' : 'opacity-40 pointer-events-none'}">Next →</button>
      </div>
    </div>
    <div class="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6">
      <h3 class="text-lg font-bold text-emerald-300 mb-2">💡 GitHub Pages = 100% FREE</h3>
      <ul class="text-sm text-slate-400 space-y-1.5">
        <li>✅ Free hosting for static sites</li>
        <li>✅ Your URL: <code class="text-emerald-300">username.github.io/repo-name</code></li>
        <li>✅ Custom domain supported</li>
        <li>✅ No credit card needed</li>
      </ul>
    </div>
  `;
}

function configStep() {
  return `
    <div class="bg-white/5 border border-white/10 rounded-2xl p-6 max-w-lg mx-auto space-y-4">
      <h2 class="text-lg font-bold text-white mb-2">⚙️ Configure deployment</h2>
      <div>
        <label for="pagesRepoName" class="block text-sm font-medium text-slate-300 mb-1">Repository name</label>
        <input type="text" id="pagesRepoName" value="${esc(data.projectName)}" placeholder="my-site" class="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition">
        <p class="text-xs text-slate-500 mt-1">Your site will be at: <code class="text-emerald-300">username.github.io/${esc(data.projectName || 'repo-name')}</code></p>
      </div>
      <div>
        <label for="pagesDesc" class="block text-sm font-medium text-slate-300 mb-1">Description (optional)</label>
        <input type="text" id="pagesDesc" value="${esc(data.description)}" placeholder="What is this site about?" class="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition">
      </div>
      <div class="bg-slate-800/50 rounded-xl p-4 space-y-2 text-sm text-slate-400">
        <p>📁 <strong class="text-slate-300">Source:</strong> ${data.fileName} (${formatSize(data.fileSize)})</p>
        <p>📄 <strong class="text-slate-300">Platform:</strong> GitHub Pages (FREE)</p>
      </div>
      <div class="flex justify-between pt-2">
        <button id="pagesBackBtn" class="px-6 py-3 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition">← Back</button>
        <button id="pagesDeployBtn" class="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition pulse-gold">🚀 Deploy to Pages</button>
      </div>
    </div>
  `;
}

function deployingStep() {
  return `
    <div class="text-center py-8">
      <div class="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center text-2xl mx-auto mb-4 pulse-gold">🚀</div>
      <h3 class="text-xl font-bold text-white mb-1">Deploying to GitHub Pages...</h3>
      <p class="text-slate-400 text-sm">Creating repo, uploading files, and enabling Pages</p>
      <div id="pagesLogs" class="mt-5 max-w-md mx-auto text-left bg-slate-900/80 rounded-xl p-4 max-h-56 overflow-y-auto text-xs space-y-1 font-mono"></div>
    </div>
  `;
}

function successStep() {
  return `
    <div class="text-center py-6">
      <div class="text-6xl mb-4">🎉</div>
      <h3 class="text-2xl font-bold text-white mb-2">GitHub Pages Deployed!</h3>
      <p class="text-slate-400">Your site is live on the internet</p>
      <div class="mt-5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 max-w-md mx-auto space-y-3">
        <div>
          <p class="text-xs text-emerald-400 mb-1">Live URL</p>
          <a href="${deployResult.pagesUrl}" target="_blank" rel="noopener" class="text-white font-mono hover:text-emerald-300 break-all text-sm">${deployResult.pagesUrl}</a>
        </div>
        <div>
          <p class="text-xs text-slate-400 mb-1">Repository</p>
          <a href="${deployResult.repoUrl}" target="_blank" rel="noopener" class="text-cyan-400 font-mono hover:text-cyan-300 break-all text-xs">${deployResult.repoUrl}</a>
        </div>
        <p class="text-xs text-amber-400/80">⏱️ Pages may take 1-2 minutes to go live</p>
      </div>
      <div class="mt-6 flex flex-wrap justify-center gap-3">
        <a href="${deployResult.pagesUrl}" target="_blank" rel="noopener" class="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl transition">↗ Open Site</a>
        <a href="${deployResult.repoUrl}" target="_blank" rel="noopener" class="px-6 py-3 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition">📂 View Repo</a>
        <button id="pagesAnother" class="px-6 py-3 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition">Deploy Another</button>
      </div>
    </div>
  `;
}

function errorStep() {
  return `
    <div class="text-center py-6">
      <div class="text-6xl mb-4">❌</div>
      <h3 class="text-2xl font-bold text-white mb-2">Deployment Failed</h3>
      <div class="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-5 max-w-md mx-auto text-left">
        <p class="text-red-300 text-sm break-words">${esc(deployError)}</p>
      </div>
      <div class="mt-6 flex flex-wrap justify-center gap-3">
        <button id="pagesRetry" class="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition">🔄 Retry</button>
        <button id="pagesAnother" class="px-6 py-3 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition">Start Over</button>
      </div>
    </div>
  `;
}

function bindNoToken(container) {
  container.querySelector('[data-goto-settings]')?.addEventListener('click', () => setState({ currentView: 'settings' }));
}

function bind(container, token) {
  container.querySelector('[data-goto-settings]')?.addEventListener('click', () => setState({ currentView: 'settings' }));

  // Upload step
  const dropZone = document.getElementById('pagesDropZone');
  const fileInput = document.getElementById('pagesFileInput');
  if (dropZone && fileInput) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      pickFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', e => pickFile(e.target.files[0]));
  }

  document.getElementById('pagesNextBtn')?.addEventListener('click', () => {
    if (!data.fileName) { showToast('Please upload a ZIP file first', 'warning'); return; }
    step = 2;
    renderPagesView(container);
  });

  document.getElementById('pagesBackBtn')?.addEventListener('click', () => {
    step = 1;
    renderPagesView(container);
  });

  document.getElementById('pagesDeployBtn')?.addEventListener('click', () => doDeploy(token, container));

  document.getElementById('pagesAnother')?.addEventListener('click', () => {
    resetPagesView();
    renderPagesView(container);
  });

  document.getElementById('pagesRetry')?.addEventListener('click', () => {
    deployError = '';
    step = 3;
    doDeploy(token, container);
  });
}

function pickFile(f) {
  if (!f) return;
  if (!f.name.toLowerCase().endsWith('.zip')) { showToast('Please upload a .zip file', 'warning'); return; }
  data.file = f;
  data.fileName = f.name;
  data.fileSize = f.size;
  if (!data.projectName) data.projectName = f.name.replace(/\.zip$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-');
  const fileInfo = document.getElementById('pagesFileInfo');
  if (fileInfo) {
    fileInfo.classList.remove('hidden');
    fileInfo.innerHTML = `<p class="text-emerald-400 text-sm">✓ Selected: <strong class="text-white">${data.fileName}</strong> (${formatSize(data.fileSize)})</p>`;
  }
  const nextBtn = document.getElementById('pagesNextBtn');
  if (nextBtn) {
    nextBtn.classList.remove('opacity-40', 'pointer-events-none');
  }
}

async function doDeploy(token, container) {
  const repoNameInput = document.getElementById('pagesRepoName');
  const repoName = (repoNameInput?.value || data.projectName || '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'my-site';
  data.projectName = repoName;

  deploying = true;
  deployError = '';
  deployResult = null;
  step = 3;
  renderPagesView(container);

  const dl = document.getElementById('pagesLogs');
  function log(msg) {
    addLog({ type: 'info', message: msg });
    if (dl) {
      const p = document.createElement('p');
      p.className = 'text-slate-300';
      p.textContent = msg;
      dl.appendChild(p);
      dl.scrollTop = dl.scrollHeight;
    }
  }

  try {
    if (!ghUser) {
      log('🔑 Authenticating...');
      ghUser = await validateGithubToken(token);
      log('✓ Authenticated as ' + ghUser.username);
    }

    log('📦 Extracting ZIP...');
    const files = await parseZip(data.file);
    if (files.length === 0) throw new Error('ZIP is empty or corrupt');
    log('✓ Extracted ' + files.length + ' files');

    // Add index.html if missing
    const hasIndex = files.some(f => f.path === 'index.html' || f.path.endsWith('/index.html'));
    if (!hasIndex) {
      log('⚠️ No index.html found — GitHub Pages needs one');
    }

    log('📁 Creating repo "' + repoName + '"...');
    await getOrCreateRepo(token, repoName, ghUser.username, log);
    log('✓ Repo ready');

    log('⬆️ Uploading files...');
    await uploadFiles(token, ghUser.username, repoName, files, 'main', log);

    log('📄 Enabling GitHub Pages...');
    await enableGitHubPages(token, ghUser.username, repoName, 'main', '/');

    const pagesUrl = 'https://' + ghUser.username + '.github.io/' + repoName;
    log('✅ GitHub Pages enabled!');
    log('🔗 Live at: ' + pagesUrl);

    addLog({ type: 'success', message: 'GitHub Pages deployed: ' + pagesUrl });

    deployResult = {
      pagesUrl: pagesUrl,
      repoUrl: 'https://github.com/' + ghUser.username + '/' + repoName,
      fileCount: files.length,
    };
  } catch (err) {
    deployError = err.message || 'Unknown error';
    addLog({ type: 'error', message: 'Pages deploy failed: ' + deployError });
    showToast('Deploy failed: ' + deployError, 'error', 6000);
  } finally {
    deploying = false;
    renderPagesView(container);
  }
}

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function formatSize(b) { return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }
