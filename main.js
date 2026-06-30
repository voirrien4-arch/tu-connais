// main.js — App bootstrap with multi-user session support

import { getState, setState, subscribe } from './state.js';
import { loadSession, loadProjects, loadSettings, loadLogs, saveLogs, loadMessages, loadAdminProjects, loadSiteStatus } from './storage.js';
import { initToast } from './ui/toast-view.js';
import { renderSidebar } from './ui/sidebar-view.js';
import { renderAuth } from './ui/auth-view.js';
import { renderDashboard } from './ui/dashboard-view.js';
import { renderDeploy, resetDeploy } from './ui/deploy-view.js';
import { renderStatus } from './ui/status-view.js';
import { renderSettings } from './ui/settings-view.js';
import { renderLogs } from './ui/logs-view.js';
import { renderGithub, resetGithubView } from './ui/github-view.js';
import { renderAdmin, resetAdmin } from './ui/admin-view.js';
import { renderHelp } from './ui/help-view.js';
import { renderImageView, resetImageView } from './ui/image-view.js';
import { renderPagesView, resetPagesView } from './ui/pages-view.js';
import { renderMessages, resetMessagesView } from './ui/messages-view.js';

const sidebarContainer = document.getElementById('sidebar-container');
const mainContainer = document.getElementById('main-container');

const viewRenderers = {
  auth: renderAuth,
  dashboard: renderDashboard,
  deploy: renderDeploy,
  github: renderGithub,
  status: renderStatus,
  settings: renderSettings,
  logs: renderLogs,
  help: renderHelp,
  admin: renderAdmin,
  images: renderImageView,
  pages: renderPagesView,
  messages: renderMessages,
};

let lastView = null;
let lastSidebarOpen = false;
let saveLogsTimer = null;

async function init() {
  initToast();

  // Wait for i18n translations to load before rendering
  if (window.miniappI18n?.ready) {
    await window.miniappI18n.ready;
  }

  // Re-render current view when language changes
  window.addEventListener('localeChanged', () => {
    lastView = null; // force full re-render
    render(getState());
  });

  try {
    const session = await loadSession();
    if (session && session.username) {
      const [projects, settings, logs, messages, adminProjects, siteStatus] = await Promise.all([
        loadProjects(session.username),
        loadSettings(session.username),
        loadLogs(session.username),
        loadMessages(session.username),
        loadAdminProjects(),
        loadSiteStatus(),
      ]);
      const unreadMessages = messages.filter(m => m.from === 'admin' && !m.read).length;
      setState({
        currentView: session.isAdmin ? 'admin' : 'dashboard',
        user: { username: session.username, isAdmin: !!session.isAdmin },
        projects,
        adminProjects,
        settings,
        logs,
        messages,
        unreadMessages,
        siteStatus,
      });
    } else {
      const siteStatus = await loadSiteStatus();
      setState({ currentView: 'auth', siteStatus });
    }
  } catch {
    setState({ currentView: 'auth' });
  }
  subscribe(render);
  render(getState());
}

function render(state) {
  const view = state.currentView;
  const viewChanged = view !== lastView;
  const sidebarToggled = state.sidebarOpen !== lastSidebarOpen;
  const isPaused = state.siteStatus?.paused && !state.user?.isAdmin;

  // Remove loading screen on first render
  const loadingEl = document.getElementById('app-loading');
  if (loadingEl) {
    loadingEl.remove();
    mainContainer.style.display = '';
  }

  // Block non-admin users when site is paused
  if (isPaused && view !== 'auth') {
    sidebarContainer.innerHTML = '';
    mainContainer.classList.remove('md:ml-64');
    const redirectUrl = state.siteStatus?.redirectUrl || '';
    mainContainer.innerHTML = `
      <div class="min-h-screen flex items-center justify-center px-4">
        <div class="text-center max-w-md">
          <div class="text-7xl mb-6">⏸️</div>
          <h1 class="text-3xl font-bold text-white mb-3">Site en pause</h1>
          <p class="text-slate-400 mb-6">Le site est actuellement en maintenance. Veuillez revenir plus tard.</p>
          ${redirectUrl ? `<a href="${redirectUrl}" target="_blank" rel="noopener" class="inline-block px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition">🔗 Aller au nouveau site</a>` : ''}
        </div>
      </div>`;
    lastView = view;
    lastSidebarOpen = state.sidebarOpen;
    return;
  }

  if (view === 'auth') {
    if (viewChanged && lastView !== null) {
      sidebarContainer.innerHTML = '';
      mainContainer.classList.remove('md:ml-64');
    }
    // If site is paused, show pause screen instead of login (unless admin bypass)
    if (isPaused && !state.adminBypassPause) {
      const redirectUrl = state.siteStatus?.redirectUrl || '';
      mainContainer.innerHTML = `
        <div class="min-h-screen flex items-center justify-center px-4">
          <div class="text-center max-w-md">
            <div class="text-7xl mb-6">⏸️</div>
            <h1 class="text-3xl font-bold text-white mb-3">Site en pause</h1>
            <p class="text-slate-400 mb-6">Le site est actuellement en maintenance. Veuillez revenir plus tard.</p>
            ${redirectUrl ? `<a href="${redirectUrl}" target="_blank" rel="noopener" class="inline-block px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition mb-6">🔗 Aller au nouveau site</a>` : ''}
            <button id="adminAccessBtn" class="block mx-auto mt-4 px-4 py-2 text-xs text-slate-500 hover:text-slate-300 border border-white/10 hover:border-white/20 rounded-lg transition">🛡️ Admin Access</button>
          </div>
        </div>`;
      document.getElementById('adminAccessBtn')?.addEventListener('click', () => {
        setState({ adminBypassPause: true });
      });
    } else {
      renderAuth(mainContainer);
    }
  } else {
    // Entering non-auth view from auth → add margin
    if (lastView === 'auth' || lastView === null) {
      mainContainer.classList.add('md:ml-64');
    }
    // Re-render sidebar when view changes (nav highlight) or hamburger toggles (open/close)
    if (viewChanged || sidebarToggled) {
      renderSidebar(sidebarContainer);
    }
    // Render main content when view changes
    if (viewChanged) {
      const renderer = viewRenderers[view];
      if (renderer) renderer(mainContainer);
    }
  }

  lastView = view;
  lastSidebarOpen = state.sidebarOpen;

  // Debounce log persistence (max once per 2s)
  if (state.user?.username) {
    if (saveLogsTimer) clearTimeout(saveLogsTimer);
    saveLogsTimer = setTimeout(() => {
      saveLogs(state.user.username, state.logs).catch(() => {});
    }, 2000);
  }
}

init();
