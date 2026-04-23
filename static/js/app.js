/* ============================================================
   READFOLIO — app.js
   Shared utilities: toast, API helpers, formatting
   ============================================================ */

'use strict';

// ── Toast ─────────────────────────────────────────────────────
window.showToast = function (msg, type = 'default', duration = 3200) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

// ── API Helper ────────────────────────────────────────────────
window.api = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    return res.json();
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${url} → ${res.status}`);
    return res.json();
  },
  async put(url, body) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PUT ${url} → ${res.status}`);
    return res.json();
  },
  async delete(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`DELETE ${url} → ${res.status}`);
    return res.json();
  },
};

// ── Format Helpers ────────────────────────────────────────────
window.formatDate = function (isoString) {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day:   'numeric',
    month: 'short',
    year:  'numeric',
  }).format(new Date(isoString));
};

window.formatFileSize = function (bytes) {
  if (bytes < 1024)         return bytes + ' B';
  if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
};

window.debounce = function (fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};
