import { loadMessages } from '../storage.js';
import { loadAllConversations, renderMessagesTabContent, bindAdminMessagesTabEvents, resetAdminMessages } from './admin-messages-tab.js';
import { getDeploymentFiles, SOURCE_FILES } from '../services/source-bundle.js';
// ui/admin-view.js — Admin panel: multi-user system management
// Admin is already authenticated via auth-view (balla/620891542)
// This panel shows ALL registered users and their data

import { getState, setState, addLog } from '../state.js';
import { showToast } from './toast-view.js';
import {
  loadUsers, saveUsers, loadAllUsersData, deleteUser,
  loadProjects, saveProjects, loadSettings, saveSettings,
  loadLogs, saveLogs, clearSession,
  loadAdminProjects, saveAdminProjects,
  loadSiteStatus, saveSiteStatus,
} from '../storage.js';

const t = (key) => window.miniappI18n?.t(key) ?? key;

let activeTab = 'overview';
let showKeys = false;
let selectedUser = null; // for viewing a specific user's data

export function resetAdmin() {
  activeTab = 'overview';
  showKeys = false;
  selectedUser = null;
  editingAdminProject = null;
  resetAdminMessages();
}

export function renderAdmin(container) {
  const { user } = getState();
  if (!user?.isAdmin) {
    container.innerHTML = `
      <div class="min-h-[80vh] flex items-center justify-center px-4">
        <div class="text-center">
          <p class="text-6xl mb-4">🚫</p>
          <h2 class="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p class="text-slate-400">Admin privileges required</p>
        </div>
      </div>`;
    return;
  }
  renderAdminPanel(container);
}

// ── Main Admin Panel ──

async function renderAdminPanel(container) {
  const { user } = getState();
  const allUsersData = await loadAllUsersData();
  const conversations = await loadAllConversations();

  // Aggregate stats
  let totalProjects = 0, liveProjects = 0, totalLogs = 0, totalUnreadMsgs = 0;
  const byPlatform = { vercel: 0, pages: 0 };
  const byType = { site: 0, api: 0 };

  allUsersData.forEach(u => {
    totalProjects += u.projectCount;
    totalLogs += u.logCount;
    u.projects.forEach(p => {
      if (p.status === 'live') liveProjects++;
      if (byPlatform[p.platform] !== undefined) byPlatform[p.platform]++;
      if (byType[p.type] !== undefined) byType[p.type]++;
    });
  });
  conversations.forEach(c => { totalUnreadMsgs += c.unread; });

  const stats = {
    totalUsers: allUsersData.length,
    totalProjects,
    liveProjects,
    totalLogs,
    totalUnreadMsgs,
    byPlatform,
    byType,
  };

  // If viewing a specific user's detail
  if (selectedUser) {
    const userData = allUsersData.find(u => u.username === selectedUser);
    if (userData) {
      container.innerHTML = renderUserDetail(userData);
      bindUserDetailActions(container, userData);
      return;
    }
    selectedUser = null;
  }

  // Pre-render async tab content
  const tabContentHtml = await renderTabContent(activeTab, { allUsersData, conversations, stats });

  container.innerHTML = `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-white">🛡️ ${t('admin.title')}</h1>
          <p class="text-slate-400 mt-1 text-sm">${t('admin.subtitle')} — <span class="text-red-400 font-medium">${esc(user.username)}</span></p>
        </div>
        <button id="adminLogout" class="px-4 py-2 bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 rounded-xl text-sm transition font-medium">
          🚪 ${t('admin.logout')}
        </button>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        ${statCard('👤', t('admin.users'), stats.totalUsers, 'cyan')}
        ${statCard('📦', t('admin.totalProjects'), stats.totalProjects, 'amber')}
        ${statCard('🟢', t('admin.liveProjects'), stats.liveProjects, 'emerald')}
        ${statCard('📋', t('admin.totalLogs'), stats.totalLogs, 'slate')}
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 border-b border-white/10 pb-0 overflow-x-auto" role="tablist">
        ${['overview', 'users', 'projects', 'messages', 'logs', 'source', 'danger'].map(tab => `
          <button data-admin-tab="${tab}" class="px-4 py-2.5 text-sm font-medium rounded-t-lg transition whitespace-nowrap ${activeTab === tab ? 'bg-white/5 text-red-300 border-b-2 border-red-400' : 'text-slate-400 hover:text-white hover:bg-white/5'}" role="tab">
            ${tab === 'overview' ? '📊 ' + t('admin.overview') : tab === 'users' ? '👥 ' + t('admin.users') : tab === 'projects' ? '🔗 ' + t('admin.projects') : tab === 'messages' ? '💬 ' + t('admin.messages') + (totalUnreadMsgs > 0 ? ' <span class="inline-block ml-1 px-1.5 py-0.5 bg-amber-500 text-slate-950 text-[10px] font-bold rounded-full">' + totalUnreadMsgs + '</span>' : '') : tab === 'logs' ? '📋 ' + t('admin.logs') : tab === 'source' ? '📥 Source Code' : '⚠️ ' + t('admin.dangerZone')}
          </button>
        `).join('')}
      </div>

      <div id="adminTabContent">${tabContentHtml}</div>
    </div>
  `;

  // Bind logout
  document.getElementById('adminLogout')?.addEventListener('click', async () => {
    await clearSession();
    setState({ user: null, currentView: 'auth', projects: [], settings: { vercelToken: '', githubToken: '' }, logs: [], sidebarOpen: false });
    showToast(t('admin.logoutMsg'), 'info');
  });

  // Bind tabs
  container.querySelectorAll('[data-admin-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.adminTab;
      renderAdminPanel(container);
    });
  });

  bindTabActions(container, allUsersData);
}

