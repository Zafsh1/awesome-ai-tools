// Options page controller.

import { getSettings, saveSettings } from '../shared/storage-schema.js';
import { encryptApiKey, decryptApiKey, isValidApiKey, generateId, escapeHtml } from '../shared/utils.js';
import { testApiKey } from '../background/ai-client.js';
import { signInWithGoogle } from '../background/firebase-client.js';
import { ACTIONS, DEFAULT_SETTINGS, RANK_WEIGHTS } from '../shared/constants.js';
import { localizeDocument } from '../shared/i18n.js';

let settings = {};

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  localizeDocument();
  settings = await getSettings();
  populateForm();
  setupTabs();
  setupListeners();
  renderCategories();
}

// ─── Form Population ──────────────────────────────────────────────────────────

async function populateForm() {
  // API key (decrypt for display)
  const apiKey = settings.claudeApiKey ? await decryptApiKey(settings.claudeApiKey) : '';
  document.getElementById('api-key').value = apiKey || '';

  // Checkboxes
  document.getElementById('enable-categories').checked = settings.enableAutoCategories !== false;
  document.getElementById('enable-summaries').checked = settings.enableAiSummaries !== false;
  document.getElementById('enable-ranking').checked = settings.rankingEnabled !== false;
  document.getElementById('enable-sync').checked = settings.syncEnabled === true;

  // Ranking weights
  const w = settings.rankWeights || RANK_WEIGHTS;
  setSlider('weight-visits', Math.round((w.VISIT_COUNT || 0.4) * 100));
  setSlider('weight-recency', Math.round((w.RECENCY || 0.3) * 100));
  setSlider('weight-relevance', Math.round((w.AI_RELEVANCE || 0.2) * 100));
  setSlider('weight-shares', Math.round((w.SHARE_COUNT || 0.1) * 100));

  // Sync status
  updateSyncStatus();
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
  // API key: show/hide
  document.getElementById('btn-toggle-key').addEventListener('click', () => {
    const input = document.getElementById('api-key');
    const btn = document.getElementById('btn-toggle-key');
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? 'Show' : 'Hide';
  });

  // Test API key
  document.getElementById('btn-test-key').addEventListener('click', handleTestKey);

  // Ranking sliders
  ['weight-visits', 'weight-recency', 'weight-relevance', 'weight-shares'].forEach((id) => {
    document.getElementById(id).addEventListener('input', (e) => {
      document.getElementById(id + '-val').textContent = e.target.value + '%';
      checkWeightTotal();
    });
  });

  // Add category
  document.getElementById('btn-add-category').addEventListener('click', addCategory);

  // Sync sign in/out
  document.getElementById('btn-google-signin').addEventListener('click', handleGoogleSignIn);
  document.getElementById('btn-sign-out').addEventListener('click', handleSignOut);
  document.getElementById('btn-sync-now').addEventListener('click', handleSyncNow);

  // Export
  document.getElementById('btn-export-json').addEventListener('click', exportJson);
  document.getElementById('btn-export-html').addEventListener('click', exportHtml);

  // Import
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', handleImport);

  // Danger zone
  document.getElementById('btn-clear-ai-data').addEventListener('click', handleClearAiData);
  document.getElementById('btn-reset-all').addEventListener('click', handleResetAll);

  // Save
  document.getElementById('btn-save').addEventListener('click', handleSave);
}

// ─── API Key Testing ──────────────────────────────────────────────────────────

