# AI Bookmarks — Chrome Extension (MV3)

AI-powered bookmark manager: when you bookmark a page, the extension analyzes it with the Claude API, creates a matching topic folder, files the bookmark, writes a 2–3 sentence summary, tags it, and ranks it by how actively you use the site. Includes quick search, cross-browser sync, and shareable curated collections (PLG loop).

**עברית:** מנהל סימניות מבוסס AI — שמירת דף מפעילה ניתוח AI שמתייק את הסימנייה לתיקייה הנכונה, מייצר תקציר, מתייג ומדרג לפי פעילות. כולל חיפוש מהיר, סנכרון בין דפדפנים ושיתוף אוספים.

## Install (developer mode)

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this `extension/` folder.
3. The options page opens automatically — paste your Claude API key (`sk-ant-…` from [console.anthropic.com](https://console.anthropic.com)) and click **Test**, then **Save Settings**.
4. Bookmark any page (Ctrl+D / ⌘D or right-click → *Save with AI Bookmarks*) and open the extension popup to see it categorized, summarized, and ranked.

## Run tests

Requires Node.js 20+ (uses the built-in `node:test` runner; no dependencies to install).

```bash
cd extension
npm test
```

The suite covers URL normalization, HTML escaping/highlighting, AES-GCM API-key encryption roundtrip, storage schema (LRU eviction, pending queue, visit log, move-loop prevention), the ranking formula, AI response parsing (clean JSON, fenced JSON, embedded JSON, sparse responses), retry classification (401 never retried, 5xx retried), and categorization/folder logic — with a full in-memory `chrome.*` mock in `tests/setup/chrome-mock.js`.

## Localization

UI languages: **English** (`en`, default), **עברית** (`he`, full RTL layout), **简体中文** (`zh_CN`), **繁體中文** (`zh_TW`). The UI language follows the browser's language (`chrome.i18n`). Hebrew/Arabic UIs flip to RTL automatically via `shared/i18n.js`; URLs and API keys stay LTR.

To add a language: copy `_locales/en/messages.json` to `_locales/<code>/messages.json` and translate the `message` values.

## Architecture

| Layer | Files | Role |
|---|---|---|
| Service worker | `background/service-worker.js` | Event hub: bookmark events, visit tracking, alarms, message routing |
| AI pipeline | `background/bookmark-handler.js`, `ai-client.js`, `categorizer.js` | Extract page → Claude call → folder + summary + tags |
| Ranking | `background/ranker.js` | `visits×0.4 + recency-decay×0.3 + AI-relevance×0.2 + shares×0.1` |
| Sync | `background/sync-manager.js`, `firebase-client.js` | Chrome sync (automatic) + Firestore (Firefox / sharing) |
| UI | `popup/`, `options/` | Categorized list, search, share modal; settings, export/import |
| Shared | `shared/` | Storage schema (sync+local two-tier), crypto utils, i18n, errors |

## Firebase setup (optional — needed for Firefox sync and collection sharing)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com); enable **Firestore** and **Google** authentication.
2. Paste the web-app config into `FIREBASE_CONFIG` in `shared/constants.js` (this config is a public identifier — security is enforced by Firestore rules).
3. Firestore rules: allow `users/{uid}/**` read/write only when `request.auth.uid == uid`; allow public read on `shared_collections/*`.

## Business docs

Market research, the SaaS business plan targeting $10K MRR, and the AI-agent operations playbook live in [`../docs/`](../docs/) (Hebrew).