// ── Tab Router ──

async function renderTabContent(tab, data) {
  switch (tab) {
    case 'overview': return renderOverviewTab(data);
    case 'users': return renderUsersTab(data);
    case 'projects': return await renderAdminProjectsTab();
    case 'messages': return renderMessagesTabContent(data.conversations);
    case 'logs': return renderLogsTab(data);
    case 'source': return renderSourceTab();
    case 'danger': return await renderDangerTab(data);
    default: return '';
  }
}

// ── Admin Projects Tab ──

let editingAdminProject = null; // null = add new, { index, ... } = editing

async function renderAdminProjectsTab() {
  const projects = await loadAdminProjects();
  const isEditing = editingAdminProject !== null;

  // Icon picker: categories with emojis
  const iconCategories = [
    { name: '🚀 Projets', icons: ['🚀','🌐','📱','💻','🖥️','🤖','⚡','🔌','📡','🛰️','🧩','🔧','⚙️','🛠️','📐','🏗️'] },
    { name: '🎮 Gaming', icons: ['🎮','🕹️','🎯','🎲','🃏','🏆','🥇','🥈','🥉','⚔️','🛡️','🏹','💣','🔥','💀','👻'] },
    { name: '🎨 Créatif', icons: ['🎨','🖌️','📷','📸','🎬','🎥','🎵','🎶','🎤','🎧','🎸','🎹','✍️','📝','📐','🗂️'] },
    { name: '💬 Social', icons: ['💬','📢','📣','🔔','💌','📩','📨','📧','🤝','👥','👤','🫂','💜','❤️','💛','💚'] },
    { name: '🛒 Commerce', icons: ['🛒','🛍️','💰','💎','🏷️','📦','🎁','💳','🪙','💵','💸','🤑','📊','📈','📉','🏦'] },
    { name: '📚 Apprendre', icons: ['📚','📖','🎓','🧠','💡','🔬','🧪','🔭','📐','🧮','🏫','📝','✏️','🗒️','📋','📌'] },
    { name: '🌍 Web', icons: ['🌍','🔗','🔑','🔒','🔓','🛡️','🍪','🗂️','📂','🗃️','💾','💿','📀','🖨️','⌨️','🖱️'] },
    { name: '✨ Fun', icons: ['✨','⭐','🌟','💫','🌈','☀️','🌙','🍀','🌸','🌺','🎃','🎄','🎉','🎊','🎋','🎑'] },
  ];

  const selectedIcon = isEditing ? (editingAdminProject.icon || '🔗') : '🔗';

  return `
    <div class="space-y-4">
      <!-- Add/Edit Form -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4" id="adminProjectForm">
        <h3 class="text-lg font-bold text-white">${isEditing ? '✏️ Edit Project' : '➕ Add Project Link'}</h3>
        <p class="text-slate-400 text-sm">Add project links that will be visible to all users on their dashboard.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">Project Name</label>
            <input type="text" id="adminProjName" value="${isEditing ? esc(editingAdminProject.name) : ''}" placeholder="My Awesome Project" class="w-full px-4 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition text-sm">
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">Project URL</label>
            <input type="url" id="adminProjUrl" value="${isEditing ? esc(editingAdminProject.url) : ''}" placeholder="https://myproject.com" class="w-full px-4 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition text-sm">
          </div>
          <div class="sm:col-span-2">
            <label class="block text-sm font-medium text-slate-300 mb-1.5">Category</label>
            <select id="adminProjCategory" class="w-full px-4 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-white focus:outline-none focus:border-amber-500 transition text-sm">
              <option value="project" ${isEditing && editingAdminProject.category === 'project' ? 'selected' : ''}>🚀 Project</option>
              <option value="tool" ${isEditing && editingAdminProject.category === 'tool' ? 'selected' : ''}>🛠️ Tool</option>
              <option value="resource" ${isEditing && editingAdminProject.category === 'resource' ? 'selected' : ''}>📚 Resource</option>
              <option value="social" ${isEditing && editingAdminProject.category === 'social' ? 'selected' : ''}>💬 Social</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
          <textarea id="adminProjDesc" rows="2" placeholder="A short description of this project..." class="w-full px-4 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition text-sm resize-none">${isEditing ? esc(editingAdminProject.description) : ''}</textarea>
        </div>

        <!-- Visual Icon Picker -->
        <div>
          <label class="block text-sm font-medium text-slate-300 mb-2">🎨 Icône du projet</label>
          <div class="flex items-center gap-3 mb-3">
            <div id="iconPreview" class="w-14 h-14 rounded-xl bg-amber-500/20 border-2 border-amber-400/40 flex items-center justify-center text-3xl shrink-0">${esc(selectedIcon)}</div>
            <input type="text" id="adminProjIcon" value="${esc(selectedIcon)}" maxlength="4" class="w-20 px-3 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-white text-center text-xl focus:outline-none focus:border-amber-500 transition">
            <span class="text-xs text-slate-500">Cliquez ou tapez</span>
          </div>
          <div class="space-y-3 max-h-[260px] overflow-y-auto pr-1 rounded-xl bg-slate-900/40 p-3 border border-white/5">
            ${iconCategories.map(cat => `
              <div>
                <p class="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">${cat.name}</p>
                <div class="flex flex-wrap gap-1">
                  ${cat.icons.map(icon => `
                    <button type="button" data-pick-icon="${icon}" class="w-9 h-9 rounded-lg flex items-center justify-center text-lg transition ${selectedIcon === icon ? 'bg-amber-500/30 border border-amber-400 scale-110 shadow-md shadow-amber-500/20' : 'bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20'}">${icon}</button>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="flex gap-3">
          <button id="adminProjSave" class="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition text-sm">
            ${isEditing ? '💾 Save Changes' : '➕ Add Project'}
          </button>
          ${isEditing ? '<button id="adminProjCancel" class="px-4 py-2.5 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl transition text-sm">Cancel</button>' : ''}
        </div>
      </div>

      <!-- Projects List -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-white text-sm">📋 All Projects (${projects.length})</h3>
        </div>
        ${projects.length === 0 ? `
          <div class="text-center py-8">
            <p class="text-4xl mb-3">🔗</p>
            <p class="text-slate-400">No projects added yet. Add your first project link above!</p>
          </div>
        ` : `
          <div class="space-y-2">
            ${projects.map((p, i) => `
              <div class="p-4 bg-slate-900/50 rounded-xl flex items-start justify-between gap-3">
                <div class="flex items-start gap-3 min-w-0">
                  <div class="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-lg shrink-0">${esc(p.icon || '🔗')}</div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-white font-medium">${esc(p.name)}</span>
                      <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">${esc(p.category || 'project')}</span>
                    </div>
                    ${p.description ? `<p class="text-xs text-slate-400 mt-0.5 line-clamp-2">${esc(p.description)}</p>` : ''}
                    ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener" class="text-xs text-cyan-400 hover:underline truncate block max-w-xs mt-0.5">${esc(p.url)}</a>` : ''}
                  </div>
                </div>
                <div class="flex gap-1.5 shrink-0">
                  <button data-edit-admin-proj="${i}" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-amber-500/20 flex items-center justify-center text-amber-400 transition" title="Edit">✏️</button>
                  <button data-del-admin-proj="${i}" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-red-400 transition" title="Delete">🗑</button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

function bindAdminProjectsTab(container) {
  // Save project
  document.getElementById('adminProjSave')?.addEventListener('click', async () => {
    const name = document.getElementById('adminProjName')?.value?.trim();
    const url = document.getElementById('adminProjUrl')?.value?.trim();
    const icon = document.getElementById('adminProjIcon')?.value?.trim() || '🔗';
    const category = document.getElementById('adminProjCategory')?.value || 'project';
    const description = document.getElementById('adminProjDesc')?.value?.trim() || '';

    if (!name) { showToast('Please enter a project name', 'warning'); return; }
    if (!url) { showToast('Please enter a project URL', 'warning'); return; }
    if (!url.startsWith('http')) { showToast('URL must start with https://', 'warning'); return; }

    const projects = await loadAdminProjects();

    if (editingAdminProject !== null) {
      // Update existing
      const idx = editingAdminProject.index;
      if (idx >= 0 && idx < projects.length) {
        projects[idx] = { ...projects[idx], name, url, icon, category, description, updatedAt: new Date().toISOString() };
      }
      editingAdminProject = null;
      showToast('✓ Project updated!', 'success');
    } else {
      // Add new
      projects.push({ name, url, icon, category, description, createdAt: new Date().toISOString() });
      showToast('✓ Project added!', 'success');
    }

    await saveAdminProjects(projects);
    addLog({ type: 'info', message: `🛡️ Admin ${editingAdminProject ? 'updated' : 'added'} project: ${name}` });
    renderAdminPanel(container);
  });

  // Cancel edit
  document.getElementById('adminProjCancel')?.addEventListener('click', () => {
    editingAdminProject = null;
    renderAdminPanel(container);
  });

  // Icon picker — click to select
  container.querySelectorAll('[data-pick-icon]').forEach(btn => {
    btn.addEventListener('click', () => {
      const icon = btn.dataset.pickIcon;
      const iconInput = document.getElementById('adminProjIcon');
      const iconPreview = document.getElementById('iconPreview');
      if (iconInput) iconInput.value = icon;
      if (iconPreview) iconPreview.textContent = icon;
      // Update selected state visually
      container.querySelectorAll('[data-pick-icon]').forEach(b => {
        b.className = 'w-9 h-9 rounded-lg flex items-center justify-center text-lg transition bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20';
      });
      btn.className = 'w-9 h-9 rounded-lg flex items-center justify-center text-lg transition bg-amber-500/30 border border-amber-400 scale-110 shadow-md shadow-amber-500/20';
    });
  });

  // Icon input — update preview on typing
  document.getElementById('adminProjIcon')?.addEventListener('input', (e) => {
    const iconPreview = document.getElementById('iconPreview');
    if (iconPreview) iconPreview.textContent = e.target.value || '🔗';
  });

  // Edit project
  container.querySelectorAll('[data-edit-admin-proj]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = +btn.dataset.editAdminProj;
      const projects = await loadAdminProjects();
      if (idx >= 0 && idx < projects.length) {
        editingAdminProject = { ...projects[idx], index: idx };
        renderAdminPanel(container);
        setTimeout(() => {
          document.getElementById('adminProjectForm')?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }
    });
  });

  // Delete project
  container.querySelectorAll('[data-del-admin-proj]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = +btn.dataset.delAdminProj;
      if (!confirm('Delete this project?')) return;
      const projects = await loadAdminProjects();
      const removed = projects.splice(idx, 1);
      await saveAdminProjects(projects);
      addLog({ type: 'info', message: `🛡️ Admin deleted project: ${removed[0]?.name || 'unknown'}` });
      showToast('Project deleted', 'success');
      editingAdminProject = null;
      renderAdminPanel(container);
    });
  });
}