async function handleTestKey() {
  const keyInput = document.getElementById('api-key').value.trim();
  const statusEl = document.getElementById('api-key-status');
  const btn = document.getElementById('btn-test-key');

  if (!keyInput) {
    showStatus(statusEl, 'Enter an API key first.', 'error');
    return;
  }
  if (!isValidApiKey(keyInput)) {
    showStatus(statusEl, 'Key should start with "sk-ant-"', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Testing…';
  showStatus(statusEl, '', '');

  try {
    await testApiKey(keyInput);
    showStatus(statusEl, '✓ API key is valid', 'ok');
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
  settings.categories.push({ id: generateId('cat'), name: name.trim(), color: '#4A90E2', icon: 'bookmark' });
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

  const warning = document.getElementById('weight-total-warning');
  warning.style.display = total !== 100 ? 'block' : 'none';
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

async function handleGoogleSignIn() {
  const btn = document.getElementById('btn-google-signin');
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    const authResult = await chrome.identity.getAuthToken({ interactive: true });
    const googleToken = authResult.token || authResult;

    const { uid, idToken, refreshToken, expiresAt } = await signInWithGoogle(googleToken);

    settings.firebaseUid = uid;
    settings.firebaseToken = idToken;
    settings.firebaseRefreshToken = refreshToken;
    settings.tokenExpiresAt = expiresAt;
    settings.syncEnabled = true;

    document.getElementById('enable-sync').checked = true;
    await saveCurrentSettings();
    updateSyncStatus();
  } catch (err) {
    alert(`Sign in failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in with Google';
  }
}

async function handleSignOut() {
  if (!confirm('Sign out from sync? Your local bookmarks will be kept.')) return;
  settings.firebaseUid = null;
  settings.firebaseToken = null;
  settings.firebaseRefreshToken = null;
  settings.tokenExpiresAt = null;
  settings.syncEnabled = false;
  await saveCurrentSettings();
  updateSyncStatus();
}

async function handleSyncNow() {
  const btn = document.getElementById('btn-sync-now');
  btn.disabled = true;
  btn.textContent = 'Syncing…';
  try {
    await sendMessage({ action: ACTIONS.SYNC_NOW });
    setSaveStatus('Sync complete');
  } catch (err) {
    setSaveStatus(`Sync failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sync Now';
  }
}

function updateSyncStatus() {
  const icon = document.getElementById('sync-status-icon');
  const text = document.getElementById('sync-status-text');
  const signInBtn = document.getElementById('btn-google-signin');
  const signOutBtn = document.getElementById('btn-sign-out');
  const syncNowBtn = document.getElementById('btn-sync-now');

  if (settings.firebaseUid) {
    icon.textContent = '●';
    icon.style.color = '#28a745';
    text.textContent = `Connected (${settings.firebaseUid.slice(0, 8)}…)`;
    signInBtn.classList.add('hidden');
    signOutBtn.classList.remove('hidden');
    syncNowBtn.classList.remove('hidden');
  } else {
    icon.textContent = '○';
    icon.style.color = '';
    text.textContent = 'Not signed in';
    signInBtn.classList.remove('hidden');
    signOutBtn.classList.add('hidden');
    syncNowBtn.classList.add('hidden');
  }
}

// ─── Export / Import ──────────────────────────────────────────────────────────

async function exportJson() {
  const { getBookmarkIndex, getSummary } = await import('../shared/storage-schema.js');
  const index = await getBookmarkIndex();
  const entries = Object.values(index);

  const withSummaries = await Promise.all(
    entries.map(async (e) => ({
      ...e,
      summary: (await getSummary(e.id))?.summary || '',
    }))
  );

  const blob = new Blob([JSON.stringify({ version: 1, bookmarks: withSummaries }, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `ai-bookmarks-export-${Date.now()}.json`);
}

async function exportHtml() {
  const { getBookmarkIndex } = await import('../shared/storage-schema.js');
  const index = await getBookmarkIndex();
  const entries = Object.values(index);

  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>AI Bookmarks Export</TITLE>',
    '<H1>AI Bookmarks</H1>',
    '<DL><p>',
    ...entries.map((e) => `  <DT><A HREF="${e.url}" ADD_DATE="${Math.floor((e.createdAt || Date.now()) / 1000)}">${e.title || e.url}</A>`),
    '</DL><p>',
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/html' });
  downloadBlob(blob, `ai-bookmarks-export-${Date.now()}.html`);
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

async function handleImport(e) {
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

  e.target.value = ''; // Reset file input
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
  // API key: encrypt before saving
  const rawKey = document.getElementById('api-key').value.trim();
  let encryptedKey = settings.claudeApiKey;
  if (rawKey) {
    const currentDecrypted = settings.claudeApiKey ? await decryptApiKey(settings.claudeApiKey) : '';
    if (rawKey !== currentDecrypted) {
      encryptedKey = await encryptApiKey(rawKey);
    }
  } else {
    encryptedKey = '';
  }

  // Ranking weights
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
    claudeApiKey: encryptedKey,
    enableAutoCategories: document.getElementById('enable-categories').checked,
    enableAiSummaries: document.getElementById('enable-summaries').checked,
    rankingEnabled: document.getElementById('enable-ranking').checked,
    syncEnabled: document.getElementById('enable-sync').checked,
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
      else resolve(response);
    });
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
