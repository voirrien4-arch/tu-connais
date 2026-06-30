import { getState, setState } from '../state.js';
import { saveProjects, MAX_PROJECTS } from '../storage.js';
import { showToast } from './toast-view.js';
const t = (key) => window.miniappI18n?.t(key) ?? key;
const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let editingUrlId = null;

export function renderDashboard(container) {
  const { projects, logs, user, adminProjects } = getState();
  const activeProjects = projects.filter(p => p.status === 'live').length;
  const pendingProjects = projects.filter(p => p.status === 'pending').length;
  const recent = projects.slice(0, 5);

  container.innerHTML = `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-white">${t('dashboard.welcome')}, ${user?.username} 👋</h1>
        <p class="text-slate-400 mt-1" data-i18n="dashboard.subtitle">${t('dashboard.subtitle')}</p>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
          <p class="text-sm text-slate-400" data-i18n="dashboard.totalProjects">${t('dashboard.totalProjects')}</p>
          <p class="text-3xl font-bold text-white mt-1">${projects.length}<span class="text-lg text-slate-500 font-normal">/${MAX_PROJECTS}</span></p>
          <div class="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all ${projects.length >= MAX_PROJECTS ? 'bg-red-500' : projects.length >= 15 ? 'bg-amber-500' : 'bg-emerald-500'}" style="width:${Math.min(100, (projects.length / MAX_PROJECTS) * 100)}%"></div>
          </div>
        </div>
        <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
          <p class="text-sm text-slate-400" data-i18n="dashboard.activeDeploys">${t('dashboard.activeDeploys')}</p>
          <p class="text-3xl font-bold text-emerald-400 mt-1">${activeProjects}</p>
        </div>
        <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
          <p class="text-sm text-slate-400">Pending</p>
          <p class="text-3xl font-bold text-amber-400 mt-1">${pendingProjects}</p>
        </div>
        <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
          <p class="text-sm text-slate-400" data-i18n="dashboard.recentLogs">${t('dashboard.recentLogs')}</p>
          <p class="text-3xl font-bold text-cyan-400 mt-1">${logs.length}</p>
        </div>
      </div>

      <div class="flex flex-wrap gap-3">
        <button id="quickDeploy" class="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition active:scale-[0.98]">
          <span>🚀</span> <span data-i18n="dashboard.quickDeploy">${t('dashboard.quickDeploy')}</span>
        </button>
        <a href="https://whatsapp.com/channel/0029Vb7Bk6jEVccC46JZL92T" target="_blank" rel="noopener" class="flex items-center gap-2 px-6 py-3 bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 font-medium rounded-xl hover:bg-emerald-500/25 transition">
          <span>💬</span> <span data-i18n="dashboard.whatsapp">${t('dashboard.whatsapp')}</span>
        </a>
        <a href="https://zip-github-mcamara-v1.onrender.com/" target="_blank" rel="noopener" class="flex items-center gap-2 px-6 py-3 bg-cyan-500/15 border border-cyan-500/25 text-cyan-300 font-medium rounded-xl hover:bg-cyan-500/25 transition">
          <span>🔗</span> <span data-i18n="dashboard.otherProjects">${t('dashboard.otherProjects')}</span>
        </a>
      </div>

      ${adminProjects.length > 0 ? `
      <div>
        <h2 class="text-lg font-bold text-white mb-4">🔗 ${t('dashboard.featuredProjects') || 'Featured Projects'}</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          ${adminProjects.map(p => `
            <a href="${p.url}" target="_blank" rel="noopener" class="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-amber-500/30 hover:bg-white/[0.07] transition group block">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-lg shrink-0">${esc(p.icon || '🔗')}</div>
                <div class="min-w-0">
                  <p class="text-white font-medium group-hover:text-amber-300 transition truncate">${esc(p.name)}</p>
                  ${p.description ? `<p class="text-xs text-slate-400 mt-0.5 line-clamp-2">${esc(p.description)}</p>` : ''}
                  <span class="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">${esc(p.category || 'project')}</span>
                </div>
              </div>
            </a>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <div>
        <h2 class="text-lg font-bold text-white mb-4" data-i18n="dashboard.recentProjects">${t('dashboard.recentProjects')}</h2>
        ${recent.length === 0 ? `
          <div class="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
            <p class="text-5xl mb-4">📦</p>
            <p class="text-slate-400" data-i18n="dashboard.noProjects">${t('dashboard.noProjects')}</p>
          </div>
        ` : `
          <div class="space-y-3">
            ${recent.map(p => `
              <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${p.platform === 'pages' ? 'bg-emerald-500/20' : 'bg-white/10'}">
                    ${p.platform === 'pages' ? '📄' : '⬛'}
                  </div>
                  <div class="min-w-0">
                    <p class="font-medium text-white truncate">${p.name}</p>
                    <p class="text-xs text-slate-400">${p.type} • ${p.platform} • ${new Date(p.createdAt).toLocaleDateString()}</p>
                    ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener" class="text-xs text-cyan-400 hover:text-cyan-300 truncate block max-w-[200px]">${p.url}</a>` : ''}
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="px-2.5 py-1 rounded-lg text-xs font-medium ${p.status === 'live' ? 'bg-emerald-500/20 text-emerald-300' : p.status === 'pending' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}">${p.status}</span>
                  ${p.status === 'pending' ? `<button data-set-url="${p.id}" class="w-8 h-8 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 flex items-center justify-center text-amber-300 transition" title="Set live URL">🔗</button>` : ''}
                  ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-cyan-400 transition" aria-label="Open site">↗</a>` : ''}
                  <button data-delete-project="${p.id}" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-red-400 transition" aria-label="Delete project">🗑</button>
                </div>
              </div>
              ${editingUrlId === p.id ? `
              <div class="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 -mt-1">
                <p class="text-sm text-amber-300 mb-2">Paste the live URL of your deployed project:</p>
                <div class="flex gap-2">
                  <input type="url" id="liveUrlInput" value="" placeholder="https://your-app.vercel.app" class="flex-1 px-4 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition text-sm">
                  <button data-save-url="${p.id}" class="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition text-sm">Save</button>
                  <button data-cancel-url class="px-4 py-2.5 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition text-sm">Cancel</button>
                </div>
                ${p.repoUrl ? `<a href="${p.repoUrl}" target="_blank" rel="noopener" class="text-xs text-slate-500 hover:text-slate-400 mt-2 inline-block">📂 ${p.repoUrl.replace('https://github.com/', '')}</a>` : ''}
              </div>
              ` : ''}
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  document.getElementById('quickDeploy')?.addEventListener('click', () => setState({ currentView: 'deploy' }));

  // Delete project
  container.querySelectorAll('[data-delete-project]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const projectId = +btn.dataset.deleteProject;
      if (!confirm('Delete this project from your dashboard?')) return;
      const updated = projects.filter(p => p.id !== projectId);
      setState({ projects: updated });
      const { user } = getState();
      await saveProjects(user?.username, updated);
      editingUrlId = null;
      renderDashboard(container);
    });
  });

  // Set Live URL button
  container.querySelectorAll('[data-set-url]').forEach(btn => {
    btn.addEventListener('click', () => {
      editingUrlId = +btn.dataset.setUrl;
      renderDashboard(container);
      // Focus the input
      setTimeout(() => document.getElementById('liveUrlInput')?.focus(), 50);
    });
  });

  // Save Live URL
  container.querySelectorAll('[data-save-url]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const projectId = +btn.dataset.saveUrl;
      const input = document.getElementById('liveUrlInput');
      const url = input?.value?.trim();
      if (!url) { showToast('Enter the live URL', 'warning'); return; }
      if (!url.startsWith('http')) { showToast('URL must start with https://', 'warning'); return; }
      const updated = projects.map(p => {
        if (p.id === projectId) {
          return { ...p, url, status: 'live' };
        }
        return p;
      });
      setState({ projects: updated });
      const { user } = getState();
      await saveProjects(user?.username, updated);
      editingUrlId = null;
      showToast('✓ Live URL saved!', 'success');
      renderDashboard(container);
    });
  });

  // Cancel URL editing
  container.querySelectorAll('[data-cancel-url]').forEach(btn => {
    btn.addEventListener('click', () => {
      editingUrlId = null;
      renderDashboard(container);
    });
  });

  // Allow Enter key to save URL
  const liveUrlInput = document.getElementById('liveUrlInput');
  if (liveUrlInput) {
    liveUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const saveBtn = container.querySelector('[data-save-url]');
        if (saveBtn) saveBtn.click();
      }
      if (e.key === 'Escape') {
        editingUrlId = null;
        renderDashboard(container);
      }
    });
  }
}