// ── Source Code Tab ──

function renderSourceTab() {
  return `
    <div class="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
      <div class="flex items-center gap-3">
        <div class="p-3 bg-emerald-500/20 rounded-xl">
          <span class="text-2xl">📦</span>
        </div>
        <div>
          <h3 class="text-lg font-bold text-white">Download Source Code</h3>
          <p class="text-slate-400 text-sm">Generate a complete, deployable ZIP file of the entire Gold_Crew project.</p>
        </div>
      </div>
      
      <div class="p-4 bg-slate-900/50 rounded-xl border border-white/5">
        <h4 class="text-sm font-medium text-white mb-2">Included Files</h4>
        <ul class="text-xs text-slate-400 space-y-1 ml-4 list-disc">
          <li>index.html (App shell)</li>
          <li>server.js & package.json (Node server)</li>
          <li>storage-shim.js & i18n-shim.js (Polyfills)</li>
          <li>main.js & state.js (Core logic)</li>
          <li>ui/*.js (Interface components)</li>
          <li>services/*.js (Deployment engines)</li>
          <li>locales/*.json (Translations)</li>
        </ul>
      </div>

      <button id="downloadSourceBtn" class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition flex items-center justify-center gap-2">
        <span>📥</span> Download Source ZIP
      </button>
      <p class="text-xs text-center text-slate-500">Ready to deploy: Build Command: <code class="bg-slate-800 px-1.5 py-0.5 rounded">npm install</code> | Start Command: <code class="bg-slate-800 px-1.5 py-0.5 rounded">npm start</code></p>
    </div>
  `;
}

