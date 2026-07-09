// Options page controller.

import { getSettings, saveSettings } from '../shared/storage-schema.js';
import { encryptApiKey, decryptApiKey, isValidApiKey, generateId, escapeHtml, timeAgo } from '../shared/utils.js';
import { testApiKey } from '../background/ai-client.js';
import { ACTIONS, RANK_WEIGHTS, MODEL_PRESETS, PROVIDERS, KEY_PREFIXES } from '../shared/constants.js';
import { localizeDocument } from '../shared/i18n.js';

let settings = {};

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  localizeDocument();
  applyTheme(localStorage.getItem('theme') || 'auto');
  settings = await getSettings();
  populateForm();
  setupTabs();
  setupListeners();
  renderCategories();
  refreshBackupStatus();
  pollImportProgress();
}

// ─── Theme ────────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '◐';
}

// ─── Form Population ──────────────────────────────────────────────────────────

async function populateForm() {
  document.getElementById('provider-select').value = settings.provider || PROVIDERS.OPENROUTER;
  populateModelDropdown();

  const apiKey = settings.apiKey ? await decryptApiKey(settings.apiKey) : '';
  document.getElementById('api-key').value = apiKey || '';
  updateKeyPlaceholder();

  document.getElementById('enable-categories').checked = settings.enableAutoCategories !== false;
  document.getElementById('enable-summaries').checked = settings.enableAiSummaries !== false;
  document.getElementById('enable-ranking').checked = settings.rankingEnabled !== false;
  document.getElementById('enable-sheets-backup').checked = settings.sheetsBackupEnabled === true;

  const w = settings.rankWeights || RANK_WEIGHTS;
  setSlider('weight-visits', Math.round((w.VISIT_COUNT || 0.4) * 100));
  setSlider('weight-recency', Math.round((w.RECENCY || 0.3) * 100));
  setSlider('weight-relevance', Math.round((w.AI_RELEVANCE || 0.2) * 100));
  setSlider('weight-shares', Math.round((w.SHARE_COUNT || 0.1) * 100));
}

function populateModelDropdown() {
  const provider = document.getElementById('provider-select').value;
  const select = document.getElementById('model-select');
  const presets = MODEL_PRESETS[provider] || [];

  select.innerHTML = presets
    .map((m) => `<option value="${escapeHtml(m.id)}">${m.free ? '🎁 ' : ''}${escapeHtml(m.label)}</option>`)
    .join('');

  // Keep the saved model if it belongs to this provider, else pick the first
  if (presets.some((m) => m.id === settings.model)) {
    select.value = settings.model;
  }
}

function updateKeyPlaceholder() {
  const provider = document.getElementById('provider-select').value;
  document.getElementById('api-key').placeholder = (KEY_PREFIXES[provider] || 'sk-') + '...';
}

function setSlider(id, value) {
  const el = document.getElementById(id);
  if (el) { el.value = value; document.getElementById(id + '-val').textContent = value + '%'; }
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab)?.classList.add('active');
    });
  });
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

function setupListeners() {
  document.getElementById('btn-theme').addEventListener('click', () => {
    const order = ['auto', 'dark', 'light'];
    const current = localStorage.getItem('theme') || 'auto';
    const next = order[(order.indexOf(current) + 1) % order.length];
    localStorage.setItem('theme', next);
    applyTheme(next);
  });

  document.getElementById('provider-select').addEventListener('change', () => {
    populateModelDropdown();
    updateKeyPlaceholder();
  });

  document.getElementById('btn-toggle-key').addEventListener('click', () => {
    const input = document.getElementById('api-key');
    const btn = document.getElementById('btn-toggle-key');
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? 'Show' : 'Hide';
  });

  document.getElementById('btn-test-key').addEventListener('click', handleTestKey);

  ['weight-visits', 'weight-recency', 'weight-relevance', 'weight-shares'].forEach((id) => {
    document.getElementById(id).addEventListener('input', (e) => {
      document.getElementById(id + '-val').textContent = e.target.value + '%';
      checkWeightTotal();
    });
  });

  document.getElementById('btn-add-category').addEventListener('click', addCategory);

  // Backup & Import
  document.getElementById('btn-import-existing').addEventListener('click', handleImportExisting);
  document.getElementById('btn-backup-now').addEventListener('click', handleBackupNow);
  document.getElementById('btn-open-sheet').addEventListener('click', () => {
    if (settings.spreadsheetId) {
      window.open(`https://docs.google.com/spreadsheets/d/${settings.spreadsheetId}`, '_blank');
    }
  });

  // Export / Import files
  document.getElementById('btn-export-csv').addEventListener('click', exportCsv);
  document.getElementById('btn-export-json').addEventListener('click', exportJson);
  document.getElementById('btn-export-html').addEventListener('click', exportHtml);
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', handleImportFile);

  // Danger zone
  document.getElementById('btn-clear-ai-data').addEventListener('click', handleClearAiData);
  document.getElementById('btn-reset-all').addEventListener('click', handleResetAll);

  document.getElementById('btn-save').addEventListener('click', handleSave);
}

