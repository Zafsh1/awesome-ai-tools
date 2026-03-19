// Shared constants used across all extension contexts

export const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
export const CLAUDE_MODEL = 'claude-sonnet-4-6';
export const CLAUDE_API_VERSION = '2023-06-01';

// Storage keys
export const STORAGE_KEYS = {
  SETTINGS: 'settings',
  BOOKMARK_INDEX: 'bookmark_index',
  PENDING_QUEUE: 'pending_queue',
  VISIT_LOG: 'visit_log',
};

export const SUMMARY_KEY_PREFIX = 'summary_';

// Ranking weights
export const RANK_WEIGHTS = {
  VISIT_COUNT: 0.4,
  RECENCY: 0.3,
  AI_RELEVANCE: 0.2,
  SHARE_COUNT: 0.1,
};

// Recency decay lambda (half-life ~7 days)
export const RECENCY_LAMBDA = 0.1;

// Limits
export const MAX_BOOKMARK_INDEX_SIZE = 500;
export const MAX_EXTRACTED_TEXT_LENGTH = 4000;
export const MAX_CATEGORIES = 50;
export const MAX_VISIT_LOG_ENTRIES = 1000;
export const BOOKMARK_LRU_EVICT_COUNT = 50;

// AI pipeline
export const AI_MAX_RETRIES = 3;
export const AI_RETRY_DELAYS_MS = [1000, 2000, 4000];
export const CONTENT_EXTRACT_TIMEOUT_MS = 2000;
export const QUEUE_PROCESS_ALARM = 'process_queue';
export const RANKING_RECALC_ALARM = 'ranking_recalc';
export const SYNC_ALARM = 'firebase_sync';

// Loop prevention TTL (ms): ignore bookmark events for IDs we just moved
export const MOVE_TTL_MS = 500;

// Firebase config (safe to embed — security enforced by Firestore rules + auth)
// Replace with your actual Firebase project config
export const FIREBASE_CONFIG = {
  apiKey: 'YOUR_FIREBASE_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

export const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
export const FIREBASE_AUTH_URL = 'https://identitytoolkit.googleapis.com/v1';

// Sharing
export const SHARE_BASE_URL = 'https://aibookmarks.app/c';

// Message actions (runtime messaging between contexts)
export const ACTIONS = {
  EXTRACT_CONTENT: 'EXTRACT_CONTENT',
  BOOKMARK_ENRICHED: 'BOOKMARK_ENRICHED',
  BOOKMARK_PENDING: 'BOOKMARK_PENDING',
  GET_BOOKMARKS: 'GET_BOOKMARKS',
  GET_SETTINGS: 'GET_SETTINGS',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  RETRY_AI: 'RETRY_AI',
  SHARE_COLLECTION: 'SHARE_COLLECTION',
  SYNC_NOW: 'SYNC_NOW',
  DELETE_BOOKMARK: 'DELETE_BOOKMARK',
};

// Default settings
export const DEFAULT_SETTINGS = {
  claudeApiKey: '',
  enableAutoCategories: true,
  enableAiSummaries: true,
  rankingEnabled: true,
  syncEnabled: false,
  firebaseUid: null,
  firebaseToken: null,
  lastSyncTimestamp: 0,
  categories: [
    { id: 'cat_tech', name: 'Technology', color: '#4A90E2', icon: 'code' },
    { id: 'cat_research', name: 'Research', color: '#7ED321', icon: 'book' },
    { id: 'cat_design', name: 'Design', color: '#F5A623', icon: 'palette' },
    { id: 'cat_news', name: 'News', color: '#D0021B', icon: 'newspaper' },
    { id: 'cat_tools', name: 'Tools', color: '#9B59B6', icon: 'wrench' },
  ],
  rankWeights: { ...RANK_WEIGHTS },
};

// Context menu item IDs
export const CONTEXT_MENU = {
  BOOKMARK_PAGE: 'ai_bookmark_page',
  SHARE_PAGE: 'ai_share_page',
};
