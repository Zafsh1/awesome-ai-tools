// Imports the user's EXISTING bookmarks: scans the whole Chrome bookmark tree,
// indexes every URL not yet known, and queues them for AI enrichment.
// Progress is persisted so the popup/options can show a live counter.

import { STORAGE_KEYS } from '../shared/constants.js';
import {
  getBookmarkIndex,
  saveBookmarkIndex,
  enqueuePending,
} from '../shared/storage-schema.js';
import { generateId, normalizeUrl } from '../shared/utils.js';
import { processQueue } from './bookmark-handler.js';
import { logError } from '../shared/error-handler.js';

/**
 * Scans the full bookmark tree and imports everything not already indexed.
 * Returns { total, queued } counts immediately; AI processing continues
 * in the background via the pending queue.
 */
export async function importExistingBookmarks() {
  const tree = await chrome.bookmarks.getTree();
  const urlNodes = collectUrlNodes(tree);

  const index = await getBookmarkIndex();
  const knownUrls = new Set(Object.values(index).map((e) => e.url));
  const knownChromeIds = new Set(Object.values(index).map((e) => e.chromeBookmarkId));

  let queued = 0;

  for (const node of urlNodes) {
    const url = normalizeUrl(node.url);
    if (knownUrls.has(url) || knownChromeIds.has(node.id)) continue;

    const internalId = generateId('bm');
    index[internalId] = {
      id: internalId,
      chromeBookmarkId: node.id,
      url,
      title: node.title || url,
      categoryId: null,
      tags: [],
      visitCount: 0,
      lastVisited: node.dateAdded || Date.now(),
      rankScore: 0,
      createdAt: node.dateAdded || Date.now(),
      aiStatus: 'pending',
      summaryRef: null,
    };
    knownUrls.add(url);

    await enqueuePending({
      bookmarkId: internalId,
      url,
      title: node.title || url,
      chromeBookmarkId: node.id,
    });
    queued++;
  }

  await saveBookmarkIndex(index);
  await setImportProgress({ total: urlNodes.length, queued, processed: 0, startedAt: Date.now(), done: queued === 0 });

  // Kick off processing (continues via the periodic queue alarm if the worker sleeps)
  processQueue().catch((err) => logError('import processQueue', err));

  return { total: urlNodes.length, queued };
}

function collectUrlNodes(nodes, out = []) {
  for (const node of nodes) {
    if (node.url && /^https?:/i.test(node.url)) out.push(node);
    if (node.children) collectUrlNodes(node.children, out);
  }
  return out;
}

// ─── Progress tracking ────────────────────────────────────────────────────────

export async function getImportProgress() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.IMPORT_PROGRESS);
  return result[STORAGE_KEYS.IMPORT_PROGRESS] || null;
}

export async function setImportProgress(progress) {
  await chrome.storage.local.set({ [STORAGE_KEYS.IMPORT_PROGRESS]: progress });
}

/** Called by the queue processor after each enrichment during an import. */
export async function bumpImportProcessed() {
  const progress = await getImportProgress();
  if (!progress || progress.done) return;
  progress.processed = (progress.processed || 0) + 1;
  if (progress.processed >= progress.queued) progress.done = true;
  await setImportProgress(progress);
}