// ─── API Key Testing ──────────────────────────────────────────────────────────

async function handleTestKey() {
  const provider = document.getElementById('provider-select').value;
  const model = document.getElementById('model-select').value;
  const keyInput = document.getElementById('api-key').value.trim();
  const statusEl = document.getElementById('api-key-status');
  const btn = document.getElementById('btn-test-key');

  if (!keyInput) {
    showStatus(statusEl, 'Enter an API key first.', 'error');
    return;
  }
  if (!isValidApiKey(keyInput, provider)) {
    showStatus(statusEl, `Key should start with "${KEY_PREFIXES[provider]}"`, 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Testing…';
  showStatus(statusEl, '', '');

  try {
    await testApiKey(provider, keyInput, model);
    showStatus(statusEl, '✓ API key works with this model', 'ok');
  } catch (err) {
    showStatus(statusEl, `✗ ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test';
  }
}

// ─── Categories ───────────────────────────────────────────────────────────────

function renderCategories() {
  const list = document.getElementById('categories-list');
  list.innerHTML = (settings.categories || []).map((cat) => `
    <div class="cat-row" data-cat-id="${escapeHtml(cat.id)}">
      <input type="color" class="cat-row-color" value="${escapeHtml(cat.color)}" title="Change color">
      <span class="cat-row-name">${escapeHtml(cat.name)}</span>
      <button class="cat-row-del" data-cat-id="${escapeHtml(cat.id)}" title="Delete category">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.cat-row-del').forEach((btn) => {
    btn.addEventListener('click', () => deleteCategory(btn.dataset.catId));
  });

  list.querySelectorAll('.cat-row-color').forEach((input) => {
    input.addEventListener('change', (e) => {
      const id = input.closest('.cat-row').dataset.catId;
      const cat = settings.categories.find((c) => c.id === id);
      if (cat) cat.color = e.target.value;
    });
  });
}

function addCategory() {
  const name = prompt('Category name:');
  if (!name?.trim()) return;
  settings.categories = settings.categories || [];
  settings.categories.push({ id: generateId('cat'), name: name.trim(), color: '#6366f1', icon: 'bookmark' });
  renderCategories();
}

function deleteCategory(id) {
  if (!confirm('Delete this category? Bookmarks will become uncategorized.')) return;
  settings.categories = (settings.categories || []).filter((c) => c.id !== id);
  renderCategories();
}

// ─── Ranking ──────────────────────────────────────────────────────────────────

function checkWeightTotal() {
  const total =
    parseInt(document.getElementById('weight-visits').value) +
    parseInt(document.getElementById('weight-recency').value) +
    parseInt(document.getElementById('weight-relevance').value) +
    parseInt(document.getElementById('weight-shares').value);

  document.getElementById('weight-total-warning').style.display = total !== 100 ? 'block' : 'none';
}

// ─── Import Existing Bookmarks ────────────────────────────────────────────────

async function handleImportExisting() {
  const btn = document.getElementById('btn-import-existing');
  btn.disabled = true;
  btn.textContent = 'Scanning…';

  try {
    const result = await sendMessage({ action: ACTIONS.IMPORT_EXISTING });
    document.getElementById('import-progress').classList.remove('hidden');
    document.getElementById('import-progress-text').textContent =
      `Found ${result.total} bookmarks, ${result.queued} queued for AI processing.`;
    pollImportProgress();
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import & Organize Existing Bookmarks';
  }
}

let importPollTimer = null;

async function pollImportProgress() {
  try {
    const progress = await sendMessage({ action: ACTIONS.GET_IMPORT_PROGRESS });
    if (!progress || progress.queued === 0) return;

    const wrap = document.getElementById('import-progress');
    wrap.classList.remove('hidden');

    const pct = Math.min(100, Math.round(((progress.processed || 0) / progress.queued) * 100));
    document.getElementById('import-progress-fill').style.width = pct + '%';
    document.getElementById('import-progress-text').textContent = progress.done
      ? `✓ Done — ${progress.processed}/${progress.queued} bookmarks organized by AI.`
      : `AI processing: ${progress.processed || 0}/${progress.queued} (${pct}%) — keeps running in the background.`;

    if (!progress.done) {
      clearTimeout(importPollTimer);
      importPollTimer = setTimeout(pollImportProgress, 3000);
    }
  } catch {
    // Service worker may be waking up — retry later
    clearTimeout(importPollTimer);
    importPollTimer = setTimeout(pollImportProgress, 5000);
  }
}

// ─── Google Sheets Backup ─────────────────────────────────────────────────────

async function handleBackupNow() {
  const btn = document.getElementById('btn-backup-now');
  const statusEl = document.getElementById('backup-status');
  btn.disabled = true;
  btn.textContent = 'Backing up…';

  try {
    const result = await sendMessage({ action: ACTIONS.BACKUP_TO_SHEETS });
    if (result.error) throw new Error(result.error);
    showStatus(statusEl, `✓ ${result.rowCount} bookmarks backed up to Google Sheets`, 'ok');
    settings = await getSettings();
    refreshBackupStatus();
  } catch (err) {
    showStatus(statusEl, `✗ ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Backup Now';
  }
}

function refreshBackupStatus() {
  const openBtn = document.getElementById('btn-open-sheet');
  const statusEl = document.getElementById('backup-status');

  if (settings.spreadsheetId) {
    openBtn.classList.remove('hidden');
    if (settings.lastBackupTimestamp) {
      showStatus(statusEl, `Last backup: ${timeAgo(settings.lastBackupTimestamp)}`, '');
    }
  }
}

// ─── Export / Import files ────────────────────────────────────────────────────

async function collectExportRows() {
  const { getBookmarkIndex, getSummary } = await import('../shared/storage-schema.js');
  const index = await getBookmarkIndex();
  const entries = Object.values(index).sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));
  return Promise.all(
    entries.map(async (e) => ({
      ...e,
      summary: e.summaryRef ? (await getSummary(e.id))?.summary || '' : '',
      categoryName: settings.categories.find((c) => c.id === e.categoryId)?.name || '',
    }))
  );
}

async function exportCsv() {
  const rows = await collectExportRows();
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['Title', 'URL', 'Category', 'Tags', 'Summary', 'Rank', 'Visits', 'Created'].map(esc).join(','),
    ...rows.map((r) =>
      [r.title, r.url, r.categoryName, (r.tags || []).join('; '), r.summary, r.rankScore, r.visitCount,
        r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : ''].map(esc).join(',')
    ),
  ];
  // BOM so Excel opens Hebrew/Chinese text correctly
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `ai-bookmarks-${new Date().toISOString().slice(0, 10)}.csv`);
}

async function exportJson() {
  const rows = await collectExportRows();
  const blob = new Blob([JSON.stringify({ version: 2, bookmarks: rows }, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `ai-bookmarks-${new Date().toISOString().slice(0, 10)}.json`);
}

async function exportHtml() {
  const rows = await collectExportRows();
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>AI Bookmarks Export</TITLE>',
    '<H1>AI Bookmarks</H1>',
    '<DL><p>',
    ...rows.map((e) => `  <DT><A HREF="${e.url}" ADD_DATE="${Math.floor((e.createdAt || Date.now()) / 1000)}">${e.title || e.url}</A>`),
    '</DL><p>',
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/html' });
  downloadBlob(blob, `ai-bookmarks-${new Date().toISOString().slice(0, 10)}.html`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.bookmarks?.length) throw new Error('No bookmarks found in file');

    const { upsertBookmark } = await import('../shared/storage-schema.js');
    for (const bm of data.bookmarks) {
      await upsertBookmark(bm);
    }
    setSaveStatus(`Imported ${data.bookmarks.length} bookmarks`);
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }

  e.target.value = '';
}

// ─── Danger Zone ──────────────────────────────────────────────────────────────

async function handleClearAiData() {
  if (!confirm('Clear all AI summaries and re-queue bookmarks for processing? This cannot be undone.')) return;

  const { getBookmarkIndex, saveBookmarkIndex } = await import('../shared/storage-schema.js');
  const index = await getBookmarkIndex();

  for (const entry of Object.values(index)) {
    entry.aiStatus = 'pending';
    entry.summaryRef = null;
    entry.tags = [];
    entry.categoryId = null;
  }

  await saveBookmarkIndex(index);
  setSaveStatus('AI data cleared. Bookmarks will be re-processed.');
}

async function handleResetAll() {
  if (!confirm('Delete ALL AI Bookmarks data? This cannot be undone.')) return;
  if (!confirm('Are you absolutely sure? All bookmarks and settings will be lost.')) return;

  await chrome.storage.sync.clear();
  await chrome.storage.local.clear();
  setSaveStatus('All data cleared. Reload the extension.');
}

// ─── Save ─────────────────────────────────────────────────────────────────────

async function handleSave() {
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    await saveCurrentSettings();
    setSaveStatus('✓ Saved');
  } catch (err) {
    setSaveStatus(`✗ Error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Settings';
    setTimeout(() => setSaveStatus(''), 3000);
  }
}

async function saveCurrentSettings() {
  const rawKey = document.getElementById('api-key').value.trim();
  let encryptedKey = settings.apiKey;
  if (rawKey) {
    const currentDecrypted = settings.apiKey ? await decryptApiKey(settings.apiKey) : '';
    if (rawKey !== currentDecrypted) {
      encryptedKey = await encryptApiKey(rawKey);
    }
  } else {
    encryptedKey = '';
  }

  const totalWeight =
    parseInt(document.getElementById('weight-visits').value) +
    parseInt(document.getElementById('weight-recency').value) +
    parseInt(document.getElementById('weight-relevance').value) +
    parseInt(document.getElementById('weight-shares').value);

  if (totalWeight !== 100) {
    throw new Error('Ranking weights must sum to 100%');
  }

  const updated = {
    ...settings,
    provider: document.getElementById('provider-select').value,
    model: document.getElementById('model-select').value,
    apiKey: encryptedKey,
    enableAutoCategories: document.getElementById('enable-categories').checked,
    enableAiSummaries: document.getElementById('enable-summaries').checked,
    rankingEnabled: document.getElementById('enable-ranking').checked,
    sheetsBackupEnabled: document.getElementById('enable-sheets-backup').checked,
    rankWeights: {
      VISIT_COUNT: parseInt(document.getElementById('weight-visits').value) / 100,
      RECENCY: parseInt(document.getElementById('weight-recency').value) / 100,
      AI_RELEVANCE: parseInt(document.getElementById('weight-relevance').value) / 100,
      SHARE_COUNT: parseInt(document.getElementById('weight-shares').value) / 100,
    },
  };

  await saveSettings(updated);
  settings = updated;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function showStatus(el, msg, type) {
  el.textContent = msg;
  el.className = 'status-msg' + (type ? ` status-${type}` : '');
}

function setSaveStatus(msg) {
  document.getElementById('save-status').textContent = msg;
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (response?.error) reject(new Error(response.error));
      else resolve(response);
    });
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
