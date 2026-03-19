// Firebase REST API wrapper for Firestore and Auth.
// Uses REST API directly — no Firebase SDK bundled — to keep extension size small.

import { FIREBASE_CONFIG, FIRESTORE_BASE_URL, FIREBASE_AUTH_URL, SHARE_BASE_URL } from '../shared/constants.js';
import { getSettings, updateSettings } from '../shared/storage-schema.js';
import { generateId, sleep } from '../shared/utils.js';
import { AiBookmarksError, ERROR_CODES, logError } from '../shared/error-handler.js';

// ─── Authentication ───────────────────────────────────────────────────────────

/**
 * Signs in with a Google ID token via Firebase Auth REST API.
 * @param {string} googleIdToken - obtained via chrome.identity
 * @returns {Promise<{ uid: string, idToken: string, refreshToken: string }>}
 */
export async function signInWithGoogle(googleIdToken) {
  const url = `${FIREBASE_AUTH_URL}/accounts:signInWithIdp?key=${FIREBASE_CONFIG.apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestUri: 'http://localhost',
      postBody: `id_token=${googleIdToken}&providerId=google.com`,
      returnSecureToken: true,
      returnIdpCredential: true,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new AiBookmarksError(`Firebase auth failed: ${err?.error?.message}`, ERROR_CODES.SYNC_AUTH);
  }

  const data = await response.json();
  return {
    uid: data.localId,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + (parseInt(data.expiresIn, 10) || 3600) * 1000,
  };
}

/**
 * Refreshes an expired Firebase ID token.
 */
export async function refreshToken(refreshTokenValue) {
  const url = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshTokenValue)}`,
  });

  if (!response.ok) {
    throw new AiBookmarksError('Token refresh failed', ERROR_CODES.SYNC_AUTH);
  }

  const data = await response.json();
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + parseInt(data.expires_in, 10) * 1000,
  };
}

// ─── Firestore Helpers ────────────────────────────────────────────────────────

async function getAuthToken() {
  const settings = await getSettings();
  if (!settings.firebaseToken) throw new AiBookmarksError('Not authenticated', ERROR_CODES.SYNC_AUTH);

  // Refresh token if needed (buffer 5 minutes)
  if (settings.tokenExpiresAt && Date.now() > settings.tokenExpiresAt - 5 * 60 * 1000) {
    try {
      const refreshed = await refreshToken(settings.firebaseRefreshToken);
      await updateSettings({
        firebaseToken: refreshed.idToken,
        firebaseRefreshToken: refreshed.refreshToken,
        tokenExpiresAt: refreshed.expiresAt,
      });
      return refreshed.idToken;
    } catch {
      // If refresh fails, try with existing token
    }
  }

  return settings.firebaseToken;
}

async function firestoreRequest(method, path, body = null) {
  const token = await getAuthToken();
  const url = `${FIRESTORE_BASE_URL}/${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const code = response.status === 401 ? ERROR_CODES.SYNC_AUTH : ERROR_CODES.SYNC_NETWORK;
    throw new AiBookmarksError(`Firestore error ${response.status}: ${err?.error?.message}`, code);
  }

  if (response.status === 204) return null;
  return response.json();
}

// ─── Bookmark Sync ────────────────────────────────────────────────────────────

/**
 * Pushes a single bookmark to Firestore.
 */
export async function pushBookmark(uid, entry) {
  const docPath = `users/${uid}/bookmarks/${entry.id}`;
  const fields = entryToFirestoreFields(entry);
  return firestoreRequest('PATCH', `${docPath}?updateMask.fieldPaths=*`, { fields });
}

/**
 * Pulls all bookmarks modified after `sinceTimestamp`.
 */
export async function pullBookmarks(uid, sinceTimestamp) {
  const path = `users/${uid}/bookmarks`;
  const query = `?orderBy=updatedAt&startAt=${sinceTimestamp}`;
  try {
    const data = await firestoreRequest('GET', path + query);
    return (data?.documents || []).map(firestoreDocToEntry);
  } catch {
    return [];
  }
}

/**
 * Deletes a bookmark from Firestore (tombstone approach: set deleted=true).
 */
export async function deleteBookmarkRemote(uid, bookmarkId) {
  const docPath = `users/${uid}/bookmarks/${bookmarkId}`;
  return firestoreRequest('PATCH', docPath, {
    fields: {
      deleted: { booleanValue: true },
      updatedAt: { integerValue: String(Date.now()) },
    },
  });
}

// ─── Collection Sharing ───────────────────────────────────────────────────────

/**
 * Creates a shareable collection in Firestore.
 * @param {{ name: string, description: string, visibility: string, bookmarks: Object[] }} payload
 * @returns {Promise<{ shareId: string, shareUrl: string }>}
 */
export async function shareCollection(payload) {
  const shareId = generateId('share');
  const docPath = `shared_collections/${shareId}`;

  const settings = await getSettings();

  await firestoreRequest('PATCH', docPath, {
    fields: {
      ownerId: { stringValue: settings.firebaseUid || 'anonymous' },
      name: { stringValue: payload.name || 'My Collection' },
      description: { stringValue: payload.description || '' },
      visibility: { stringValue: payload.visibility || 'link' },
      bookmarks: {
        arrayValue: {
          values: payload.bookmarks.map((bm) => ({
            mapValue: {
              fields: {
                url: { stringValue: bm.url },
                title: { stringValue: bm.title },
                summary: { stringValue: bm.summary || '' },
                tags: { arrayValue: { values: (bm.tags || []).map((t) => ({ stringValue: t })) } },
              },
            },
          })),
        },
      },
      createdAt: { integerValue: String(Date.now()) },
      viewCount: { integerValue: '0' },
      cloneCount: { integerValue: '0' },
    },
  });

  return { shareId, shareUrl: `${SHARE_BASE_URL}/${shareId}` };
}

// ─── Firestore Data Conversion ────────────────────────────────────────────────

function entryToFirestoreFields(entry) {
  return {
    id: { stringValue: entry.id },
    chromeBookmarkId: { stringValue: entry.chromeBookmarkId || '' },
    url: { stringValue: entry.url },
    title: { stringValue: entry.title },
    categoryId: { stringValue: entry.categoryId || '' },
    tags: { arrayValue: { values: (entry.tags || []).map((t) => ({ stringValue: t })) } },
    visitCount: { integerValue: String(entry.visitCount || 0) },
    lastVisited: { integerValue: String(entry.lastVisited || 0) },
    rankScore: { doubleValue: entry.rankScore || 0 },
    createdAt: { integerValue: String(entry.createdAt || Date.now()) },
    aiStatus: { stringValue: entry.aiStatus || 'pending' },
    updatedAt: { integerValue: String(Date.now()) },
    deleted: { booleanValue: false },
  };
}

function firestoreDocToEntry(doc) {
  const f = doc.fields || {};
  const str = (key) => f[key]?.stringValue || '';
  const int = (key) => parseInt(f[key]?.integerValue || '0', 10);
  const arr = (key) => (f[key]?.arrayValue?.values || []).map((v) => v.stringValue || '');

  return {
    id: str('id'),
    chromeBookmarkId: str('chromeBookmarkId'),
    url: str('url'),
    title: str('title'),
    categoryId: str('categoryId') || null,
    tags: arr('tags'),
    visitCount: int('visitCount'),
    lastVisited: int('lastVisited'),
    rankScore: f.rankScore?.doubleValue || 0,
    createdAt: int('createdAt'),
    aiStatus: str('aiStatus') || 'pending',
    summaryRef: null,
    _updatedAt: int('updatedAt'),
    _deleted: f.deleted?.booleanValue || false,
  };
}
