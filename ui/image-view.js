// ui/image-view.js — Image URL Hosting: upload images to GitHub, get direct URLs

import { getState, setState, addLog } from '../state.js';
import { showToast } from './toast-view.js';
import { validateGithubToken, uploadImageToRepo, listImages, deleteImage } from '../services/github-service.js';

const t = (key) => window.miniappI18n?.t(key) ?? key;

let images = [];
let loading = false;
let uploading = false;
let ghUser = null;

export function resetImageView() {
  images = [];
  loading = false;
  uploading = false;
  ghUser = null;
}

export function renderImageView(container) {
  const { settings } = getState();
  const token = settings.githubToken;

  if (!token) {
    container.innerHTML = noTokenView();
    bindNoToken(container);
    return;
  }

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-white flex items-center gap-2">🖼️ Image URL</h1>
          <p class="text-slate-400 text-sm mt-1">Upload images and get direct URLs for your projects</p>
        </div>
        <button id="imgRefresh" class="px-4 py-2.5 bg-slate-800 border border-white/10 hover:bg-slate-700 rounded-xl text-sm text-slate-300 transition flex items-center gap-2">↻ Refresh</button>
      </div>

      <!-- Upload Zone -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h2 class="text-lg font-bold text-white mb-4">📤 Upload Image</h2>
        <div id="imgDropZone" class="drop-zone border-2 border-dashed border-slate-600 rounded-2xl p-8 text-center cursor-pointer hover:border-amber-500/50 transition ${uploading ? 'opacity-50 pointer-events-none' : ''}">
          ${uploading ? `
            <div class="animate-pulse">
              <p class="text-3xl mb-3">⏳</p>
              <p class="text-white font-medium">Uploading...</p>
            </div>
          ` : `
            <p class="text-4xl mb-3">🖼️</p>
            <p class="text-lg font-medium text-white">Drag & drop your image here</p>
            <p class="text-slate-400 mt-1">${t('deploy.or')}</p>
            <label class="inline-block mt-4 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl cursor-pointer transition">
              Browse Files
              <input type="file" id="imgFileInput" accept="image/*" multiple class="hidden">
            </label>
            <p class="text-xs text-slate-500 mt-3">PNG, JPG, GIF, WebP, SVG — Max 10MB per file</p>
          `}
        </div>
      </div>

      <!-- Images Gallery -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold text-white">📁 Your Images</h2>
          <span class="text-xs text-slate-500">${images.length} image${images.length !== 1 ? 's' : ''}</span>
        </div>
        <div id="imgGallery">${loading ? loadingView() : galleryView()}</div>
      </div>
    </div>
  `;

  bind(container, token);
  if (images.length === 0 && !loading) loadImages(token, container);
}

function noTokenView() {
  return `
    <div class="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div class="text-6xl mb-4">🔑</div>
      <h2 class="text-2xl font-bold text-white mb-2">GitHub Token Required</h2>
      <p class="text-slate-400 max-w-md mb-6">Your images are hosted on GitHub. Add your token to start uploading.</p>
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

function loadingView() {
  return `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">${[1,2,3,4].map(() => `
    <div class="animate-pulse bg-slate-800 rounded-xl aspect-square"></div>
  `).join('')}</div>`;
}

function galleryView() {
  if (images.length === 0) {
    return `<div class="text-center py-10">
      <p class="text-5xl mb-3">🖼️</p>
      <p class="text-slate-400">No images yet. Upload your first image above!</p>
    </div>`;
  }

  return `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    ${images.map((img, i) => `
      <div class="bg-slate-800/50 rounded-xl overflow-hidden border border-white/5 hover:border-amber-500/30 transition">
        <div class="aspect-video overflow-hidden bg-slate-900/50 relative">
          <img src="${img.rawUrl}" alt="${esc(img.name)}" loading="lazy" class="w-full h-full object-contain" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="absolute inset-0 hidden items-center justify-center text-slate-500 text-sm">⏳ Loading...</div>
        </div>
        <div class="p-3 space-y-2">
          <p class="text-xs text-slate-300 truncate" title="${esc(img.name)}">${esc(img.name)}</p>
          <div class="flex items-center gap-1.5 bg-slate-900/80 rounded-lg px-2.5 py-1.5 group/url cursor-pointer" data-copy-url="${img.rawUrl}" title="Click to copy URL">
            <span class="text-amber-400 text-xs shrink-0">🔗</span>
            <span class="text-[11px] text-slate-300 truncate flex-1 font-mono">${esc(img.rawUrl)}</span>
            <span class="text-[11px] text-emerald-400 opacity-0 group-hover/url:opacity-100 transition shrink-0">COPY</span>
          </div>
          ${img.cdnUrl ? `
          <div class="flex items-center gap-1.5 bg-slate-900/80 rounded-lg px-2.5 py-1.5 group/cdn cursor-pointer" data-copy-url="${img.cdnUrl}" title="Click to copy CDN URL">
            <span class="text-cyan-400 text-xs shrink-0">⚡</span>
            <span class="text-[11px] text-slate-300 truncate flex-1 font-mono">${esc(img.cdnUrl)}</span>
            <span class="text-[11px] text-emerald-400 opacity-0 group-hover/cdn:opacity-100 transition shrink-0">COPY</span>
          </div>
          ` : ''}
          <div class="flex items-center justify-between pt-1">
            <span class="text-[10px] text-slate-500">${formatSize(img.size)}</span>
            <div class="flex gap-1.5">
              <button data-open-img="${img.rawUrl}" class="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-400 text-[11px] transition" title="Open">↗ Open</button>
              <button data-del-img="${i}" class="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 text-[11px] transition" title="Delete">🗑 Delete</button>
            </div>
          </div>
        </div>
      </div>
    `).join('')}
  </div>`;
}

function bindNoToken(container) {
  container.querySelector('[data-goto-settings]')?.addEventListener('click', () => setState({ currentView: 'settings' }));
}

function bind(container, token) {
  container.querySelector('[data-goto-settings]')?.addEventListener('click', () => setState({ currentView: 'settings' }));

  document.getElementById('imgRefresh')?.addEventListener('click', () => loadImages(token, container));

  const dropZone = document.getElementById('imgDropZone');
  const fileInput = document.getElementById('imgFileInput');

  if (dropZone && fileInput && !uploading) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (files.length) handleUpload(files, token, container);
    });
    fileInput.addEventListener('change', e => {
      const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
      if (files.length) handleUpload(files, token, container);
    });
  }

  // Copy URL buttons
  container.querySelectorAll('[data-copy-url]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const url = btn.dataset.copyUrl;
      try {
        await navigator.clipboard.writeText(url);
        showToast('✓ URL copied to clipboard', 'success');
      } catch {
        // Fallback: select text
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('✓ URL copied', 'success');
      }
    });
  });

  // Open image buttons
  container.querySelectorAll('[data-open-img]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(btn.dataset.openImg, '_blank');
    });
  });

  // Delete image buttons
  container.querySelectorAll('[data-del-img]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = +btn.dataset.delImg;
      const img = images[idx];
      if (!img) return;
      if (!confirm('Delete "' + img.name + '"?')) return;
      try {
        const { user } = getState();
        await deleteImage(token, user?.username, undefined, img.path, img.sha);
        images.splice(idx, 1);
        showToast('✓ Image deleted', 'success');
        renderImageView(container);
      } catch (err) {
        showToast('Delete failed: ' + err.message, 'error');
      }
    });
  });
}

