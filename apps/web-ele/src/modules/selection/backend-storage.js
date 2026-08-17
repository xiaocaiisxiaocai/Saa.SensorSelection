/**
 * 后端存储桥接层：实现与 localStorage 相同的 StorageLike 同步接口，
 * 内部以「乐观更新 + 串行队列」异步同步到后端。
 *
 * 状态机：
 * - connecting  ：初始化中
 * - online      ：后端可达，读写走后端（按 key diff 增量 PUT，失败回滚）
 * - offline     ：启动时后端不可达，退化为 localStorage 本地模式（可读写）
 * - unauthorized：需要登录（token 缺失/失效），可读本地缓存、禁止写入
 */
import { parsePersistedStore, STORAGE_KEY } from './domain.js';

function cloneMap(source) {
  return new Map(source);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseStoreJson(value) {
  const store = Object.create(null);
  let parsed;
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

/** 结构化错误分类：transport 抛出的错误带 kind='unauthorized' 即视为未登录。 */
function isUnauthorized(error) {
  return Boolean(
    error && typeof error === 'object' && error.kind === 'unauthorized',
  );
}

function errorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

export class BackendStorage {
  /** 最近一次同步是否失败（用于 UI 提示）。 */
  lastError = null;

  status = 'connecting';

  constructor(options) {
    this.transport = options.transport;
    this.local = options.local;
    this.onStatus = options.onStatus;
    this.onWriteFailure = options.onWriteFailure;
    this.migrateOnEmpty = options.migrateOnEmpty !== false;
    this.cache = new Map();
    this.synced = new Map();
    this.queue = Promise.resolve();
  }

  emitStatus() {
    this.onStatus?.(this.status);
  }

  enqueueDelete(key) {
    const prev = this.synced.get(key);
    if (!this.transport.deleteKey) {
      this.synced.delete(key);
      return;
    }
    this.queue = this.queue.then(async () => {
      try {
        await this.transport.deleteKey?.(key);
        this.synced.delete(key);
      } catch (error) {
        // 删除失败：从已同步状态恢复该 key
        this.handleFailure(key, prev, error);
      }
    });
  }

  enqueueWrite(key, value, prev) {
    this.queue = this.queue.then(async () => {
      try {
        await this.transport.writeKey(key, value);
        this.synced.set(key, value);
        this.lastError = null;
      } catch (error) {
        this.handleFailure(key, prev, error);
      }
    });
  }

  fallbackToLocal(error) {
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
    return { migrated: false, keyCount: 0, status: this.status };
  }

  /** StorageLike#getItem。 */
  getItem(key) {
    if (this.status === 'offline' || this.status === 'unauthorized') {
      return this.local.getItem(key);
    }
    if (key === STORAGE_KEY) {
      // 缓存按「业务 key」扁平存储，需组装成完整 store 供仓库读取
      const full = {};
      for (const [k, value] of this.cache) full[k] = value;
      return JSON.stringify(full);
    }
    const value = this.cache.get(key);
    return value === undefined ? null : JSON.stringify(value);
  }

  handleFailure(key, prev, error) {
    // 回滚缓存到上次成功状态
    if (prev === undefined) {
      this.cache.delete(key);
    } else {
      this.cache.set(key, prev);
    }
    const message = errorMessage(error, '写入后端失败');
    this.lastError = message;
    this.onWriteFailure?.(message);
  }

  /**
   * 初始化：拉取后端数据；后端为空且本地有数据时自动迁移；
   * 后端不可达时退化为本地模式。
   */
  async init() {
    this.status = 'connecting';
    this.emitStatus();

    let remote;
    try {
      remote = await this.transport.fetchStore();
    } catch (error) {
      return this.fallbackToLocal(error);
    }

    const remoteKeys = Object.keys(remote);
    let migrated = false;
    if (this.migrateOnEmpty && remoteKeys.length === 0) {
      const localStore = parsePersistedStore(this.local.getItem(STORAGE_KEY));
      const localKeys = Object.keys(localStore);
      if (localKeys.length > 0) {
        try {
          await this.transport.writeAll(localStore);
          remote = localStore;
          migrated = true;
        } catch {
          // 迁移失败：继续按远端空库处理，本地数据保留
        }
      }
    }

    this.cache = new Map(Object.entries(remote));
    this.synced = cloneMap(this.cache);
    this.status = 'online';
    this.lastError = null;
    this.emitStatus();
    return { migrated, keyCount: this.cache.size, status: 'online' };
  }

  /** StorageLike#setItem。online 乐观写入；offline 写本地；其余拒绝。 */
  setItem(key, value) {
    if (this.status === 'offline') {
      return this.writeLocal(key, value);
    }
    if (this.status !== 'online') {
      return false;
    }
    if (key === STORAGE_KEY) {
      return this.syncStore(parseStoreJson(value));
    }
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      return false;
    }
    if (!Array.isArray(parsed)) return false;
    const prev = this.cache.get(key);
    if (sameValue(prev, parsed)) return true; // 值未变化，不推送
    this.cache.set(key, parsed);
    this.enqueueWrite(key, parsed, prev);
    return true;
  }

  /** 全量 store 写回：与缓存对比，只推送变更的 key。 */
  syncStore(nextStore) {
    const changedKeys = [];
    const removedKeys = [];

    for (const [key, value] of this.cache) {
      if (!(key in nextStore)) {
        removedKeys.push(key);
      } else if (!sameValue(value, nextStore[key])) {
        changedKeys.push(key);
      }
    }
    for (const [key, value] of Object.entries(nextStore)) {
      if (!this.cache.has(key) || !sameValue(this.cache.get(key), value)) {
        changedKeys.push(key);
      }
    }

    this.cache = new Map(Object.entries(nextStore));
    for (const key of changedKeys) {
      this.enqueueWrite(key, nextStore[key], this.synced.get(key));
    }
    for (const key of removedKeys) {
      this.enqueueDelete(key);
    }
    return true;
  }

  writeLocal(key, value) {
    try {
      this.local.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}
