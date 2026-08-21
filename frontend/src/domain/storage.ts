import { STORAGE_KEY } from './keys';
import { parsePersistedStore } from './normalize';
import type {
  BackendInitResult,
  BackendStorageOptions,
  BackendStoreTransport,
  BackendSyncStatus,
  StorageLike,
} from './types';

function cloneMap(source: Map<string, unknown[]>): Map<string, unknown[]> {
  return new Map(source);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseStoreJson(value: string): Record<string, unknown[]> {
  const store = Object.create(null) as Record<string, unknown[]>;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return store;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return store;
  }
  for (const [key, item] of Object.entries(parsed)) {
    if (Array.isArray(item)) store[key] = item;
  }
  return store;
}

function isUnauthorized(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      ((error as { kind?: string }).kind === 'unauthorized' ||
        (error as { kind?: string }).kind === 'forbidden'),
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export class BackendStorage implements StorageLike {
  lastError: null | string = null;
  status: BackendSyncStatus = 'connecting';
  queue: Promise<void> = Promise.resolve();

  private readonly transport: BackendStoreTransport;
  private readonly local: StorageLike;
  private readonly onStatus?: (status: BackendSyncStatus) => void;
  private readonly onWriteFailure?: (message: string) => void;
  private readonly migrateOnEmpty: boolean;
  private readonly seedDefaults?: Record<string, unknown[]>;
  private cache = new Map<string, unknown[]>();
  private synced = new Map<string, unknown[]>();

  constructor(options: BackendStorageOptions) {
    this.transport = options.transport;
    this.local = options.local;
    this.onStatus = options.onStatus;
    this.onWriteFailure = options.onWriteFailure;
    this.migrateOnEmpty = options.migrateOnEmpty !== false;
    this.seedDefaults = options.seedDefaults;
  }

  private emitStatus() {
    this.onStatus?.(this.status);
  }

  private enqueueDelete(key: string) {
    const prev = this.synced.get(key);
    if (!this.transport.deleteKey) {
      this.synced.delete(key);
      this.snapshotLocal();
      return;
    }
    this.queue = this.queue.then(async () => {
      try {
        await this.transport.deleteKey?.(key);
        this.synced.delete(key);
        this.lastError = null;
        this.snapshotLocal();
      } catch (error) {
        this.handleFailure(key, prev, error);
      }
    });
  }

  private enqueueWrite(key: string, value: unknown[], prev: unknown[] | undefined) {
    this.queue = this.queue.then(async () => {
      try {
        await this.transport.writeKey(key, value);
        this.synced.set(key, value);
        this.lastError = null;
        this.snapshotLocal();
      } catch (error) {
        this.handleFailure(key, prev, error);
      }
    });
  }

  private fallbackToLocal(error: unknown): BackendInitResult {
    if (isUnauthorized(error)) {
      this.status = 'unauthorized';
      this.lastError = errorMessage(error, '登录已失效');
    } else {
      this.status = 'offline';
      this.lastError = errorMessage(error, '后端服务不可用');
    }
    this.cache.clear();
    this.synced.clear();
    this.emitStatus();
    return {
      migrated: false,
      seeded: false,
      keyCount: 0,
      status: this.status,
    };
  }

  getItem(key: string): null | string {
    if (this.status === 'offline') {
      return this.local.getItem(key);
    }
    if (key === STORAGE_KEY) {
      const full: Record<string, unknown[]> = {};
      for (const [k, value] of this.cache) full[k] = value;
      if (this.status === 'unauthorized' && Object.keys(full).length === 0) {
        return this.local.getItem(key);
      }
      return JSON.stringify(full);
    }
    const value = this.cache.get(key);
    if (value === undefined) {
      if (this.status === 'unauthorized') return this.local.getItem(key);
      return null;
    }
    return JSON.stringify(value);
  }

  private handleFailure(key: string, prev: unknown[] | undefined, error: unknown) {
    if (prev === undefined) {
      this.cache.delete(key);
    } else {
      this.cache.set(key, prev);
    }
    this.snapshotLocal();
    const message = errorMessage(error, '写入后端失败');
    this.lastError = message;
    this.onWriteFailure?.(message);
    if (isUnauthorized(error) && this.status !== 'unauthorized') {
      this.status = 'unauthorized';
      this.emitStatus();
    }
  }

  async init(): Promise<BackendInitResult> {
    this.status = 'connecting';
    this.emitStatus();

    let remote: Record<string, unknown[]>;
    try {
      remote = await this.transport.fetchStore();
    } catch (error) {
      return this.fallbackToLocal(error);
    }

    const remoteKeys = Object.keys(remote);
    let migrated = false;
    let seeded = false;
    if (this.migrateOnEmpty && remoteKeys.length === 0) {
      const localStore = parsePersistedStore(this.local.getItem(STORAGE_KEY));
      const localKeys = Object.keys(localStore);
      if (localKeys.length > 0) {
        try {
          await this.transport.writeAll(localStore);
          remote = localStore;
          migrated = true;
        } catch {
          // keep treating remote as empty
        }
      } else if (this.seedDefaults) {
        try {
          await this.transport.writeAll(this.seedDefaults);
          remote = this.seedDefaults;
          seeded = true;
        } catch {
          // keep treating remote as empty
        }
      }
    }

    if (this.seedDefaults) {
      const currentVersion =
        Number(
          (remote['meta:seed-version']?.[0] as { version?: unknown } | undefined)
            ?.version,
        ) || 0;
      const seedVersion =
        Number(
          (
            this.seedDefaults['meta:seed-version']?.[0] as
              | { version?: unknown }
              | undefined
          )?.version,
        ) || 0;
      if (seedVersion > currentVersion) {
        try {
          for (const [key, value] of Object.entries(this.seedDefaults)) {
            if (key === 'meta:seed-version' || key in remote) continue;
            await this.transport.writeKey(key, value);
            remote[key] = value;
          }
          await this.transport.writeKey(
            'meta:seed-version',
            this.seedDefaults['meta:seed-version'],
          );
          remote['meta:seed-version'] = this.seedDefaults['meta:seed-version'];
        } catch {
          // retry on next connect
        }
      }
    }

    this.cache = new Map(Object.entries(remote));
    this.synced = cloneMap(this.cache);
    this.status = 'online';
    this.lastError = null;
    this.snapshotLocal();
    this.emitStatus();
    return { migrated, seeded, keyCount: this.cache.size, status: 'online' };
  }

  setItem(key: string, value: string): boolean {
    if (this.status === 'offline') {
      return this.writeLocal(key, value);
    }
    if (this.status !== 'online') {
      return false;
    }
    if (key === STORAGE_KEY) {
      return this.syncStore(parseStoreJson(value));
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return false;
    }
    if (!Array.isArray(parsed)) return false;
    const prev = this.cache.get(key);
    if (sameValue(prev, parsed)) return true;
    this.cache.set(key, parsed);
    this.enqueueWrite(key, parsed, prev);
    return true;
  }

  snapshotLocal() {
    try {
      const full: Record<string, unknown[]> = {};
      for (const [key, value] of this.cache) full[key] = value;
      this.local.setItem(STORAGE_KEY, JSON.stringify(full));
    } catch {
      // quota full: retry later
    }
  }

  private syncStore(nextStore: Record<string, unknown[]>): true {
    const changedKeys = new Set<string>();
    const removedKeys: string[] = [];

    for (const [key, value] of this.cache) {
      if (!(key in nextStore)) {
        removedKeys.push(key);
      } else if (!sameValue(value, nextStore[key])) {
        changedKeys.add(key);
      }
    }
    for (const [key, value] of Object.entries(nextStore)) {
      if (!this.cache.has(key) || !sameValue(this.cache.get(key), value)) {
        changedKeys.add(key);
      }
    }

    this.cache = new Map(Object.entries(nextStore));
    for (const key of changedKeys) {
      this.enqueueWrite(key, nextStore[key] as unknown[], this.synced.get(key));
    }
    for (const key of removedKeys) {
      this.enqueueDelete(key);
    }
    return true;
  }

  private writeLocal(key: string, value: string): boolean {
    try {
      this.local.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}
