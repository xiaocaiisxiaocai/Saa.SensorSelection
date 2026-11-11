import { describe, expect, it, vi } from 'vitest';

import { STORAGE_KEY } from './keys';
import { BackendStorage } from './storage';
import type { BackendStoreTransport } from './types';

function atomicRemote(initial: Record<string, unknown[]>) {
  let data = structuredClone(initial);
  const transport: BackendStoreTransport = {
    fetchStore: async () => structuredClone(data),
    writeKey: vi.fn(async () => {
      throw new Error('旧单键接口不得参与批次');
    }),
    deleteKey: vi.fn(async () => {
      throw new Error('旧单键接口不得参与批次');
    }),
    writeAll: vi.fn(async () => {
      throw new Error('禁止全量覆盖');
    }),
    writeBatch: vi.fn(async (changes) => {
      for (const change of changes) {
        if (
          JSON.stringify(data[change.key] ?? null) !==
          JSON.stringify(change.expected)
        ) {
          throw Object.assign(new Error('数据已被其他人修改，请刷新后重试'), {
            kind: 'error',
            status: 409,
          });
        }
      }
      const next = structuredClone(data);
      const values: Record<string, unknown[] | null> = {};
      for (const { key, value } of changes) {
        if (value === null) delete next[key];
        else next[key] = structuredClone(value);
        values[key] = structuredClone(value);
      }
      data = next;
      return values;
    }),
  };
  return { transport, read: () => structuredClone(data) };
}

describe('atomic backend persistence', () => {
  it('rejects invalid full-store input without deleting any existing key', async () => {
    const remote = atomicRemote({ rows: [1] });
    const bridge = new BackendStorage({ transport: remote.transport });
    await bridge.init();
    expect(bridge.setItem(STORAGE_KEY, '{')).toBe(false);
    expect(bridge.setItem(STORAGE_KEY, '{"rows":{}}')).toBe(false);
    expect(bridge.getItem('rows')).toBe('[1]');
    expect(remote.transport.writeBatch).not.toHaveBeenCalled();
  });
  it('keeps the old customer data when any part of a rename is rejected', async () => {
    const remote = atomicRemote({
      directory: ['Old'],
      'data:Old': [{ id: 1 }],
    });
    remote.transport.writeBatch = vi.fn(async () => {
      throw Object.assign(new Error('目录校验失败'), {
        kind: 'error',
        status: 400,
      });
    });
    const bridge = new BackendStorage({ transport: remote.transport });
    await bridge.init();
    bridge.setItem(
      STORAGE_KEY,
      JSON.stringify({ directory: ['New'], 'data:New': [{ id: 1 }] }),
    );
    await bridge.queue;
    expect(remote.read()).toEqual({
      directory: ['Old'],
      'data:Old': [{ id: 1 }],
    });
    expect(JSON.parse(bridge.readStoreJson())).toEqual(remote.read());
    expect(remote.transport.writeBatch).toHaveBeenCalledTimes(1);
    expect(remote.transport.deleteKey).not.toHaveBeenCalled();
  });

  it('rejects a stale second client rather than overwriting another user’s added row', async () => {
    const remote = atomicRemote({ rows: [{ id: 1, text: 'old' }] });
    const first = new BackendStorage({ transport: remote.transport });
    const second = new BackendStorage({ transport: remote.transport });
    await first.init();
    await second.init();
    first.setItem(
      'rows',
      JSON.stringify([
        { id: 1, text: 'old' },
        { id: 2, text: 'new' },
      ]),
    );
    await first.queue;
    second.setItem('rows', JSON.stringify([{ id: 1, text: 'other edit' }]));
    await second.queue;
    expect(remote.read().rows).toHaveLength(2);
    expect(second.lastError).toContain('其他人');
    expect(second.status).toBe('offline');
  });

  it('cancels dependent queued edits after a failed operation', async () => {
    const remote = atomicRemote({ rows: [1] });
    remote.transport.writeBatch = vi.fn(async () => {
      throw new Error('connection lost');
    });
    const bridge = new BackendStorage({ transport: remote.transport });
    await bridge.init();
    bridge.setItem('rows', '[2]');
    bridge.setItem('rows', '[3]');
    await bridge.queue;
    expect(remote.transport.writeBatch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(bridge.readStoreJson()).rows).toEqual([1]);
  });

  it('uses the last server-confirmed value as the next queued precondition', async () => {
    const remote = atomicRemote({ rows: [1] });
    const bridge = new BackendStorage({ transport: remote.transport });
    await bridge.init();
    bridge.setItem('rows', '[2]');
    bridge.setItem('rows', '[3]');
    await bridge.queue;
    expect(remote.read().rows).toEqual([3]);
    expect(remote.transport.writeBatch).toHaveBeenNthCalledWith(
      2,
      [{ key: 'rows', expected: [2], value: [3] }],
      undefined,
    );
  });

  it('rolls back forbidden writes without expiring the login session', async () => {
    const remote = atomicRemote({ rows: [1] });
    remote.transport.writeBatch = vi.fn(async () => {
      throw Object.assign(new Error('无权限'), { kind: 'forbidden' });
    });
    const bridge = new BackendStorage({ transport: remote.transport });
    await bridge.init();
    bridge.setItem('rows', '[2]');
    await bridge.queue;
    expect(bridge.status).toBe('online');
    expect(bridge.getItem('rows')).toBe('[1]');
  });

  it('refuses a multi-key change if transport cannot commit atomically', async () => {
    const remote = atomicRemote({ old: [1] });
    delete remote.transport.writeBatch;
    const bridge = new BackendStorage({ transport: remote.transport });
    await bridge.init();
    expect(bridge.setItem(STORAGE_KEY, JSON.stringify({ next: [1] }))).toBe(
      false,
    );
    await bridge.queue;
    expect(remote.read()).toEqual({ old: [1] });
  });
});
