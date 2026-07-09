// Shared constants used across all extension contexts

// ─── AI Providers ─────────────────────────────────────────────────────────────
// OpenRouter is the default: one key, many models, several completely free.
// Anthropic direct is available as a premium option.

export const PROVIDERS = {
  OPENROUTER: 'openrouter',
  ANTHROPIC: 'anthropic',
};

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_API_VERSION = '2023-06-01';

// Curated model presets shown in the options dropdown.
// OpenRouter ":free" models cost nothing (rate-limited but plenty for bookmarks).
export const MODEL_PRESETS = {
  [PROVIDERS.OPENROUTER]: [
    { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash — FREE', free: true },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B — FREE', free: true },
    { id: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen 2.5 72B — FREE', free: true },
    { id: 'deepseek/deepseek-chat:free', label: 'DeepSeek V3 — FREE', free: true },
    { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3 (paid, very cheap)', free: false },
    { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5 (paid)', free: false },
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (paid, best)', free: false },
  ],
  [PROVIDERS.ANTHROPIC]: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast, cheap)', free: false },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (best)', free: false },
  ],
};

export const DEFAULT_PROVIDER = PROVIDERS.OPENROUTER;
export const DEFAULT_MODEL = 'google/gemini-2.0-flash-exp:free';

// API key prefixes per provider (for validation + UX hints)
export const KEY_PREFIXES = {
  [PROVIDERS.OPENROUTER]: 'sk-or-',
  [PROVIDERS.ANTHROPIC]: 'sk-ant-',
};

// ─── Google Sheets Backup ─────────────────────────────────────────────────────

export const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
export const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
export const BACKUP_SPREADSHEET_TITLE = 'AI Bookmarks Backup';
export const BACKUP_SHEET_HEADER = [
  'Title', 'URL', 'Category', 'Tags', 'Summary', 'Rank', 'Visits', 'Created', 'AI Status',
];

// ─── Storage keys ─────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  SETTINGS: 'settings',
  BOOKMARK_INDEX: 'bookmark_index',
  PENDING_QUEUE: 'pending_queue',
  VISIT_LOG: 'visit_log',
  IMPORT_PROGRESS: 'import_progress',
};

export const SUMMARY_KEY_PREFIX = 'summary_';

// ─── Ranking ──────────────────────────────────────────────────────────────────

export const RANK_WEIGHTS = {
  VISIT_COUNT: 0.4,
  RECENCY: 0.3,
  AI_RELEVANCE: 0.2,
  SHARE_COUNT: 0.1,
};

// Recency decay lambda (half-life ~7 days)
export const RECENCY_LAMBDA = 0.1;

// ─── Limits ───────────────────────────────────────────────────────────────────

export const MAX_BOOKMARK_INDEX_SIZE = 500;
export const MAX_EXTRACTED_TEXT_LENGTH = 4000;
export const MAX_CATEGORIES = 50;
export const MAX_VISIT_LOG_ENTRIES = 1000;
export const BOOKMARK_LRU_EVICT_COUNT = 50;

// ─── AI pipeline ──────────────────────────────────────────────────────────────

export const AI_MAX_RETRIES = 3;
export const AI_RETRY_DELAYS_MS = [1000, 2000, 4000];
export const CONTENT_EXTRACT_TIMEOUT_MS = 2000;
export const QUEUE_PROCESS_ALARM = 'process_queue';
export const RANKING_RECALC_ALARM = 'ranking_recalc';
export const BACKUP_ALARM = 'sheets_backup';

// Loop prevention TTL (ms): ignore bookmark events for IDs we just moved
export const MOVE_TTL_MS = 500;

// ─── Message actions (runtime messaging between contexts) ────────────────────

export const ACTIONS = {
  EXTRACT_CONTENT: 'EXTRACT_CONTENT',
  BOOKMARK_ENRICHED: 'BOOKMARK_ENRICHED',
  BOOKMARK_PENDING: 'BOOKMARK_PENDING',
  GET_BOOKMARKS: 'GET_BOOKMARKS',
  GET_SETTINGS: 'GET_SETTINGS',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  RETRY_AI: 'RETRY_AI',
  DELETE_BOOKMARK: 'DELETE_BOOKMARK',
  IMPORT_EXISTING: 'IMPORT_EXISTING',
  GET_IMPORT_PROGRESS: 'GET_IMPORT_PROGRESS',
  BACKUP_TO_SHEETS: 'BACKUP_TO_SHEETS',
  GET_BACKUP_STATUS: 'GET_BACKUP_STATUS',
};

// ─── Default settings ─────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS = {
  provider: DEFAULT_PROVIDER,
  model: DEFAULT_MODEL,
  apiKey: '',                       // encrypted at rest
  enableAutoCategories: true,
  enableAiSummaries: true,
  rankingEnabled: true,
  theme: 'auto',                    // 'auto' | 'light' | 'dark'
  sheetsBackupEnabled: false,
  spreadsheetId: null,
  lastBackupTimestamp: 0,
  categories: [
    { id: 'cat_tech', name: 'Technology', color: '#6366f1', icon: 'code' },
    { id: 'cat_research', name: 'Research', color: '#10b981', icon: 'book' },
    { id: 'cat_design', name: 'Design', color: '#f59e0b', icon: 'palette' },
    { id: 'cat_news', name: 'News', color: '#ef4444', icon: 'newspaper' },
    { id: 'cat_tools', name: 'Tools', color: '#8b5cf6', icon: 'wrench' },
  ],
  rankWeights: { ...RANK_WEIGHTS },
};

// ─── Context menu item IDs ────────────────────────────────────────────────────

export const CONTEXT_MENU = {
  BOOKMARK_PAGE: 'ai_bookmark_page',
};
