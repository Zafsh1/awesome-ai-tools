// Shared constants used across all extension contexts

export const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
export const CLAUDE_MODEL = 'claude-sonnet-4-6';
export const CLAUDE_API_VERSION = '2023-06-01';

// OpenRouter (OpenAI-compatible API, free-tier models)
export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_FREE_MODELS = [
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B Instruct' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
];

// AI providers
export const DEFAULT_PROVIDER = 'openrouter';
export const PROVIDER_OPTIONS = [
  { id: 'openrouter', name: 'OpenRouter (Free)' },
  { id: 'anthropic', name: 'Anthropic (Claude)' },
];

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

// Google Sheets backup
export const BACKUP_ALARM = 'sheets_backup';

// Loop prevention TTL (ms): ignore bookmark events for IDs we just moved
export const MOVE_TTL_MS = 500;

// Firebase was removed in v2 (replaced by Google Sheets sync).
// Historical reference config, kept commented out in case a rollback is ever needed:
// export const FIREBASE_CONFIG = {
//   apiKey: 'YOUR_...EY',
//   authDomain: 'YOUR_PROJECT.firebaseapp.com',
//   projectId: 'YOUR_PROJECT_ID',
//   storageBucket: 'YOUR_PROJECT.appspot.com',
//   messagingSenderId: 'YOUR_SENDER_ID',
//   appId: 'YOUR_APP_ID',
// };

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
  IMPORT_START: 'IMPORT_START',
  IMPORT_PROGRESS: 'IMPORT_PROGRESS',
  IMPORT_CANCEL: 'IMPORT_CANCEL',
  GOOGLE_SHEETS_CONNECT: 'GOOGLE_SHEETS_CONNECT',
  GOOGLE_SHEETS_STATUS: 'GOOGLE_SHEETS_STATUS',
  EXPORT_TO_DRIVE: 'EXPORT_TO_DRIVE',
  GET_IMPORT_STATE: 'GET_IMPORT_STATE',
};

// Default settings
export const DEFAULT_SETTINGS = {
  provider: DEFAULT_PROVIDER,
  claudeApiKey: null,
  openrouterApiKey: null,
  selectedModel: 'qwen/qwen-2.5-72b-instruct',
  enableAutoCategories: true,
  enableAiSummaries: true,
  rankingEnabled: true,
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

// Batch size for AI processing during import
export const AI_BATCH_SIZE = 5;
