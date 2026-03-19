// Cross-browser sync coordinator.
// Layer 1: chrome.storage.sync handles Chrome↔Chrome/Edge automatically.
// Layer 2: Firebase Firestore handles Chrome↔Firefox and explicit sync.

import { getSettings, updateSettings, getBookmarkIndex, saveBookmarkIndex, upsertBookmark } from '../shared/storage-schema.js';
import { pushBookmark, pullBookmarks, deleteBookmarkRemote } from './firebase-client.js';
import { logError } from '../shared/error-handler.js';
import { sleep } from '../shared/utils.js';

// Debounce queue for outgoing Firestore writes
const pendingPushes = new Map(); // bookmarkId → entry
let pushTimer = null;
const PUSH_DEBOUNCE_MS = 5000;

/**
 * Main sync entry point. Called by the periodic alarm and on demand.
 */
export async function syncWithFirebase() {
  const settings = await getSettings();
  if (!settings.syncEnabled || !settings.firebaseToken || !settings.firebaseUid) {
    return;
  }

  try {
    await pullFromFirebase(settings);
    await flushPendingPushes(settings);
    await updateSettings({ lastSyncTimestamp: Date.now() });
    console.log('[AI Bookmarks] Sync complete');
  } catch (err) {
    logError('syncWithFirebase', err);
  }
}

/**
 * Queues a bookmark for Firestore upload (debounced to batch rapid changes).
 */
export async function queuePush(entry) {
  const settings = await getSettings();
  if (!settings.syncEnabled || !settings.firebaseToken) return;

  pendingPushes.set(entry.id, entry);

  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    flushPendingPushes(settings).catch((err) => logError('queuePush flush', err));
  }, PUSH_DEBOUNCE_MS);
}

// ─── Pull (remote → local) ────────────────────────────────────────────────────

async function pullFromFirebase(settings) {
  const sinceTimestamp = settings.lastSyncTimestamp || 0;
  const remoteEntries = await pullBookmarks(settings.firebaseUid, sinceTimestamp);

  if (remoteEntries.length === 0) return;

  const localIndex = await getBookmarkIndex();
  let changed = false;

  for (const remote of remoteEntries) {
    if (remote._deleted) {
      if (localIndex[remote.id]) {
        delete localIndex[remote.id];
        changed = true;
      }
      continue;
    }

    const local = localIndex[remote.id];
    const remoteNewer = !local || (remote._updatedAt || 0) > (local._updatedAt || local.createdAt || 0);

    if (remoteNewer) {
      localIndex[remote.id] = { ...remote };
      changed = true;
    }
  }

  if (changed) {
    await saveBookmarkIndex(localIndex);
  }
}

// ─── Push (local → remote) ────────────────────────────────────────────────────

async function flushPendingPushes(settings) {
  if (pendingPushes.size === 0) return;

  const entries = Array.from(pendingPushes.values());
  pendingPushes.clear();
  pushTimer = null;

  for (const entry of entries) {
    try {
      await pushBookmark(settings.firebaseUid, entry);
      await sleep(100); // Small delay to avoid rate limits
    } catch (err) {
      logError(`Push bookmark ${entry.id}`, err);
      // Re-queue on failure
      pendingPushes.set(entry.id, entry);
    }
  }
}

/**
 * Sync categories (merged union).
 * Called when settings change to keep categories consistent across browsers.
 */
export async function syncCategories() {
  const settings = await getSettings();
  if (!settings.syncEnabled || !settings.firebaseToken) return;

  // Categories are stored in chrome.storage.sync which handles Chrome↔Chrome sync.
  // For Firefox, we would push categories to a Firestore document.
  // This is a no-op for now since the main bookmark sync covers the critical path.
  // Full implementation would read remote categories and merge (union) with local.
}
