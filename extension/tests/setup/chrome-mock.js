// In-memory mock of the chrome.* extension APIs used by the modules under test.
// Import this module FIRST in every test file so `globalThis.chrome` exists
// before any production module runs.

function createStorageArea() {
  let data = {};
  return {
    async get(keys) {
      if (keys == null) return { ...data };
      const keyList = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const result = {};
      for (const k of keyList) {
        if (k in data) result[k] = structuredClone(data[k]);
        else if (!Array.isArray(keys) && typeof keys === 'object' && keys[k] !== undefined) result[k] = keys[k];
      }
      return result;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data[k] = structuredClone(v);
    },
    async remove(keys) {
      for (const k of typeof keys === 'string' ? [keys] : keys) delete data[k];
    },
    async clear() {
      data = {};
    },
    /** Test helper: inspect the raw store. */
    _dump() {
      return structuredClone(data);
    },
  };
}

export function installChromeMock() {
  const mock = {
    storage: {
      sync: createStorageArea(),
      local: createStorageArea(),
    },
    runtime: {
      id: 'test-extension-id',
      lastError: null,
      sendMessage: async () => {},
      onMessage: { addListener() {} },
      openOptionsPage: () => {},
    },
    i18n: {
      getMessage: () => '',
      getUILanguage: () => 'en',
    },
    bookmarks: {
      _tree: [{ id: '0', children: [{ id: '1', title: 'Bookmarks bar', children: [] }, { id: '2', title: 'Other bookmarks', children: [] }] }],
      _nextId: 100,
      _nodes: {},
      _moves: [],
      async getTree() {
        return structuredClone(this._tree);
      },
      async getChildren(parentId) {
        return Object.values(this._nodes).filter((n) => n.parentId === parentId);
      },
      async create({ parentId, title, url }) {
        const node = { id: String(this._nextId++), parentId: parentId || '2', title, url };
        this._nodes[node.id] = node;
        return structuredClone(node);
      },
      async move(id, { parentId }) {
        this._moves.push({ id, parentId });
        if (this._nodes[id]) this._nodes[id].parentId = parentId;
        return this._nodes[id] ? structuredClone(this._nodes[id]) : { id, parentId };
      },
    },
    tabs: {
      async query() {
        return [];
      },
      create: () => {},
    },
    alarms: {
      create: () => {},
      onAlarm: { addListener() {} },
    },
  };

  globalThis.chrome = mock;
  return mock;
}

export function resetChromeMock() {
  return installChromeMock();
}

// Install immediately on import
installChromeMock();
