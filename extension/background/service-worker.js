// Main service worker — event hub for the AI Bookmarks extension.
// MV3 service workers are ephemeral; ALL state is persisted to storage immediately.

import { ACTIONS, CONTEXT_MENU, QUEUE_PROCESS_ALARM, RANKING_RECALC_ALARM, SYNC_ALARM } from '../shared/constants.js';
import { handleBookmarkCreated, handleBookmarkRemoved, handleBookmarkChanged } from './bookmark-handler.js';
import { processQueue } from './bookmark-handler.js';
import { recalculateAllRanks } from './ranker.js';
import { syncWithFirebase } from './sync-manager.js';
import { recordVisit } from '../shared/storage-schema.js';
import { getSettings } from '../shared/storage-schema.js';
import { logError } from '../shared/error-handler.js';

// ─── Installation ─────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    console.log('[AI Bookmarks] Extension installed');
    await setupContextMenus();
    await setupAlarms();
    // Open options page on first install so user can enter API key
    chrome.runtime.openOptionsPage();
  } else if (reason === 'update') {
    console.log('[AI Bookmarks] Extension updated');
    await setupAlarms();
  }
});

// ─── Context Menus ────────────────────────────────────────────────────────────

async function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU.BOOKMARK_PAGE,
      title: 'Save with AI Bookmarks',
      contexts: ['page'],
    });
  });
}

// ─── Alarms (keep service worker alive for periodic work) ─────────────────────

async function setupAlarms() {
  // Process AI queue every 2 minutes if needed
  chrome.alarms.create(QUEUE_PROCESS_ALARM, { periodInMinutes: 2 });
  // Recalculate ranking scores daily
  chrome.alarms.create(RANKING_RECALC_ALARM, { periodInMinutes: 60 * 24 });
  // Firebase sync every 5 minutes
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
}

chrome.alarms.onAlarm.addListener(async ({ name }) => {
  try {
    if (name === QUEUE_PROCESS_ALARM) {
      await processQueue();
    } else if (name === RANKING_RECALC_ALARM) {
      await recalculateAllRanks();
    } else if (name === SYNC_ALARM) {
      const settings = await getSettings();
      if (settings.syncEnabled && settings.firebaseToken) {
        await syncWithFirebase();
      }
    }
  } catch (err) {
    logError(`Alarm ${name}`, err);
  }
});

// ─── Bookmark Events ──────────────────────────────────────────────────────────

chrome.bookmarks.onCreated.addListener(async (id, bookmarkInfo) => {
  // Folders have no URL; skip them
  if (!bookmarkInfo.url) return;
  try {
    await handleBookmarkCreated(id, bookmarkInfo);
  } catch (err) {
    logError('bookmarks.onCreated', err);
  }
});

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  try {
    await handleBookmarkRemoved(id, removeInfo);
  } catch (err) {
    logError('bookmarks.onRemoved', err);
  }
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  try {
    await handleBookmarkChanged(id, changeInfo);
  } catch (err) {
    logError('bookmarks.onChanged', err);
  }
});

// ─── Tab Visit Tracking (for ranking) ─────────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;
  try {
    await recordVisit(tab.url);
    // Bump rank score for bookmarks matching this URL (async, non-blocking)
    await bumpRankForUrl(tab.url);
  } catch (err) {
    logError('tabs.onUpdated', err);
  }
});

async function bumpRankForUrl(url) {
  const { getBookmarkIndex, saveBookmarkIndex } = await import('../shared/storage-schema.js');
  const { computeRankScore } = await import('./ranker.js');
  const index = await getBookmarkIndex();
  let changed = false;

  for (const [id, entry] of Object.entries(index)) {
    if (entry.url === url || entry.url === url + '/') {
      entry.visitCount = (entry.visitCount || 0) + 1;
      entry.lastVisited = Date.now();
      entry.rankScore = await computeRankScore(entry);
      changed = true;
    }
  }

  if (changed) await saveBookmarkIndex(index);
}

// ─── Context Menu Clicks ──────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === CONTEXT_MENU.BOOKMARK_PAGE && tab?.url) {
    try {
      // Create a bookmark for the current page via the bookmarks API
      await chrome.bookmarks.create({ title: tab.title || tab.url, url: tab.url });
      // The onCreated listener will handle AI enrichment
    } catch (err) {
      logError('contextMenu.BOOKMARK_PAGE', err);
    }
  }
});

// ─── Message Routing ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => {
      logError(`Message ${message?.action}`, err);
      sendResponse({ error: err.message });
    });
  return true; // Keep message channel open for async response
});

async function handleMessage(message, sender) {
  const { action, payload } = message;

  switch (action) {
    case ACTIONS.GET_BOOKMARKS: {
      const { getBookmarkIndex } = await import('../shared/storage-schema.js');
      return getBookmarkIndex();
    }

    case ACTIONS.GET_SETTINGS: {
      const { getSettings } = await import('../shared/storage-schema.js');
      return getSettings();
    }

    case ACTIONS.SAVE_SETTINGS: {
      const { saveSettings } = await import('../shared/storage-schema.js');
      await saveSettings(payload);
      return { ok: true };
    }

    case ACTIONS.RETRY_AI: {
      const { enqueuePending, getBookmarkByChromeId } = await import('../shared/storage-schema.js');
      const { upsertBookmark } = await import('../shared/storage-schema.js');
      const entry = await getBookmarkByChromeId(payload.chromeBookmarkId);
      if (entry) {
        entry.aiStatus = 'pending';
        await upsertBookmark(entry);
        await enqueuePending({ bookmarkId: entry.id, url: entry.url, title: entry.title });
        await processQueue();
      }
      return { ok: true };
    }

    case ACTIONS.SHARE_COLLECTION: {
      const { shareCollection } = await import('./firebase-client.js');
      return shareCollection(payload);
    }

    case ACTIONS.SYNC_NOW: {
      await syncWithFirebase();
      return { ok: true };
    }

    case ACTIONS.DELETE_BOOKMARK: {
      const { deleteBookmark } = await import('../shared/storage-schema.js');
      await deleteBookmark(payload.bookmarkId);
      return { ok: true };
    }

    default:
      return { error: `Unknown action: ${action}` };
  }
}