async function loadImages(token, container) {
  loading = true;
  const gallery = document.getElementById('imgGallery');
  if (gallery) gallery.innerHTML = loadingView();

  try {
    if (!ghUser) {
      ghUser = await validateGithubToken(token);
    }
    images = await listImages(token, ghUser.username);
    images.reverse(); // newest first
  } catch (err) {
    showToast('Failed to load images: ' + err.message, 'error');
  } finally {
    loading = false;
    const gallery = document.getElementById('imgGallery');
    if (gallery) gallery.innerHTML = galleryView();
    bind(container, token);
  }
}

async function handleUpload(files, token, container) {
  if (uploading) return;
  if (files.length === 0) return;

  // Validate file sizes
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) {
      showToast('"' + f.name + '" is too large (max 10MB)', 'warning');
      return;
    }
  }

  uploading = true;
  renderImageView(container);

  try {
    if (!ghUser) {
      ghUser = await validateGithubToken(token);
    }

    for (const file of files) {
      addLog({ type: 'info', message: 'Uploading image: ' + file.name });
      const result = await uploadImageToRepo(token, ghUser.username, file);
      images.unshift({
        name: result.filename,
        rawUrl: result.rawUrl,
        htmlUrl: result.htmlUrl,
        cdnUrl: result.cdnUrl || '',
        size: file.size,
        path: result.path,
        sha: result.sha || '',
      });
      showToast('✓ "' + file.name + '" uploaded — URL copied!', 'success');
      addLog({ type: 'success', message: 'Image uploaded: ' + result.rawUrl });
      // Auto-copy the URL to clipboard
      try { await navigator.clipboard.writeText(result.rawUrl); } catch {}
    }
  } catch (err) {
    showToast('Upload failed: ' + err.message, 'error');
    addLog({ type: 'error', message: 'Image upload failed: ' + err.message });
  } finally {
    uploading = false;
    renderImageView(container);
  }
}

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