// ── Overview Tab ──

function renderOverviewTab({ allUsersData, stats }) {
  return `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Users List -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
        <h3 class="font-bold text-white text-sm flex items-center gap-2">👥 ${t('admin.registeredUser')}s (${allUsersData.length})</h3>
        ${allUsersData.length === 0 ? '<p class="text-slate-500 text-sm">No users registered yet</p>' : ''}
        ${allUsersData.map(u => `
          <div class="flex items-center gap-3 p-3 bg-slate-900/50 rounded-xl">
            <div class="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-lg">👤</div>
            <div class="flex-1 min-w-0">
              <p class="text-white font-medium truncate">${esc(u.username)}</p>
              <p class="text-[11px] text-slate-500">${u.projectCount} projects • ${u.logCount} logs • Joined ${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}</p>
            </div>
            <button data-view-user="${esc(u.username)}" class="px-3 py-1.5 bg-amber-500/15 border border-amber-500/25 text-amber-300 hover:bg-amber-500/25 rounded-lg text-xs transition">View</button>
          </div>
        `).join('')}
      </div>

      <!-- API Keys Status (all users) -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
        <h3 class="font-bold text-white text-sm flex items-center gap-2">🔑 ${t('admin.apiKeys')} (${t('admin.configured')})</h3>
        ${allUsersData.map(u => `
          <div class="p-3 bg-slate-900/50 rounded-xl space-y-1.5">
            <p class="text-white text-sm font-medium">${esc(u.username)}</p>
            <div class="flex gap-3 text-xs">
              <span class="${u.hasGithubToken ? 'text-emerald-400' : 'text-red-400'}">GitHub: ${u.hasGithubToken ? '✓' : '✕'}</span>
              <span class="${u.hasVercelToken ? 'text-emerald-400' : 'text-red-400'}">Vercel: ${u.hasVercelToken ? '✓' : '✕'}</span>
            </div>
          </div>
        `).join('')}
        ${allUsersData.length === 0 ? '<p class="text-slate-500 text-sm">No users yet</p>' : ''}
      </div>

      <!-- Platform Distribution -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
        <h3 class="font-bold text-white text-sm flex items-center gap-2">☁️ ${t('admin.platforms')}</h3>
        ${barRow('Vercel', stats.byPlatform.vercel, stats.totalProjects, 'white')}
        ${barRow('GitHub Pages', stats.byPlatform.pages, stats.totalProjects, 'emerald')}
      </div>

      <!-- Type Distribution -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
        <h3 class="font-bold text-white text-sm flex items-center gap-2">📂 ${t('admin.projectTypes')}</h3>
        ${barRow('🌐 Site', stats.byType.site, stats.totalProjects, 'amber')}
        ${barRow('⚡ API', stats.byType.api, stats.totalProjects, 'emerald')}
      </div>
    </div>
  `;
}

