import { describe, expect, it } from 'vitest';

import { STORAGE_KEY } from './keys';
import { buildDefaultStore } from './repository';
import { CRUD_DEFAULTS, SEED_VERSION, SENSOR_DATA } from './seed';
import { BackendStorage } from './storage';
import type { BackendStoreTransport, PersistedStore, StorageLike } from './types';

function createFakeTransport(
  initial: Record<string, unknown[]>,
  opts: {
    fetchError?: Error & { kind?: string };
    failKeys?: string[];
    failError?: Error & { kind?: string };
    failDeletes?: string[];
    failWriteAll?: boolean;
  } = {},
) {
  const remote = new Map(Object.entries(initial));
  const calls = {
    writes: [] as string[],
    deletes: [] as string[],
    writeAlls: 0,
    fetches: 0,
  };
  const transport: BackendStoreTransport & {
    calls: typeof calls;
    remote: typeof remote;
  } = {
    calls,
    remote,
    async fetchStore() {
      calls.fetches += 1;
      if (opts.fetchError) throw opts.fetchError;
      return Object.fromEntries(remote);
    },
    async writeKey(key, value) {
      if (opts.failKeys?.includes(key)) {
        throw opts.failError || new Error(`write blocked: ${key}`);
      }
      remote.set(key, value);
      calls.writes.push(key);
    },
    async deleteKey(key) {
      if (opts.failDeletes?.includes(key)) {
        throw new Error(`delete blocked: ${key}`);
      }
      remote.delete(key);
      calls.deletes.push(key);
    },
    async writeAll(store) {
      if (opts.failWriteAll) throw new Error('writeAll blocked');
      remote.clear();
      for (const [key, value] of Object.entries(store)) {
        remote.set(key, value);
      }
      calls.writeAlls += 1;
    },
  };
  return transport;
}

function makeLocal(memory: Map<string, string>): StorageLike {
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      memory.set(key, value);
    },
  };
}

describe('BackendStorage', () => {
  it('migrates local data into an empty remote store', async () => {
    const localMemory = new Map<string, string>();
    localMemory.set(
      STORAGE_KEY,
      JSON.stringify({ 'customer-req': [{ id: 1, type: '输送段' }] }),
    );
    const transport = createFakeTransport({});
    const bridge = new BackendStorage({
      transport,
      local: makeLocal(localMemory),
      migrateOnEmpty: true,
    });
    const migrated = await bridge.init();
    expect(migrated).toMatchObject({
      status: 'online',
      migrated: true,
      seeded: false,
      keyCount: 1,
    });
    expect(transport.calls.writeAlls).toBe(1);
    expect(transport.remote.get('customer-req')).toEqual([
      { id: 1, type: '输送段' },
    ]);
  });

  it('diffs per-key writes and skips unchanged values', async () => {
    const transport = createFakeTransport({ a: [1], b: [2] });
    const bridge = new BackendStorage({
      transport,
      local: makeLocal(new Map()),
    });
    await bridge.init();
    expect(bridge.getItem('a')).toBe('[1]');
    expect(bridge.setItem('a', JSON.stringify([1, 2]))).toBe(true);
    expect(bridge.setItem('b', JSON.stringify([2]))).toBe(true);
    expect(bridge.setItem('c', JSON.stringify([3]))).toBe(true);
    await bridge.queue;
    expect([...transport.calls.writes].sort()).toEqual(['a', 'c']);
  });

  it('rolls an optimistic write back after transport failure', async () => {
    let writeFailureMsg = '';
    const transport = createFakeTransport({ a: [{ v: 1 }] }, { failKeys: ['a'] });
    const bridge = new BackendStorage({
      transport,
      local: makeLocal(new Map()),
      onWriteFailure: (message) => {
        writeFailureMsg = message;
      },
    });
    await bridge.init();
    expect(bridge.setItem('a', JSON.stringify([{ v: 2 }]))).toBe(true);
    expect(bridge.getItem('a')).toBe('[{"v":2}]');
    await bridge.queue;
    expect(bridge.getItem('a')).toBe('[{"v":1}]');
    expect(writeFailureMsg).toMatch(/write blocked/);
  });

  it('falls back to local read-write when fetch fails', async () => {
    const localMemory = new Map<string, string>();
    const transport = createFakeTransport(
      {},
      { fetchError: new Error('network down') },
    );
    const bridge = new BackendStorage({
      transport,
      local: makeLocal(localMemory),
    });
    const offline = await bridge.init();
    expect(offline.status).toBe('offline');
    expect(bridge.setItem('x', JSON.stringify([1]))).toBe(true);
    expect(bridge.getItem('x')).toBe('[1]');
    expect(localMemory.get('x')).toBe('[1]');
  });

  it('rejects writes and reads local snapshot when unauthorized', async () => {
    const unauthorized = Object.assign(new Error('token expired'), {
      kind: 'unauthorized',
    });
    const localMemory = new Map<string, string>();
    localMemory.set(
      STORAGE_KEY,
      JSON.stringify({ 'customer-req:庆鼎': [{ id: 1, content: '本地旧数据' }] }),
    );
    const bridge = new BackendStorage({
      transport: createFakeTransport({}, { fetchError: unauthorized }),
      local: makeLocal(localMemory),
    });
    const authState = await bridge.init();
    expect(authState.status).toBe('unauthorized');
    expect(bridge.setItem('y', JSON.stringify([1]))).toBe(false);
    const localRead = JSON.parse(bridge.getItem(STORAGE_KEY) || '{}') as PersistedStore;
    expect(localRead['customer-req:庆鼎']).toEqual([
      { id: 1, content: '本地旧数据' },
    ]);
  });

  it('backfills missing seed keys without overwriting user data', async () => {
    const transport = createFakeTransport({
      a: [1],
      'customer-req:庆鼎': [{ id: 1, content: '用户数据' }],
      'dict:sensor-type': [{ id: 1, name: '旧类型' }],
    });
    const bridge = new BackendStorage({
      transport,
      local: makeLocal(new Map()),
      migrateOnEmpty: true,
      seedDefaults: {
        b: [2],
        'dict:sensor-type': [{ id: 1, name: '新类型' }],
        'meta:seed-version': [{ version: 2 }],
      },
    });
    await bridge.init();
    expect([...transport.calls.writes].sort()).toEqual(['b', 'meta:seed-version']);
    expect(transport.remote.get('dict:sensor-type')).toEqual([
      { id: 1, name: '旧类型' },
    ]);
    expect(transport.remote.get('b')).toEqual([2]);
  });

  it('seeds an empty remote from buildDefaultStore', async () => {
    const defaultStore = buildDefaultStore({
      crudDefaults: CRUD_DEFAULTS,
      sensorData: SENSOR_DATA,
    });
    expect(defaultStore['entity-groups:customer']).toHaveLength(3);
    expect(defaultStore['machine-global-sections:all']).toHaveLength(4);
    expect(defaultStore['meta:seed-version']).toEqual([{ version: SEED_VERSION }]);

    const transport = createFakeTransport({});
    const bridge = new BackendStorage({
      transport,
      local: makeLocal(new Map()),
      migrateOnEmpty: true,
      seedDefaults: defaultStore,
    });
    const seeded = await bridge.init();
    expect(seeded).toMatchObject({ status: 'online', seeded: true, migrated: false });
    expect(transport.calls.writeAlls).toBe(1);
  });
});
