import { resetChromeMock } from './setup/chrome-mock.js';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { importExistingBookmarks, getImportProgress } from '../background/importer.js';
import { getBookmarkIndex, getPendingQueue, upsertBookmark } from '../shared/storage-schema.js';

function treeWith(urlNodes) {
  return [
    {
      id: '0',
      children: [
        { id: '1', title: 'Bookmarks bar', children: urlNodes },
        { id: '2', title: 'Other bookmarks', children: [] },
      ],
    },
  ];
}

beforeEach(() => {
  const mock = resetChromeMock();
  mock.bookmarks._tree = treeWith([
    { id: '10', title: 'Example', url: 'https://example.com/a', dateAdded: 1700000000000 },
    { id: '11', title: 'Docs', url: 'https://docs.example.com', dateAdded: 1700000001000 },
    {
      id: '12',
      title: 'Nested folder',
      children: [{ id: '13', title: 'Deep', url: 'https://deep.example.com', dateAdded: 1700000002000 }],
    },
    { id: '14', title: 'Local file', url: 'file:///etc/hosts' }, // must be skipped
  ]);
});

describe('importExistingBookmarks', () => {
  test('indexes every http(s) bookmark in the tree, including nested folders', async () => {
    const result = await importExistingBookmarks();
    assert.equal(result.total, 3, 'file:// URLs are excluded');
    assert.equal(result.queued, 3);

    const index = await getBookmarkIndex();
    const urls = Object.values(index).map((e) => e.url).sort();
    assert.deepEqual(urls, ['https://deep.example.com', 'https://docs.example.com', 'https://example.com/a']);

    for (const entry of Object.values(index)) {
      assert.equal(entry.aiStatus, 'pending');
    }
  });

  test('skips bookmarks that are already indexed (idempotent re-run)', async () => {
    await importExistingBookmarks();
    const second = await importExistingBookmarks();
    assert.equal(second.queued, 0, 're-import queues nothing new');

    const index = await getBookmarkIndex();
    assert.equal(Object.keys(index).length, 3, 'no duplicates created');
  });

  test('skips URLs already saved via normal bookmarking', async () => {
    await upsertBookmark({
      id: 'bm_existing',
      chromeBookmarkId: '99',
      url: 'https://example.com/a',
      title: 'Already here',
      categoryId: null, tags: [], visitCount: 0, lastVisited: 0,
      rankScore: 0, createdAt: 0, aiStatus: 'enriched', summaryRef: null,
    });

    const result = await importExistingBookmarks();
    assert.equal(result.queued, 2, 'known URL not re-queued');
  });

  test('records progress for the options page to poll', async () => {
    await importExistingBookmarks();
    const progress = await getImportProgress();
    assert.equal(progress.queued, 3);
    assert.equal(progress.processed, 0);
    assert.equal(progress.done, false);
  });

  test('queue receives items with the chrome bookmark node id', async () => {
    await importExistingBookmarks();
    // Import kicks off processQueue which (with no API key) drains the queue
    // but leaves entries pending; verify entries kept their chrome node link.
    const index = await getBookmarkIndex();
    const chromeIds = Object.values(index).map((e) => e.chromeBookmarkId).sort();
    assert.deepEqual(chromeIds, ['10', '11', '13']);
  });
});
