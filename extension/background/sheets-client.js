// Google Sheets backup client.
// Uses chrome.identity.getAuthToken (the user's own Google account) — zero infrastructure.
// One spreadsheet ("AI Bookmarks Backup") acts as a transparent, exportable backup:
// every enriched bookmark is written as a row the user can open, filter, and share.

import {
  SHEETS_API_BASE,
  DRIVE_API_BASE,
  BACKUP_SPREADSHEET_TITLE,
  BACKUP_SHEET_HEADER,
} from '../shared/constants.js';
import { getSettings, updateSettings, getBookmarkIndex, getSummary } from '../shared/storage-schema.js';
import { AiBookmarksError, ERROR_CODES, logError } from '../shared/error-handler.js';

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getGoogleToken(interactive = false) {
  try {
    const result = await chrome.identity.getAuthToken({ interactive });
    const token = typeof result === 'string' ? result : result?.token;
    if (!token) throw new Error('No token returned');
    return token;
  } catch (err) {
    throw new AiBookmarksError(
      `Google sign-in failed: ${err.message}. ` +
        'Check that the oauth2 client_id in manifest.json is configured (see README).',
      ERROR_CODES.SYNC_AUTH
    );
  }
}

async function sheetsRequest(method, path, body = null, token) {
  const response = await fetch(`${SHEETS_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new AiBookmarksError(
      `Sheets API error ${response.status}: ${err?.error?.message || response.statusText}`,
      response.status === 401 ? ERROR_CODES.SYNC_AUTH : ERROR_CODES.SYNC_NETWORK
    );
  }
  return response.json();
}

// ─── Spreadsheet lifecycle ────────────────────────────────────────────────────

/**
 * Finds the backup spreadsheet (by stored ID, or by name in Drive) or creates it.
 * Returns the spreadsheetId.
 */
export async function ensureSpreadsheet(interactive = false) {
  const settings = await getSettings();
  const token = await getGoogleToken(interactive);

  // 1. Try the stored ID
  if (settings.spreadsheetId) {
    try {
      await sheetsRequest('GET', `/${settings.spreadsheetId}?fields=spreadsheetId`, null, token);
      return settings.spreadsheetId;
    } catch {
      // Deleted or inaccessible — fall through and recreate
    }
  }

  // 2. Search Drive for an existing backup sheet
  const query = encodeURIComponent(
    `name='${BACKUP_SPREADSHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
  );
  const searchResp = await fetch(`${DRIVE_API_BASE}?q=${query}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (searchResp.ok) {
    const { files } = await searchResp.json();
    if (files?.length) {
      await updateSettings({ spreadsheetId: files[0].id });
      return files[0].id;
    }
  }

  // 3. Create a new spreadsheet with a header row
  const created = await sheetsRequest(
    'POST',
    '',
    {
      properties: { title: BACKUP_SPREADSHEET_TITLE },
      sheets: [{ properties: { title: 'Bookmarks' } }],
    },
    token
  );

  const spreadsheetId = created.spreadsheetId;
  await writeRows(spreadsheetId, 'Bookmarks!A1', [BACKUP_SHEET_HEADER], token);
  await updateSettings({ spreadsheetId });
  return spreadsheetId;
}

// ─── Backup ───────────────────────────────────────────────────────────────────

/**
 * Full backup: rewrites the entire sheet from the current bookmark index.
 * Idempotent — safe to call repeatedly (daily alarm + after enrichment bursts).
 */
export async function backupAllBookmarks(interactive = false) {
  const settings = await getSettings();
  if (!settings.sheetsBackupEnabled && !interactive) return { skipped: true };

  const spreadsheetId = await ensureSpreadsheet(interactive);
  const token = await getGoogleToken(false);

  const index = await getBookmarkIndex();
  const entries = Object.values(index).sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));

  const rows = [BACKUP_SHEET_HEADER];
  for (const e of entries) {
    const summary = e.summaryRef ? (await getSummary(e.id))?.summary || '' : '';
    rows.push([
      e.title || '',
      e.url || '',
      await categoryName(e.categoryId, settings),
      (e.tags || []).join(', '),
      summary,
      String(e.rankScore ?? 0),
      String(e.visitCount ?? 0),
      e.createdAt ? new Date(e.createdAt).toISOString().slice(0, 10) : '',
      e.aiStatus || '',
    ]);
  }

  // Clear then rewrite (simplest consistent full-backup strategy)
  await sheetsRequest('POST', `/${spreadsheetId}/values/Bookmarks!A:I:clear`, {}, token);
  await writeRows(spreadsheetId, 'Bookmarks!A1', rows, token);

  await updateSettings({ lastBackupTimestamp: Date.now(), sheetsBackupEnabled: true });
  return { spreadsheetId, rowCount: rows.length - 1, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` };
}

async function writeRows(spreadsheetId, range, values, token) {
  return sheetsRequest(
    'PUT',
    `/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    { values },
    token
  );
}

async function categoryName(categoryId, settings) {
  if (!categoryId) return '';
  return settings.categories.find((c) => c.id === categoryId)?.name || '';
}

/**
 * Debounced auto-backup trigger, called after AI enrichment completes.
 * Uses an alarm so it survives service-worker dormancy.
 */
export async function scheduleAutoBackup() {
  const settings = await getSettings();
  if (!settings.sheetsBackupEnabled) return;
  // Fire in 2 minutes; repeated calls just reset the timer (batching bursts)
  chrome.alarms.create('sheets_backup_debounce', { delayInMinutes: 2 });
}

export async function runAutoBackup() {
  try {
    await backupAllBookmarks(false);
    console.log('[AI Bookmarks] Auto-backup to Google Sheets complete');
  } catch (err) {
    logError('runAutoBackup', err);
  }
}
