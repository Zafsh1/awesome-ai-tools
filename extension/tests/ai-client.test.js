import { resetChromeMock } from './setup/chrome-mock.js';
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { enrichBookmark } from '../background/ai-client.js';
import { saveSettings } from '../shared/storage-schema.js';
import { encryptApiKey } from '../shared/utils.js';
import { ERROR_CODES } from '../shared/error-handler.js';

const originalFetch = globalThis.fetch;

function claudeResponse(text) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      model: 'claude-sonnet-4-6',
      content: [{ type: 'text', text }],
    }),
  };
}

async function setupApiKey() {
  const encrypted = await encryptApiKey('sk-ant-test-key');
  await saveSettings({ claudeApiKey: encrypted });
}

const PARAMS = {
  url: 'https://example.com',
  title: 'Example',
  extractedText: 'Some page content about JavaScript testing.',
  description: '',
  categories: [{ id: 'cat_tech', name: 'Technology', color: '#4A90E2', icon: 'code' }],
};

beforeEach(async () => {
  resetChromeMock();
  await setupApiKey();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('enrichBookmark', () => {
  test('parses a clean JSON response', async () => {
    globalThis.fetch = async () =>
      claudeResponse(
        JSON.stringify({
          summary: 'A page about JS testing.',
          category: 'Technology',
          tags: ['javascript', 'testing'],
          isNewCategory: false,
          categoryColor: null,
        })
      );

    const result = await enrichBookmark(PARAMS);
    assert.equal(result.summary, 'A page about JS testing.');
    assert.equal(result.category, 'Technology');
    assert.deepEqual(result.tags, ['javascript', 'testing']);
    assert.equal(result.isNewCategory, false);
  });

  test('strips markdown code fences around the JSON', async () => {
    globalThis.fetch = async () =>
      claudeResponse('```json\n{"summary":"s","category":"C","tags":[],"isNewCategory":true,"categoryColor":"#123456"}\n```');

    const result = await enrichBookmark(PARAMS);
    assert.equal(result.category, 'C');
    assert.equal(result.isNewCategory, true);
    assert.equal(result.categoryColor, '#123456');
  });

  test('extracts a JSON object embedded in surrounding prose', async () => {
    globalThis.fetch = async () =>
      claudeResponse('Here is the analysis: {"summary":"s","category":"News","tags":["x"],"isNewCategory":false} hope that helps');

    const result = await enrichBookmark(PARAMS);
    assert.equal(result.category, 'News');
  });

  test('sends the API key header and model in the request', async () => {
    let captured;
    globalThis.fetch = async (url, init) => {
      captured = { url, init };
      return claudeResponse('{"summary":"s","category":"C","tags":[],"isNewCategory":false}');
    };

    await enrichBookmark(PARAMS);
    assert.equal(captured.init.headers['X-API-Key'], 'sk-ant-test-key');
    const body = JSON.parse(captured.init.body);
    assert.equal(body.model, 'claude-sonnet-4-6');
    assert.ok(body.messages[0].content.includes('https://example.com'));
    assert.ok(body.messages[0].content.includes('Technology'), 'existing categories included in prompt');
  });

  test('401 auth error is NOT retried', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({ error: { message: 'bad key' } }) };
    };

    await assert.rejects(() => enrichBookmark(PARAMS), (err) => err.code === ERROR_CODES.API_AUTH);
    assert.equal(calls, 1, 'auth errors must not be retried');
  });

  test('500 server error is retried then succeeds', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) {
        return { ok: false, status: 500, statusText: 'ISE', json: async () => ({}) };
      }
      return claudeResponse('{"summary":"recovered","category":"C","tags":[],"isNewCategory":false}');
    };

    const result = await enrichBookmark(PARAMS);
    assert.equal(result.summary, 'recovered');
    assert.equal(calls, 2);
  });

  test('throws API_NO_KEY when no key is configured', async () => {
    resetChromeMock(); // wipes stored settings
    await assert.rejects(() => enrichBookmark(PARAMS), (err) => err.code === ERROR_CODES.API_NO_KEY);
  });

  test('defaults missing fields in a sparse response', async () => {
    globalThis.fetch = async () => claudeResponse('{"summary":"only summary"}');
    const result = await enrichBookmark(PARAMS);
    assert.equal(result.category, 'Uncategorized');
    assert.deepEqual(result.tags, []);
    assert.equal(result.isNewCategory, false);
  });
});
