// Provider-aware AI client: OpenRouter (default, has free models) or Anthropic direct.
// Handles retry logic, rate limiting, and encrypted key storage.

import {
  PROVIDERS,
  OPENROUTER_API_URL,
  ANTHROPIC_API_URL,
  ANTHROPIC_API_VERSION,
  AI_MAX_RETRIES,
  AI_RETRY_DELAYS_MS,
  MAX_EXTRACTED_TEXT_LENGTH,
  DEFAULT_MODEL,
} from '../shared/constants.js';
import { getSettings } from '../shared/storage-schema.js';
import { decryptApiKey, sleep, truncate } from '../shared/utils.js';
import { AiBookmarksError, ERROR_CODES, httpStatusToErrorCode, isRetryable, logError } from '../shared/error-handler.js';

// Simple in-memory rate limiter (requests per minute).
// Free OpenRouter models allow ~20 req/min, so stay under that.
const rateLimiter = {
  requests: [],
  maxPerMinute: 15,
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
 * Calls the configured AI provider to produce a summary + categorization.
 *
 * @param {{ url: string, title: string, extractedText: string, description: string, categories: Object[] }} params
 * @returns {Promise<{ summary: string, category: string, tags: string[], isNewCategory: boolean, categoryColor: string, model: string }>}
 */
export async function enrichBookmark({ url, title, extractedText, description, categories }) {
  const settings = await getSettings();

  if (!settings.apiKey) {
    throw new AiBookmarksError('No API key configured', ERROR_CODES.API_NO_KEY);
  }

  const apiKey = await decryptApiKey(settings.apiKey);
  if (!apiKey) {
    throw new AiBookmarksError('Could not decrypt API key', ERROR_CODES.API_AUTH);
  }

  const prompt = buildPrompt({ url, title, extractedText, description, categories });
  const provider = settings.provider || PROVIDERS.OPENROUTER;
  const model = settings.model || DEFAULT_MODEL;

  return callWithRetry({ provider, apiKey, model, prompt });
}

/**
 * Validates an API key with a minimal live call. Used by the options page.
 */
export async function testApiKey(provider, apiKey, model) {
  const prompt = buildPrompt({
    url: 'https://example.com',
    title: 'Test',
    extractedText: 'This is a test page.',
    description: '',
    categories: [],
  });
  await callWithRetry({ provider, apiKey, model: model || DEFAULT_MODEL, prompt, maxRetries: 1 });
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

async function callWithRetry({ provider, apiKey, model, prompt, maxRetries = AI_MAX_RETRIES }) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (rateLimiter.isLimited()) {
      await sleep(4000);
    }

    try {
      return provider === PROVIDERS.ANTHROPIC
        ? await callAnthropic(apiKey, model, prompt)
        : await callOpenRouter(apiKey, model, prompt);
    } catch (err) {
      lastError = err;
      logError(`AI call attempt ${attempt + 1} (${provider}/${model})`, err);

      if (!isRetryable(err) || attempt === maxRetries) break;
      await sleep(AI_RETRY_DELAYS_MS[attempt] || 4000);
    }
  }

  throw lastError;
}

// ─── OpenRouter (OpenAI-compatible schema) ────────────────────────────────────

async function callOpenRouter(apiKey, model, { system, userMessage }) {
  rateLimiter.record();

  let response;
  try {
    response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/Zafsh1/awesome-ai-tools',
        'X-Title': 'AI Bookmarks',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMessage },
        ],
      }),
    });
  } catch (networkErr) {
    throw new AiBookmarksError(`Network error: ${networkErr.message}`, ERROR_CODES.API_NETWORK);
  }

  await throwOnHttpError(response, 'OpenRouter');

  const data = await parseJsonBody(response);
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new AiBookmarksError('Empty response from OpenRouter', ERROR_CODES.API_PARSE);
  }

  return parseAiResponse(text, data.model || model);
}

// ─── Anthropic (Messages API schema) ──────────────────────────────────────────

async function callAnthropic(apiKey, model, { system, userMessage }) {
  rateLimiter.record();

  let response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        temperature: 0.2,
        system,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
  } catch (networkErr) {
    throw new AiBookmarksError(`Network error: ${networkErr.message}`, ERROR_CODES.API_NETWORK);
  }

  await throwOnHttpError(response, 'Anthropic');

  const data = await parseJsonBody(response);
  const text = data?.content?.[0]?.text;
  if (!text) {
    throw new AiBookmarksError('Empty response from Anthropic', ERROR_CODES.API_PARSE);
  }

  return parseAiResponse(text, data.model || model);
}

// ─── Shared HTTP helpers ──────────────────────────────────────────────────────

async function throwOnHttpError(response, providerName) {
  if (response.ok) return;
  const errorCode = httpStatusToErrorCode(response.status);
  let body;
  try {
    body = await response.json();
  } catch {}
  throw new AiBookmarksError(
    `${providerName} API error ${response.status}: ${body?.error?.message || response.statusText}`,
    errorCode,
    { status: response.status, body }
  );
}

async function parseJsonBody(response) {
  try {
    return await response.json();
  } catch {
    throw new AiBookmarksError('Failed to parse API response', ERROR_CODES.API_PARSE);
  }
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
