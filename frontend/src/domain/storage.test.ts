import { describe, expect, it } from 'vitest';

import { STORAGE_KEY } from './keys';
import { buildDefaultStore } from './repository';
import { migrateSelectionSeedStore } from './seed-migration';
import { CRUD_DEFAULTS, SEED_VERSION, SENSOR_DATA } from './seed';
import { BackendStorage } from './storage';
import type { BackendStoreTransport, StorageLike } from './types';

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
  it('stops retrying a local snapshot after storage quota is exhausted', async () => {
    let snapshotAttempts = 0;
    const transport = createFakeTransport({ a: [1] });
    const bridge = new BackendStorage({
      transport,
      local: {
        getItem: () => null,
        setItem: () => {
          snapshotAttempts += 1;
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        },
      },
    });

    await bridge.init();
    expect(bridge.setItem('a', JSON.stringify([2]))).toBe(true);
    await bridge.queue;
    expect(bridge.setItem('a', JSON.stringify([3]))).toBe(true);
    await bridge.queue;

    expect(snapshotAttempts).toBe(1);
  });

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

  it('replaces an uploaded data URL with the detached value returned by the backend', async () => {
    const localMemory = new Map<string, string>();
    const fileUrl = '/api/files/11111111-1111-1111-1111-111111111111/content';
    const transport = createFakeTransport({});
    transport.writeKey = async (key, value) => {
      const normalized = (value as Array<Record<string, unknown>>).map((item) => ({
        ...item,
        dataUrl: fileUrl,
        fileId: '11111111-1111-1111-1111-111111111111',
      }));
      transport.remote.set(key, normalized);
      transport.calls.writes.push(key);
      return normalized;
    };
    const bridge = new BackendStorage({
      transport,
      local: makeLocal(localMemory),
    });
    await bridge.init();

    bridge.setItem(
      'sensor-sop:all',
      JSON.stringify([{ id: 1, dataUrl: 'data:application/pdf;base64,YQ==' }]),
    );
    await bridge.queue;

    expect(bridge.getItem('sensor-sop:all')).toContain(fileUrl);
    expect(bridge.getItem('sensor-sop:all')).not.toContain('base64');
    expect(localMemory.get(STORAGE_KEY)).not.toContain('base64');
  });

  it('marks the backend offline after a write failure without saving local data', async () => {
    let writeFailureMsg = '';
    const localMemory = new Map<string, string>();
    const transport = createFakeTransport(
      { a: [{ v: 1 }] },
      { failKeys: ['a'] },
    );
    const bridge = new BackendStorage({
      transport,
      local: makeLocal(localMemory),
      onWriteFailure: (message) => {
        writeFailureMsg = message;
      },
    });
    await bridge.init();
    const localSnapshot = localMemory.get(STORAGE_KEY);
    expect(bridge.setItem('a', JSON.stringify([{ v: 2 }]))).toBe(true);
    expect(bridge.getItem('a')).toBe('[{"v":2}]');
    await bridge.queue;
    expect(bridge.status).toBe('offline');
    expect(bridge.getItem('a')).toBeNull();
    expect(localMemory.get(STORAGE_KEY)).toBe(localSnapshot);
    expect(writeFailureMsg).toMatch(/write blocked/);
  });

  it('keeps the newest optimistic value when an earlier queued write fails', async () => {
    let releaseFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const transport = createFakeTransport({ a: [{ v: 1 }] });
    let writes = 0;
    const originalWrite = transport.writeKey;
    transport.writeKey = async (key, value) => {
      writes += 1;
      if (writes === 1) {
        await firstWrite;
        throw new Error('first write failed');
      }
      await originalWrite(key, value);
    };
    const bridge = new BackendStorage({
      transport,
      local: makeLocal(new Map()),
    });
    await bridge.init();

    bridge.setItem('a', JSON.stringify([{ v: 2 }]));
    bridge.setItem('a', JSON.stringify([{ v: 3 }]));
    releaseFirst();
    await bridge.queue;

    expect(bridge.status).toBe('online');
    expect(bridge.getItem('a')).toBe('[{"v":3}]');
    expect(transport.remote.get('a')).toEqual([{ v: 3 }]);
  });

  it('does not read or write local data when fetch fails', async () => {
    const localMemory = new Map<string, string>();
    localMemory.set(STORAGE_KEY, JSON.stringify({ cached: [{ id: 1 }] }));
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
    expect(bridge.getItem(STORAGE_KEY)).toBeNull();
    expect(bridge.setItem('x', JSON.stringify([1]))).toBe(false);
    expect(localMemory.get(STORAGE_KEY)).toBe(
      JSON.stringify({ cached: [{ id: 1 }] }),
    );
  });

  it('rejects writes and local reads when unauthorized', async () => {
    const unauthorized = Object.assign(new Error('token expired'), {
      kind: 'unauthorized',
    });
    const localMemory = new Map<string, string>();
    localMemory.set(
      STORAGE_KEY,
      JSON.stringify({
        'customer-req:庆鼎': [{ id: 1, content: '本地旧数据' }],
      }),
    );
    const bridge = new BackendStorage({
      transport: createFakeTransport({}, { fetchError: unauthorized }),
      local: makeLocal(localMemory),
    });
    const authState = await bridge.init();
    expect(authState.status).toBe('unauthorized');
    expect(bridge.setItem('y', JSON.stringify([1]))).toBe(false);
    expect(bridge.getItem(STORAGE_KEY)).toBeNull();
    expect(localMemory.get(STORAGE_KEY)).toContain('本地旧数据');
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
    expect([...transport.calls.writes].sort()).toEqual([
      'b',
      'meta:seed-version',
    ]);
    expect(transport.remote.get('dict:sensor-type')).toEqual([
      { id: 1, name: '旧类型' },
    ]);
    expect(transport.remote.get('b')).toEqual([2]);
  });

  it('persists the production seed migration before advancing its version', async () => {
    const transport = createFakeTransport({
      'meta:seed-version': [{ version: 1 }],
      'customer-req:庆鼎': [
        {
          id: 1,
          type: '输送段',
          machine: 'ALL',
          process: '',
          content: '板件有无检测，检测距离不大于 300mm',
          source: '验收规范',
          note: 'OMRON E3Z-D61 或同等级',
        },
      ],
      'customer-req:景旺': [
        {
          id: 9,
          type: '特殊要求',
          machine: '专用机',
          process: '压合',
          content: '景旺专属要求',
          source: '客户要求',
          note: '',
        },
      ],
    });
    const bridge = new BackendStorage({
      transport,
      local: makeLocal(new Map()),
      seedDefaults: { 'meta:seed-version': [{ version: 2 }] },
      seedMigration: migrateSelectionSeedStore,
    } as ConstructorParameters<typeof BackendStorage>[0]);

    await bridge.init();

    expect(transport.remote.get('customer-req:庆鼎')).toEqual([]);
    expect(transport.remote.get('customer-req:景旺')).toEqual([
      expect.objectContaining({ id: 9, content: '景旺专属要求' }),
    ]);
    expect(transport.remote.get('meta:seed-version')).toEqual([{ version: 2 }]);
  });

  it('persists the limited initial customer data when upgrading from version 2', async () => {
    const defaultStore = buildDefaultStore({
      crudDefaults: CRUD_DEFAULTS,
      sensorData: SENSOR_DATA,
    });
    const transport = createFakeTransport({
      'meta:seed-version': [{ version: 2 }],
      'customer-req:庆鼎': [],
      'customer-req:景旺': [],
    });
    const bridge = new BackendStorage({
      transport,
      local: makeLocal(new Map()),
      seedDefaults: defaultStore,
      seedMigration: migrateSelectionSeedStore,
    });

    await bridge.init();

    expect(transport.remote.get('customer-req:庆鼎')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: '进板前确认板件到位后再启动输送' }),
      ]),
    );
    expect(transport.remote.get('customer-req:景旺')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: '中段与末端均需设置掉板检测' }),
      ]),
    );
    expect(transport.remote.get('meta:seed-version')).toEqual([
      { version: SEED_VERSION },
    ]);
  });

  it('persists numbered feedback statuses and historical row mappings before version 10', async () => {
    const defaultStore = buildDefaultStore({
      crudDefaults: CRUD_DEFAULTS,
      sensorData: SENSOR_DATA,
    });
    const transport = createFakeTransport({
      'meta:seed-version': [{ version: 9 }],
      'dict:customer-feedback-status': [
        { id: 5, name: '待处理', sort: 1 },
        { id: 8, name: '已解决', sort: 2 },
        { id: 1, name: '01 待处理', sort: 3 },
        { id: 4, name: '04 已解决', sort: 4 },
      ],
      'customer-feedback:庆鼎': [
        { id: 1, problem: '历史问题', status: '已解决' },
      ],
    });
    const bridge = new BackendStorage({
      transport,
      local: makeLocal(new Map()),
      seedDefaults: defaultStore,
      seedMigration: migrateSelectionSeedStore,
    });

    await bridge.init();

    expect(transport.remote.get('dict:customer-feedback-status')).toEqual([
      { id: 1, name: '01 待处理', sort: 1 },
      { id: 9, name: '02 处理中', sort: 2 },
      { id: 10, name: '03 测试中', sort: 3 },
      { id: 4, name: '04 已解决', sort: 4 },
    ]);
    expect(transport.remote.get('customer-feedback:庆鼎')).toEqual([
      { id: 1, problem: '历史问题', status: '04 已解决' },
    ]);
    expect(transport.remote.get('meta:seed-version')).toEqual([
      { version: SEED_VERSION },
    ]);
  });

  it('persists restored machine-owned tabs before version 11', async () => {
    const defaultStore = buildDefaultStore({
      crudDefaults: CRUD_DEFAULTS,
      sensorData: SENSOR_DATA,
    });
    const transport = createFakeTransport({
      'meta:seed-version': [{ version: 10 }],
      'machine-section-rows:1:既有机型': [
        { id: 1, role: '真实结构资料', sensorType: '漫反射' },
      ],
    });
    const bridge = new BackendStorage({
      transport,
      local: makeLocal(new Map()),
      seedDefaults: defaultStore,
      seedMigration: migrateSelectionSeedStore,
    });

    await bridge.init();

    expect(transport.remote.get('machine-extra-sections:既有机型')).toEqual([
      {
        id: 1,
        name: '输送机构',
        sort: 1,
        kind: 'structure',
        scope: 'machine',
      },
    ]);
    expect(transport.remote.get('dict:machine-model')).toEqual(
      defaultStore['dict:machine-model'],
    );
    expect(transport.remote.get('dict:board-characteristic')).toEqual(
      defaultStore['dict:board-characteristic'],
    );
    expect(transport.remote.get('meta:seed-version')).toEqual([
      { version: SEED_VERSION },
    ]);
  });

  it('seeds an empty remote from buildDefaultStore', async () => {
    const defaultStore = buildDefaultStore({
      crudDefaults: CRUD_DEFAULTS,
      sensorData: SENSOR_DATA,
    });
    expect(defaultStore['entity-groups:customer']).toHaveLength(3);
    expect(defaultStore['machine-global-sections:all']).toBeUndefined();
    expect(defaultStore['general-structure-labels:all']).toBeUndefined();
    expect(defaultStore['dict:machine-section']).toBeUndefined();
    expect(defaultStore['dict:machine-model']).toHaveLength(14);
    expect(defaultStore['dict:board-characteristic']).toHaveLength(9);
    expect(defaultStore['customer-req:庆鼎']).toHaveLength(2);
    expect(defaultStore['customer-req:景旺']).toHaveLength(2);
    expect(defaultStore['customer-req:健鼎']).toBeUndefined();
    expect(defaultStore['meta:seed-version']).toEqual([
      { version: SEED_VERSION },
    ]);
    expect(
      Object.keys(defaultStore).some((key) =>
        /^(customer-(req|proc|feedback)|process-(feat|sensor)|machine-section-rows):/.test(
          key,
        ),
      ),
    ).toBe(true);

    const transport = createFakeTransport({});
    const bridge = new BackendStorage({
      transport,
      local: makeLocal(new Map()),
      migrateOnEmpty: true,
      seedDefaults: defaultStore,
    });
    const seeded = await bridge.init();
    expect(seeded).toMatchObject({
      status: 'online',
      seeded: true,
      migrated: false,
    });
    expect(transport.calls.writeAlls).toBe(1);
  });
});
