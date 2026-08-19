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

/**
 * 结构化错误分类：
 * - kind='unauthorized'：token 缺失/失效，需要登录
 * - kind='forbidden'：token 有效但缺少权限声明（常见于 RBAC 升级前的旧 token），
 *   在初始化阶段同样视为需要重新登录（拿携带权限声明的新 token）
 */
function isUnauthorized(error) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      (error.kind === 'unauthorized' || error.kind === 'forbidden'),
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
    /** 后端空库且本地无数据时，用于初始化后端的内置基础数据（key → 数组）。 */
    this.seedDefaults = options.seedDefaults;
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
    return {
      migrated: false,
      seeded: false,
      keyCount: 0,
      status: this.status,
    };
  }

  /** StorageLike#getItem。 */
  getItem(key) {
    if (this.status === 'offline') {
      return this.local.getItem(key);
    }
    if (key === STORAGE_KEY) {
      // 缓存按「业务 key」扁平存储，需组装成完整 store 供仓库读取
      const full = {};
      for (const [k, value] of this.cache) full[k] = value;
      if (this.status === 'unauthorized' && Object.keys(full).length === 0) {
        // 未登录且无在线缓存（如启动即 401）：回退读本地缓存
        return this.local.getItem(key);
      }
      return JSON.stringify(full);
    }
    const value = this.cache.get(key);
    if (value === undefined) {
      // 未登录时回退读本地缓存；在线缓存保留已同步数据供只读查看
      if (this.status === 'unauthorized') return this.local.getItem(key);
      return null;
    }
    return JSON.stringify(value);
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
    // 登录失效：切换到未登录状态（引导跳转登录页），缓存保留已同步数据供只读
    if (isUnauthorized(error) && this.status !== 'unauthorized') {
      this.status = 'unauthorized';
      this.emitStatus();
    }
  }

  /**
   * 初始化：拉取后端数据；后端为空且本地有数据时自动迁移，本地也无数据时用
   * 内置基础数据种子导入；种子版本落后时按缺失 key 版本化回填（不覆盖用户数据）；
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
          // 迁移失败：继续按远端空库处理，本地数据保留
        }
      } else if (this.seedDefaults) {
        // 全新环境：把前端内置基础数据（字典/机型结构/Sensor 目录等）导入后端
        try {
          await this.transport.writeAll(this.seedDefaults);
          remote = this.seedDefaults;
          seeded = true;
        } catch {
          // 种子失败：继续按远端空库处理，前端仍按内置默认渲染
        }
      }
    }

    // 版本化回填：远端种子版本落后时，补种缺失的默认 key 并更新版本号，
    // 不覆盖用户已在后端修改/删除过的数据（升级路径）。
    if (this.seedDefaults) {
      const currentVersion =
        Number(remote['meta:seed-version']?.[0]?.version) || 0;
      const seedVersion =
        Number(this.seedDefaults['meta:seed-version']?.[0]?.version) || 0;
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
          // 回填失败不影响本次使用：下次连接会重试
        }
      }
    }

    this.cache = new Map(Object.entries(remote));
    this.synced = cloneMap(this.cache);
    this.status = 'online';
    this.lastError = null;
    this.emitStatus();
    return { migrated, seeded, keyCount: this.cache.size, status: 'online' };
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
    const changedKeys = new Set();
    const removedKeys = [];

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