// ── Users Tab ──

function renderUsersTab({ allUsersData }) {
  if (allUsersData.length === 0) {
    return `<div class="text-center py-10 text-slate-500"><p class="text-4xl mb-3">👤</p><p>No users registered yet</p></div>`;
  }
  return `
    <div class="space-y-3">
      ${allUsersData.map(u => `
        <div class="bg-white/5 border border-white/10 rounded-xl p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-xl shrink-0">👤</div>
              <div class="min-w-0">
                <p class="text-white font-medium text-lg">${esc(u.username)}</p>
                <p class="text-xs text-slate-500 mt-0.5">Joined ${u.createdAt ? new Date(u.createdAt).toLocaleString() : 'N/A'}</p>
                <div class="flex flex-wrap gap-2 mt-2">
                  <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">${u.projectCount} projects</span>
                  <span class="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">${u.logCount} logs</span>
                  ${u.hasGithubToken ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">GitHub ✓</span>' : ''}
                  ${u.hasVercelToken ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300">Vercel ✓</span>' : ''}
                </div>
              </div>
            </div>
            <div class="flex flex-col gap-2 shrink-0">
              <button data-view-user="${esc(u.username)}" class="px-4 py-2 bg-amber-500/15 border border-amber-500/25 text-amber-300 hover:bg-amber-500/25 rounded-lg text-xs transition font-medium">
                👁 View Details
              </button>
              <button data-delete-user="${esc(u.username)}" class="px-4 py-2 bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 rounded-lg text-xs transition">
                🗑 Delete
              </button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── User Detail View ──

function renderUserDetail(userData) {
  return `
    <div class="space-y-6">
      <div class="flex items-center gap-4">
        <button id="backToUsers" class="px-4 py-2 border border-white/10 text-slate-300 hover:bg-white/5 rounded-xl text-sm transition">← Back</button>
        <div>
          <h1 class="text-2xl font-bold text-white">👤 ${esc(userData.username)}</h1>
          <p class="text-slate-400 text-sm">${userData.projectCount} projects • ${userData.logCount} logs • Joined ${userData.createdAt ? new Date(userData.createdAt).toLocaleString() : 'N/A'}</p>
        </div>
      </div>

      <!-- User API Keys -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-white text-sm flex items-center gap-2">🔑 ${t('admin.apiKeys')}</h3>
          <button id="toggleShowKeys" class="px-3 py-1.5 bg-slate-800 border border-white/10 text-slate-300 hover:text-white rounded-lg text-xs transition">
            ${showKeys ? '🙈 ' + t('admin.hideKeys') : '👁 ' + t('admin.showKeys')}
          </button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          ${userKeyCard('GitHub', userData.settings.githubToken, showKeys)}
          ${userKeyCard('Vercel', userData.settings.vercelToken, showKeys)}
        </div>
      </div>

      <!-- User Projects -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-white text-sm">📦 Projects (${userData.projects.length})</h3>
          <button data-admin-delete-all-projects="${esc(userData.username)}" class="px-3 py-1.5 bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 rounded-lg text-xs transition">
            🗑 Delete All
          </button>
        </div>
        ${userData.projects.length === 0 ? '<p class="text-slate-500 text-sm">No projects</p>' : `
          <div class="space-y-2 max-h-[40vh] overflow-y-auto">
            ${userData.projects.map(p => `
              <div class="p-3 bg-slate-900/50 rounded-xl flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-white font-medium">${esc(p.name)}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${p.platform === 'pages' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-slate-300'}">${p.platform}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">${p.type}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${p.status === 'live' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}">${p.status}</span>
                  </div>
                  ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener" class="text-xs text-cyan-400 hover:underline">${p.url}</a>` : ''}
                </div>
                <button data-admin-delete-project="${p.id}" data-user="${esc(userData.username)}" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-red-400 transition shrink-0" aria-label="Delete">🗑</button>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- User Logs -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-white text-sm">📋 ${t('admin.logs')} (${userData.logs.length})</h3>
          <div class="flex gap-2">
            <button data-admin-export-user-logs="${esc(userData.username)}" class="px-3 py-1.5 border border-white/10 text-slate-300 hover:bg-white/5 rounded-lg text-xs transition">📥 Export</button>
            <button data-admin-clear-user-logs="${esc(userData.username)}" class="px-3 py-1.5 bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 rounded-lg text-xs transition">🗑 Clear</button>
          </div>
        </div>
        ${userData.logs.length === 0 ? '<p class="text-slate-500 text-sm">No logs</p>' : `
          <div class="space-y-1.5 max-h-[30vh] overflow-y-auto">
            ${userData.logs.slice(0, 50).map(l => `
              <div class="flex items-start gap-2 text-xs p-2 bg-slate-900/30 rounded-lg">
                <span class="shrink-0">${l.type === 'success' ? '✅' : l.type === 'error' ? '❌' : 'ℹ️'}</span>
                <div class="min-w-0">
                  <p class="text-slate-200 break-words">${esc(l.message)}</p>
                  <p class="text-slate-600 mt-0.5">${new Date(l.timestamp).toLocaleString()}</p>
                </div>
              </div>
            `).join('')}
            ${userData.logs.length > 50 ? `<p class="text-slate-600 text-xs text-center">... and ${userData.logs.length - 50} more</p>` : ''}
          </div>
        `}
      </div>
    </div>
  `;
}

// ── Logs Tab ──

function renderLogsTab({ allUsersData }) {
  const allLogs = [];
  allUsersData.forEach(u => {
    u.logs.forEach(l => allLogs.push({ ...l, _user: u.username }));
  });
  allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const successCount = allLogs.filter(l => l.type === 'success').length;
  const errorCount = allLogs.filter(l => l.type === 'error').length;
  const infoCount = allLogs.filter(l => l.type === 'info').length;

  if (allLogs.length === 0) {
    return `<div class="text-center py-10 text-slate-500"><p class="text-4xl mb-3">📋</p><p>No logs recorded</p></div>`;
  }

  return `
    <div class="space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="flex gap-3 text-xs">
          <span class="text-emerald-400">✅ ${successCount}</span>
          <span class="text-red-400">❌ ${errorCount}</span>
          <span class="text-cyan-400">ℹ️ ${infoCount}</span>
          <span class="text-slate-500">Total: ${allLogs.length}</span>
        </div>
        <div class="flex gap-2">
          <button id="adminExportAllLogs" class="px-3 py-1.5 border border-white/10 text-slate-300 hover:bg-white/5 rounded-lg text-xs transition">📥 ${t('admin.exportLogs')}</button>
          <button id="adminClearAllLogs" class="px-3 py-1.5 bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 rounded-lg text-xs transition">🗑 ${t('admin.clearLogs')}</button>
        </div>
      </div>
      <div class="space-y-1.5 max-h-[60vh] overflow-y-auto">
        ${allLogs.slice(0, 100).map(l => `
          <div class="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 flex items-start gap-2.5">
            <span class="shrink-0 mt-0.5">${l.type === 'success' ? '✅' : l.type === 'error' ? '❌' : 'ℹ️'}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">${esc(l._user)}</span>
                <p class="text-sm text-slate-200 break-words">${esc(l.message)}</p>
              </div>
              <p class="text-[10px] text-slate-600 mt-0.5">${new Date(l.timestamp).toLocaleString()}</p>
            </div>
          </div>
        `).join('')}
        ${allLogs.length > 100 ? `<p class="text-slate-600 text-xs text-center">... and ${allLogs.length - 100} more</p>` : ''}
      </div>
    </div>
  `;
}

// ── Danger Zone Tab (Site Pause / Redirect) ──

async function renderDangerTab() {
  const siteStatus = await loadSiteStatus();
  const isPaused = siteStatus.paused;
  const redirectUrl = siteStatus.redirectUrl || '';

  return `
    <div class="space-y-4">
      <!-- Site Pause -->
      <div class="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
        <div class="flex items-center gap-3">
          <div class="p-3 ${isPaused ? 'bg-red-500/20' : 'bg-emerald-500/20'} rounded-xl">
            <span class="text-2xl">${isPaused ? '⏸️' : '▶️'}</span>
          </div>
          <div>
            <h3 class="text-lg font-bold text-white">Contrôle du site</h3>
            <p class="text-slate-400 text-sm">${isPaused ? 'Le site est actuellement en pause. Les utilisateurs ne peuvent pas se connecter.' : 'Le site est actif et accessible à tous les utilisateurs.'}</p>
          </div>
        </div>

        <!-- Pause Toggle -->
        <div class="flex items-center justify-between p-4 ${isPaused ? 'bg-red-500/10 border border-red-500/25' : 'bg-emerald-500/10 border border-emerald-500/25'} rounded-xl">
          <div class="flex items-center gap-3">
            <span class="text-2xl">${isPaused ? '⏸️' : '▶️'}</span>
            <div>
              <p class="text-white font-bold text-sm">${isPaused ? 'Site en pause' : 'Site actif'}</p>
              <p class="text-xs ${isPaused ? 'text-red-400' : 'text-emerald-400'}">${isPaused ? 'Tous les utilisateurs sont bloqués (sauf admin)' : 'Tous les utilisateurs ont accès'}</p>
            </div>
          </div>
          <button id="toggleSitePause" class="px-5 py-2.5 ${isPaused ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'} font-bold rounded-xl transition text-sm">
            ${isPaused ? '▶️ Reprendre le site' : '⏸️ Mettre en pause'}
          </button>
        </div>

        <!-- Redirect URL -->
        <div class="space-y-2">
          <label class="block text-sm font-medium text-slate-300">🔗 Lien de redirection</label>
          <p class="text-xs text-slate-500 mb-2">Les utilisateurs seront redirigés vers ce lien quand le site est en pause.</p>
          <div class="flex gap-2">
            <input type="url" id="redirectUrlInput" value="${esc(redirectUrl)}" placeholder="https://nouveau-site.com"
              class="flex-1 px-4 py-3 bg-slate-900 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition text-sm">
            <button id="saveRedirectUrl" class="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition text-sm whitespace-nowrap">
              💾 Sauvegarder
            </button>
          </div>
          ${redirectUrl ? `<p class="text-xs text-slate-500 mt-1">Lien actuel : <a href="${esc(redirectUrl)}" target="_blank" rel="noopener" class="text-cyan-400 hover:underline">${esc(redirectUrl)}</a></p>` : ''}
        </div>

        <!-- Preview -->
        ${isPaused ? `
          <div class="border-t border-white/10 pt-4">
            <p class="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">Aperçu de la page de pause</p>
            <div class="bg-slate-900 rounded-xl p-6 text-center">
              <p class="text-4xl mb-3">⏸️</p>
              <p class="text-white font-bold">Site en pause</p>
              <p class="text-slate-400 text-xs mt-1">Le site est actuellement en maintenance.</p>
              ${redirectUrl ? `<p class="text-amber-400 text-xs mt-2">→ Lien vers : ${esc(redirectUrl)}</p>` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// ── User Detail Actions ──

function bindUserDetailActions(container, userData) {
  document.getElementById('backToUsers')?.addEventListener('click', () => { selectedUser = null; renderAdminPanel(container); });
  document.getElementById('toggleShowKeys')?.addEventListener('click', () => { showKeys = !showKeys; renderAdminPanel(container); });

  container.querySelectorAll('[data-admin-delete-project]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = +btn.dataset.adminDeleteProject;
      const uname = btn.dataset.user;
      if (!confirm(`Delete project #${id}?`)) return;
      const projects = await loadProjects(uname);
      const filtered = projects.filter(p => p.id !== id);
      await saveProjects(uname, filtered);
      addLog({ type: 'info', message: `🛡️ Admin deleted project #${id} from ${uname}` });
      showToast('Project deleted', 'success');
      selectedUser = uname; // refresh
      renderAdminPanel(container);
    });
  });

  container.querySelector(`[data-admin-delete-all-projects="${userData.username}"]`)?.addEventListener('click', async () => {
    if (!confirm(`Delete ALL projects for ${userData.username}?`)) return;
    await saveProjects(userData.username, []);
    addLog({ type: 'info', message: `🛡️ Admin deleted all projects from ${userData.username}` });
    showToast('All projects deleted', 'success');
    renderAdminPanel(container);
  });

  container.querySelector(`[data-admin-export-user-logs="${userData.username}"]`)?.addEventListener('click', () => {
    const text = userData.logs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
    downloadText(text, `gold-crew-logs-${userData.username}.txt`);
    showToast('Logs exported', 'success');
  });

  container.querySelector(`[data-admin-clear-user-logs="${userData.username}"]`)?.addEventListener('click', async () => {
    if (!confirm(`Clear all logs for ${userData.username}?`)) return;
    await saveLogs(userData.username, []);
    addLog({ type: 'info', message: `🛡️ Admin cleared logs for ${userData.username}` });
    showToast('Logs cleared', 'success');
    renderAdminPanel(container);
  });
}

// ── Tab Actions ──

function bindTabActions(container, allUsersData) {
  // Projects tab events
  if (activeTab === 'projects') {
    bindAdminProjectsTab(container);
  }

  // Messages tab events
  if (activeTab === 'messages') {
    bindAdminMessagesTabEvents(container, () => renderAdminPanel(container));
  }

  // View user detail
  container.querySelectorAll('[data-view-user]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedUser = btn.dataset.viewUser;
      renderAdminPanel(container);
    });
  });

  // Delete single user
  container.querySelectorAll('[data-delete-user]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uname = btn.dataset.deleteUser;
      if (!confirm(`DELETE user "${uname}" and ALL their data? This cannot be undone.`)) return;
      await deleteUser(uname);
      addLog({ type: 'info', message: `🛡️ Admin deleted user "${uname}"` });
      showToast(`User "${uname}" deleted`, 'success');
      renderAdminPanel(container);
    });
  });

  // Clear all logs
  document.getElementById('adminClearAllLogs')?.addEventListener('click', async () => {
    if (!confirm('Clear ALL logs from ALL users?')) return;
    for (const u of allUsersData) {
      await saveLogs(u.username, []);
    }
    addLog({ type: 'info', message: '🛡️ Admin cleared all logs' });
    showToast('All logs cleared', 'success');
    renderAdminPanel(container);
  });

  // Export all logs
  document.getElementById('adminExportAllLogs')?.addEventListener('click', () => {
    const lines = [];
    allUsersData.forEach(u => {
      u.logs.forEach(l => lines.push(`[${u.username}] [${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`));
    });
    downloadText(lines.join('\n'), 'gold-crew-all-logs.txt');
    showToast('All logs exported', 'success');
  });

  // Download Source Code
  document.getElementById('downloadSourceBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('downloadSourceBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin">⏳</span> Generating ZIP...`;
    
    try {
      await generateSourceZip();
      showToast('Source code ZIP downloaded!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to generate ZIP: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });

  // Danger zone — Site Pause / Redirect
  document.getElementById('toggleSitePause')?.addEventListener('click', async () => {
    const siteStatus = await loadSiteStatus();
    const newPaused = !siteStatus.paused;
    await saveSiteStatus({ ...siteStatus, paused: newPaused });
    setState({ siteStatus: { ...siteStatus, paused: newPaused } });
    addLog({ type: 'info', message: `🛡️ Admin ${newPaused ? 'paused' : 'resumed'} the site` });
    showToast(newPaused ? '⏸️ Site en pause' : '▶️ Site repris', newPaused ? 'warning' : 'success');
    renderAdminPanel(container);
  });

  document.getElementById('saveRedirectUrl')?.addEventListener('click', async () => {
    const url = document.getElementById('redirectUrlInput')?.value?.trim() || '';
    if (url && !url.startsWith('http')) {
      showToast('Le lien doit commencer par https://', 'warning');
      return;
    }
    const siteStatus = await loadSiteStatus();
    await saveSiteStatus({ ...siteStatus, redirectUrl: url });
    setState({ siteStatus: { ...siteStatus, redirectUrl: url } });
    addLog({ type: 'info', message: `🛡️ Admin updated redirect URL: ${url || '(none)'}` });
    showToast('🔗 Lien de redirection sauvegardé !', 'success');
    renderAdminPanel(container);
  });
}

// ── Generate Source ZIP ──

async function generateSourceZip() {
  const zip = new JSZip();

  // Use page base URI for fetch resolution (works in sandbox + standalone)
  const baseUrl = new URL('./', document.baseURI).href;
  const failed = [];

  // Fetch source files via import.meta.url (works in sandbox for same-origin JS/CSS/JSON)
  for (const filePath of SOURCE_FILES) {
    try {
      const res = await fetch(baseUrl + filePath);
      if (res.ok) {
        const text = await res.text();
        zip.file(filePath, text);
      } else {
        failed.push(filePath);
      }
    } catch {
      failed.push(filePath);
    }
  }

  // Add embedded deployment files (index.html, .gitignore, package.json, server.js, render.yaml, README.md)
  const deployFiles = getDeploymentFiles();
  for (const [path, content] of Object.entries(deployFiles)) {
    zip.file(path, content);
  }

  if (failed.length > 0) {
    const msg = `${failed.length} files could not be read: ${failed.join(', ')}. The ZIP may be incomplete.`;
    console.warn(msg);
    showToast(msg, 'warning', 6000);
  }

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = "gold-crew-deploy.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Helpers ──

function statCard(icon, label, value, color) {
  return `
    <div class="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
      <p class="text-2xl mb-1">${icon}</p>
      <p class="text-2xl font-bold text-${color}-400">${value}</p>
      <p class="text-xs text-slate-500 mt-0.5">${label}</p>
    </div>
  `;
}

function barRow(label, count, total, color) {
  const pct = total > 0 ? (count / total * 100) : 0;
  return `
    <div>
      <div class="flex items-center justify-between text-sm mb-1">
        <span class="text-slate-300">${label}</span>
        <span class="text-${color}-400 text-xs">${count}</span>
      </div>
      <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div class="h-full bg-${color}-500 rounded-full transition-all" style="width:${pct}%"></div>
      </div>
    </div>
  `;
}

function userKeyCard(label, value, show) {
  const masked = value ? value.substring(0, 6) + '••••' + value.substring(value.length - 4) : 'Not set';
  const display = show && value ? value : masked;
  return `
    <div class="bg-slate-900/50 rounded-xl p-3">
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm font-medium text-white">${label}</p>
        <span class="w-2.5 h-2.5 rounded-full ${value ? 'bg-emerald-500' : 'bg-red-500'}"></span>
      </div>
      <p class="text-xs text-slate-500 font-mono truncate mt-1">${esc(display)}</p>
    </div>
  `;
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
