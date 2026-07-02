// Share modal: create a shareable collection link via Firebase.

import { ACTIONS } from '../../shared/constants.js';
import { t } from '../../shared/i18n.js';

let _currentEntries = [];
let _initialized = false;

/**
 * Prepares the share modal with the given bookmarks.
 */
export function initShareModal({ entries, categoryId, categories }) {
  _currentEntries = entries;

  const catName = categoryId
    ? categories.find((c) => c.id === categoryId)?.name || 'My Collection'
    : 'My Collection';

  document.getElementById('share-name').value = catName;
  document.getElementById('share-desc').value = '';
  document.getElementById('share-result').classList.add('hidden');

  if (!_initialized) {
    _initialized = true;
    setupModalListeners();
  }
}

function setupModalListeners() {
  const modal = document.getElementById('share-modal');

  // Close buttons
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-share').addEventListener('click', closeModal);

  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Confirm share
  document.getElementById('btn-confirm-share').addEventListener('click', handleShare);

  // Copy link
  document.getElementById('btn-copy-link').addEventListener('click', () => {
    const input = document.getElementById('share-link-input');
    input.select();
    navigator.clipboard.writeText(input.value).catch(() => document.execCommand('copy'));
    document.getElementById('btn-copy-link').textContent = t('copied') || 'Copied!';
    setTimeout(() => { document.getElementById('btn-copy-link').textContent = t('copy') || 'Copy'; }, 2000);
  });
}

async function handleShare() {
  const btn = document.getElementById('btn-confirm-share');
  btn.disabled = true;
  btn.textContent = 'Sharing…';

  try {
    const name = document.getElementById('share-name').value.trim() || 'My Collection';
    const description = document.getElementById('share-desc').value.trim();
    const visibility = document.querySelector('input[name="visibility"]:checked')?.value || 'link';

    // Strip personal data — only share public-safe fields
    const bookmarksPayload = _currentEntries.slice(0, 100).map((e) => ({
      url: e.url,
      title: e.title,
      summary: e.summary || '',
      tags: e.tags || [],
    }));

    const result = await sendMessage({
      action: ACTIONS.SHARE_COLLECTION,
      payload: { name, description, visibility, bookmarks: bookmarksPayload },
    });

    if (result.shareUrl) {
      document.getElementById('share-link-input').value = result.shareUrl;
      document.getElementById('share-result').classList.remove('hidden');
    } else {
      alert('Sharing requires Firebase sync to be configured. Enable it in Settings first.');
      closeModal();
    }
  } catch (err) {
    alert(`Share failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = t('share') || 'Share';
  }
}

function closeModal() {
  document.getElementById('share-modal').classList.add('hidden');
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}
