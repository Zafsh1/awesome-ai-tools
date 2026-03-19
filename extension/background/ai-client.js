// Claude API client with retry logic, rate limiting, and key decryption.

import {
  CLAUDE_API_URL,
  CLAUDE_MODEL,
  CLAUDE_API_VERSION,
  AI_MAX_RETRIES,
  AI_RETRY_DELAYS_MS,
  MAX_EXTRACTED_TEXT_LENGTH,
} from '../shared/constants.js';
import { getSettings } from '../shared/storage-schema.js';
import { decryptApiKey, sleep, truncate } from '../shared/utils.js';
import { AiBookmarksError, ERROR_CODES, httpStatusToErrorCode, isRetryable, logError } from '../shared/error-handler.js';

// Simple in-memory rate limiter (requests per minute)
const rateLimiter = {
  requests: [],
  maxPerMinute: 50,
  isLimited() {
    const now = Date.now();
    this.requests = this.requests.filter((t) => now - t < 60000);
    return this.requests.length >= this.maxPerMinute;
  },
  record() {
    this.requests.push(Date.now());
  },
};

/**
 * Calls Claude API to produce a summary + categorization for a bookmark.
 * Returns parsed JSON result.
 *
 * @param {{ url: string, title: string, extractedText: string, description: string, categories: import('../shared/constants.js').Category[] }} params
 * @returns {Promise<{ summary: string, category: string, tags: string[], isNewCategory: boolean, categoryColor: string, model: string }>}
 */
export async function enrichBookmark({ url, title, extractedText, description, categories }) {
  const settings = await getSettings();

  if (!settings.claudeApiKey) {
    throw new AiBookmarksError('No API key configured', ERROR_CODES.API_NO_KEY);
  }

  const apiKey = await decryptApiKey(settings.claudeApiKey);
  if (!apiKey) {
    throw new AiBookmarksError('Could not decrypt API key', ERROR_CODES.API_AUTH);
  }

  const prompt = buildPrompt({ url, title, extractedText, description, categories });

  return callClaudeWithRetry(apiKey, prompt);
}

/**
 * Makes a raw call to Claude. Used by options page to validate API key.
 */
export async function testApiKey(apiKey) {
  const prompt = buildPrompt({
    url: 'https://example.com',
    title: 'Test',
    extractedText: 'This is a test page.',
    description: '',
    categories: [],
  });
  await callClaudeWithRetry(apiKey, prompt, 1);
  return true;
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildPrompt({ url, title, extractedText, description, categories }) {
  const categoryNames = categories.map((c) => c.name).join(', ') || 'none yet';
  const content = truncate(extractedText || description || '', MAX_EXTRACTED_TEXT_LENGTH);

  return {
    system:
      'You are a bookmark assistant. Your job is to analyze webpages and categorize them. ' +
      'Always respond with valid JSON only — no markdown, no explanation, just the JSON object.',
    userMessage:
      `Analyze this webpage and respond with a JSON object only:\n\n` +
      `URL: ${url}\n` +
      `Title: ${title}\n` +
      `Content: ${content}\n\n` +
      `Existing categories: ${categoryNames}\n\n` +
      `Respond with exactly this JSON structure:\n` +
      `{\n` +
      `  "summary": "2-3 sentence summary of the page",\n` +
      `  "category": "best matching category name, or a new concise name if none fit",\n` +
      `  "tags": ["tag1", "tag2", "tag3"],\n` +
      `  "isNewCategory": true or false,\n` +
      `  "categoryColor": "#hexcode only if isNewCategory is true, else null"\n` +
      `}`,
  };
}

// ─── API Call with Retry ──────────────────────────────────────────────────────

async function callClaudeWithRetry(apiKey, prompt, maxRetries = AI_MAX_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Rate limiting
    if (rateLimiter.isLimited()) {
      await sleep(2000);
    }

    try {
      const result = await callClaude(apiKey, prompt);
      return result;
    } catch (err) {
      lastError = err;
      logError(`Claude API attempt ${attempt + 1}`, err);

      if (!isRetryable(err) || attempt === maxRetries) break;

      const delay = AI_RETRY_DELAYS_MS[attempt] || 4000;
      await sleep(delay);
    }
  }

  throw lastError;
}

async function callClaude(apiKey, { system, userMessage }) {
  rateLimiter.record();

  let response;
  try {
    response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'anthropic-version': CLAUDE_API_VERSION,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        temperature: 0.2,
        system,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
  } catch (networkErr) {
    throw new AiBookmarksError(`Network error: ${networkErr.message}`, ERROR_CODES.API_NETWORK);
  }

  if (!response.ok) {
    const errorCode = httpStatusToErrorCode(response.status);
    let body;
    try {
      body = await response.json();
    } catch {}
    throw new AiBookmarksError(
      `Claude API error ${response.status}: ${body?.error?.message || response.statusText}`,
      errorCode,
      { status: response.status, body }
    );
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new AiBookmarksError('Failed to parse Claude API response', ERROR_CODES.API_PARSE);
  }

  const text = data?.content?.[0]?.text;
  if (!text) {
    throw new AiBookmarksError('Empty response from Claude API', ERROR_CODES.API_PARSE);
  }

  return parseAiResponse(text, data.model || CLAUDE_MODEL);
}

// ─── Response Parsing ─────────────────────────────────────────────────────────

function parseAiResponse(text, model) {
  // Strip potential markdown code fences
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object from the text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        throw new AiBookmarksError(`Cannot parse AI response as JSON: ${text.slice(0, 200)}`, ERROR_CODES.API_PARSE);
      }
    } else {
      throw new AiBookmarksError(`No JSON found in AI response: ${text.slice(0, 200)}`, ERROR_CODES.API_PARSE);
    }
  }

  return {
    summary: String(parsed.summary || '').trim(),
    category: String(parsed.category || 'Uncategorized').trim(),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    isNewCategory: Boolean(parsed.isNewCategory),
    categoryColor: parsed.categoryColor || null,
    model,
  };
}
