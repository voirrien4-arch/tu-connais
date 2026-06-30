// ui/admin-messages-tab.js — Admin panel: Messages tab
// Shows all user conversations. Admin can view and reply to messages.

import { loadMessages, saveMessages, loadUsers } from '../storage.js';
import { showToast } from './toast-view.js';

const t = (key) => window.miniappI18n?.t(key) ?? key;

let selectedConversation = null;

export function resetAdminMessages() {
  selectedConversation = null;
}

/**
 * Load all user conversations with metadata.
 * @returns {Promise<Array>} conversations sorted by last message time
 */
export async function loadAllConversations() {
  const users = await loadUsers();
  const conversations = [];
  for (const u of users) {
    const msgs = await loadMessages(u.username);
    const unread = msgs.filter(m => m.from === 'user' && !m.read).length;
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    conversations.push({ username: u.username, messages: msgs, unread, lastMsg });
  }
  conversations.sort((a, b) => {
    if (!a.lastMsg && !b.lastMsg) return 0;
    if (!a.lastMsg) return 1;
    if (!b.lastMsg) return -1;
    return new Date(b.lastMsg.timestamp) - new Date(a.lastMsg.timestamp);
  });
  return conversations;
}

/**
 * Render messages tab HTML content.
 * @param {Array} conversations - from loadAllConversations()
 * @returns {string} HTML string
 */
export function renderMessagesTabContent(conversations) {
  if (selectedConversation) {
    const conv = conversations.find(c => c.username === selectedConversation);
    if (conv) return renderConversationView(conv);
    selectedConversation = null;
  }
  return renderConversationsList(conversations);
}

function renderConversationsList(conversations) {
  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  if (conversations.length === 0) {
    return `
      <div class="text-center py-12">
        <p class="text-5xl mb-4">💬</p>
        <p class="text-slate-400">${t('messages.noConversations')}</p>
        <p class="text-slate-500 text-xs mt-1">${t('messages.noConversationsDesc')}</p>
      </div>`;
  }

  return `
    <div class="space-y-3">
      ${totalUnread > 0 ? `<p class="text-sm text-amber-400 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>${totalUnread} ${t('messages.unread')}</p>` : ''}
      ${conversations.map(c => {
        const preview = c.lastMsg ? truncate(c.lastMsg.text, 60) : t('messages.noMessagesYet');
        const time = c.lastMsg ? formatShortTime(c.lastMsg.timestamp) : '';
        return `
          <button data-admin-open-conv="${esc(c.username)}" class="w-full text-left p-4 bg-white/5 border ${c.unread > 0 ? 'border-amber-500/30' : 'border-white/10'} rounded-xl hover:bg-white/10 transition flex items-center gap-3">
            <div class="w-10 h-10 rounded-full ${c.unread > 0 ? 'bg-amber-500/20' : 'bg-slate-700'} flex items-center justify-center text-lg shrink-0">👤</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-white font-medium text-sm">${esc(c.username)}</span>
                <span class="text-[10px] text-slate-500 shrink-0">${time}</span>
              </div>
              <p class="text-xs text-slate-400 truncate mt-0.5">${esc(preview)}</p>
            </div>
            ${c.unread > 0 ? `<span class="w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center shrink-0">${c.unread}</span>` : ''}
          </button>`;
      }).join('')}
    </div>`;
}

function renderConversationView(conv) {
  return `
    <div class="space-y-3">
      <button data-admin-back-conv class="px-3 py-1.5 border border-white/10 text-slate-300 hover:bg-white/5 rounded-lg text-xs transition">← ${t('messages.backToList')}</button>
      <div class="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
        <div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-lg">👤</div>
        <div>
          <p class="text-white font-medium">${esc(conv.username)}</p>
          <p class="text-xs text-slate-500">${conv.messages.length} ${t('messages.messagesCount')}</p>
        </div>
      </div>
      <div id="adminConvMessages" class="max-h-[40vh] overflow-y-auto space-y-2 p-2">
        ${conv.messages.length === 0 ? `<p class="text-center text-slate-500 text-sm py-8">${t('messages.noMessagesYet')}</p>` :
          conv.messages.map(m => `
            <div class="flex ${m.from === 'admin' ? 'justify-end' : 'justify-start'}">
              <div class="max-w-[80%]">
                <div class="px-3 py-2 rounded-xl text-sm ${m.from === 'admin'
                  ? 'bg-red-500/15 text-red-200 rounded-br-md'
                  : 'bg-white/10 text-slate-200 rounded-bl-md'}">
                  <p class="break-words">${esc(m.text)}</p>
                </div>
                <p class="text-[10px] text-slate-600 mt-0.5 ${m.from === 'admin' ? 'text-right' : ''}">${m.from === 'admin' ? '🛡️ ' : '👤 '}${formatShortTime(m.timestamp)}</p>
              </div>
            </div>`).join('')}
      </div>
      <form id="adminReplyForm" data-reply-user="${esc(conv.username)}" class="flex gap-2">
        <input type="text" id="adminReplyInput" class="flex-1 bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 transition" placeholder="${t('messages.adminReplyPlaceholder')}" maxlength="1000" autocomplete="off">
        <button type="submit" class="px-5 py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl transition text-sm shrink-0 active:scale-95">➤</button>
      </form>
    </div>`;
}

// ── Bind events for admin messages tab ──

export function bindAdminMessagesTabEvents(container, refreshCallback) {
  container.querySelectorAll('[data-admin-open-conv]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const username = btn.dataset.adminOpenConv;
      // Mark admin messages as read
      const msgs = await loadMessages(username);
      const updated = msgs.map(m => m.from === 'user' && !m.read ? { ...m, read: true } : m);
      await saveMessages(username, updated);
      selectedConversation = username;
      refreshCallback();
    });
  });

  container.querySelector('[data-admin-back-conv]')?.addEventListener('click', () => {
    selectedConversation = null;
    refreshCallback();
  });

  container.querySelector('#adminReplyForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const username = form.dataset.replyUser;
    const input = container.querySelector('#adminReplyInput');
    const text = input.value.trim();
    if (!text) return;

    const msgs = await loadMessages(username);
    const reply = { id: Date.now(), from: 'admin', text, timestamp: new Date().toISOString(), read: false };
    msgs.push(reply);
    await saveMessages(username, msgs);
    input.value = '';
    showToast(t('messages.replySent'), 'success');
    refreshCallback();
  });

  // Auto-scroll to bottom of conversation
  const convBox = container.querySelector('#adminConvMessages');
  if (convBox) convBox.scrollTop = convBox.scrollHeight;

  // Focus input
  container.querySelector('#adminReplyInput')?.focus();
}

// ── Helpers ──

function formatShortTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return t('messages.justNow');
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function truncate(s, n) { return s.length > n ? s.slice(0, n) + '...' : s; }

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
