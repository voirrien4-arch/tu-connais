// ui/messages-view.js — User chat interface to contact admin

import { getState, setState } from '../state.js';
import { loadMessages, saveMessages } from '../storage.js';
import { showToast } from './toast-view.js';

const t = (key) => window.miniappI18n?.t(key) ?? key;

export function resetMessagesView() { /* state managed by render */ }

export async function renderMessages(container) {
  container.innerHTML = `<div class="flex items-center justify-center h-[60vh]"><span class="animate-spin text-3xl">⏳</span></div>`;

  const { user } = getState();
  if (!user?.username) return;

  const msgs = await loadMessages(user.username);
  const unread = msgs.filter(m => m.from === 'admin' && !m.read).length;

  if (unread > 0) {
    const updated = msgs.map(m => m.from === 'admin' && !m.read ? { ...m, read: true } : m);
    await saveMessages(user.username, updated);
    setState({ messages: updated, unreadMessages: 0 });
    renderChatUI(container, updated);
  } else {
    setState({ messages: msgs, unreadMessages: 0 });
    renderChatUI(container, msgs);
  }
}

function renderChatUI(container, messages) {
  container.innerHTML = `
    <div class="flex flex-col h-[calc(100vh-2rem)] md:h-screen">
      <div class="shrink-0 p-4 sm:p-6 border-b border-white/10 bg-slate-900/50 backdrop-blur">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-red-500/30 to-amber-500/30 flex items-center justify-center text-lg">🛡️</div>
          <div>
            <h1 class="text-lg font-bold text-white">${t('messages.title')}</h1>
            <p class="text-xs text-slate-400">${t('messages.subtitle')}</p>
          </div>
        </div>
      </div>

      <div id="messagesList" class="flex-1 overflow-y-auto p-4 space-y-3">
        ${messages.length === 0 ? `
          <div class="flex flex-col items-center justify-center h-full text-center py-12">
            <p class="text-5xl mb-4">💬</p>
            <p class="text-slate-300 text-sm font-medium">${t('messages.emptyTitle')}</p>
            <p class="text-slate-500 text-xs mt-1 max-w-xs">${t('messages.emptyDesc')}</p>
          </div>` : messages.map(m => `
          <div class="flex ${m.from === 'user' ? 'justify-end' : 'justify-start'} gap-2">
            ${m.from === 'admin' ? '<div class="w-7 h-7 rounded-full bg-red-500/20 flex items-center justify-center text-xs shrink-0 mt-1">🛡️</div>' : ''}
            <div class="max-w-[75%]">
              <div class="px-4 py-2.5 rounded-2xl text-sm ${m.from === 'user'
                ? 'bg-amber-500/20 text-amber-100 rounded-br-md'
                : 'bg-white/10 text-slate-200 rounded-bl-md'}">
                <p class="break-words">${esc(m.text)}</p>
              </div>
              <p class="text-[10px] text-slate-600 mt-1 ${m.from === 'user' ? 'text-right' : ''}">
                ${m.from === 'admin' ? '🛡️ Admin · ' : ''}${formatTime(m.timestamp)}
              </p>
            </div>
            ${m.from === 'user' ? '<div class="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center text-xs shrink-0 mt-1">👤</div>' : ''}
          </div>`).join('')}
      </div>

      <div class="shrink-0 p-4 border-t border-white/10 bg-slate-900/50 backdrop-blur">
        <form id="messageForm" class="flex gap-2">
          <input type="text" id="messageInput" class="flex-1 bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/25 transition" placeholder="${t('messages.placeholder')}" maxlength="1000" autocomplete="off">
          <button type="submit" class="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition text-sm shrink-0 active:scale-95">${t('messages.send')} ➤</button>
        </form>
      </div>
    </div>`;

  const list = document.getElementById('messagesList');
  if (list) list.scrollTop = list.scrollHeight;

  const form = document.getElementById('messageForm');
  const input = document.getElementById('messageInput');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const msg = { id: Date.now(), from: 'user', text, timestamp: new Date().toISOString(), read: false };
    const updated = [...getState().messages, msg];
    setState({ messages: updated });
    await saveMessages(getState().user.username, updated);
    input.value = '';
    renderChatUI(container, updated);
    showToast(t('messages.messageSent'), 'success');
    document.getElementById('messageInput')?.focus();
  });

  input?.focus();
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return t('messages.justNow');
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return t('messages.yesterday') + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
