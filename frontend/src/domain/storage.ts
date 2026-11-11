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

function parseStoreJson(value: string): Record<string, unknown[]> | null {
  const store = Object.create(null) as Record<string, unknown[]>;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  for (const [key, item] of Object.entries(parsed)) {
    if (!Array.isArray(item)) return null;
    store[key] = item;
  }
  return store;
}

function isUnauthorized(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    (error as { kind?: string }).kind === 'unauthorized',
  );
}

// 写入失败是否意味着后端暂时不可用：网络错误、超时和 5xx 需要重连；
// 4xx 是确定性的拒绝（如校验失败），重试结果不会变，只回滚该 key 即可。
// 没有分类信息的异常按不可用处理，交给重连路径整体重新对齐。
function isTransient(error: unknown): boolean {
  if (!error || typeof error !== 'object') return true;
  const { kind, status } = error as { kind?: string; status?: number };
  if (kind === 'forbidden') return false;
  if (kind === 'offline') return true;
  if (kind === 'error' && typeof status === 'number') {
    return status >= 500 || status === 409 || status === 412;
  }
  return true;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export class BackendStorage implements StorageLike {
  lastError: null | string = null;
  status: BackendSyncStatus = 'connecting';
  queue: Promise<void> = Promise.resolve();
  pendingWrites = 0;

  private readonly transport: BackendStoreTransport;
  private readonly local?: StorageLike;
  private readonly onStatus?: (status: BackendSyncStatus) => void;
  private readonly onWriteFailure?: (message: string) => void;
  private readonly onWriteSuccess?: (snapshot: string) => void;
  private readonly onPendingChange?: (count: number) => void;
  private readonly captureContext?: () => unknown;
  private readonly migrateOnEmpty: boolean;
  private readonly seedDefaults?: Record<string, unknown[]>;
  private readonly seedMigration?: BackendStorageOptions['seedMigration'];
  private cache = new Map<string, unknown[]>();
  private localSnapshotDisabled = false;
  private synced = new Map<string, unknown[]>();
  private generation = 0;

  constructor(options: BackendStorageOptions) {
    this.transport = options.transport;
    this.local = options.local;
    this.onStatus = options.onStatus;
    this.onWriteFailure = options.onWriteFailure;
    this.onWriteSuccess = options.onWriteSuccess;
    this.onPendingChange = options.onPendingChange;
    this.captureContext = options.captureContext;
    this.migrateOnEmpty = options.migrateOnEmpty !== false;
    this.seedDefaults = options.seedDefaults;
    this.seedMigration = options.seedMigration;
  }

  private emitStatus() {
    this.onStatus?.(this.status);
  }

  private enqueueChanges(values: Map<string, unknown[] | null>) {
    const context = this.captureContext?.();
    const generation = this.generation;
    this.pendingWrites += 1;
    this.onPendingChange?.(this.pendingWrites);
    this.queue = this.queue.then(async () => {
      try {
        // 后续操作以失败操作的乐观状态为基础，不能继续提交或删除其依赖的数据。
        if (generation !== this.generation) return;
        let returned: Record<string, unknown[] | null>;
        if (this.transport.writeBatch) {
          returned = await this.transport.writeBatch(
            [...values].map(([key, value]) => ({
              key,
              expected: this.synced.get(key) ?? null,
              value,
            })),
            context,
          );
        } else {
          // 兼容旧的单键测试/存储适配器；多键变更在入队前明确拒绝。
          const [key, value] = [...values][0]!;
          if (value === null) {
            if (!this.transport.deleteKey) throw new Error('存储不支持删除');
            await this.transport.deleteKey(key, context);
            returned = { [key]: null };
          } else {
            const result = await this.transport.writeKey(key, value, context);
            returned = { [key]: Array.isArray(result) ? result : value };
          }
        }
        for (const [key, attempted] of values) {
          if (!Object.hasOwn(returned, key))
            throw new Error('保存响应缺少数据键');
          const persisted = returned[key];
          if (persisted !== null && !Array.isArray(persisted))
            throw new Error('保存响应格式错误');
          if (persisted === null) this.synced.delete(key);
          else this.synced.set(key, persisted);
          if (sameValue(this.cache.get(key) ?? null, attempted)) {
            if (persisted === null) this.cache.delete(key);
            else this.cache.set(key, persisted);
          }
        }
        this.markWriteSucceeded();
        this.onWriteSuccess?.(this.readStoreJson());
      } catch (error) {
        this.handleFailure(error);
      } finally {
        this.pendingWrites -= 1;
        this.onPendingChange?.(this.pendingWrites);
      }
    });
  }

  async waitForPendingWrites(): Promise<boolean> {
    const generation = this.generation;
    await this.queue;
    return generation === this.generation && this.lastError === null;
  }

  // 重连只能通过重新读取服务端快照恢复在线，不能由旧队列回调恢复。
  private markWriteSucceeded() {
    if (this.status !== 'online') return;
    this.lastError = null;
    this.snapshotLocal();
  }

  private markUnavailable(error: unknown): BackendInitResult {
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
    if (this.status !== 'online') return null;
    if (key === STORAGE_KEY) return this.readStoreJson();
    const value = this.cache.get(key);
    if (value === undefined) return null;
    return JSON.stringify(value);
  }

  private handleFailure(error: unknown) {
    this.generation += 1;
    this.cache = cloneMap(this.synced);
    const message = errorMessage(error, '写入后端失败');
    this.lastError = message;
    // 先切换状态再回调：回调方会按回滚后的缓存重建仓库内存态，需要看到最终状态。
    const previousStatus = this.status;
    if (isUnauthorized(error)) {
      this.status = 'unauthorized';
    } else if (isTransient(error)) {
      this.status = 'offline';
    }
    this.onWriteFailure?.(message);
    if (this.status !== previousStatus) this.emitStatus();
  }

  /** 当前缓存的完整快照（不论在线状态），写入失败回滚后供仓库重建内存态。 */
  readStoreJson(): string {
    const full = Object.create(null) as Record<string, unknown[]>;
    for (const [key, value] of this.cache) full[key] = value;
    return JSON.stringify(full);
  }

  async init(): Promise<BackendInitResult> {
    this.status = 'connecting';
    this.emitStatus();

    let remote: Record<string, unknown[]>;
    try {
      remote = await this.transport.fetchStore();
    } catch (error) {
      return this.markUnavailable(error);
    }

    const remoteKeys = Object.keys(remote);
    let migrated = false;
    let seeded = false;
    if (this.migrateOnEmpty && remoteKeys.length === 0) {
      const localStore = parsePersistedStore(
        this.local?.getItem(STORAGE_KEY) ?? null,
      );
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
          (
            remote['meta:seed-version']?.[0] as
              { version?: unknown } | undefined
          )?.version,
        ) || 0;
      const seedVersion =
        Number(
          (
            this.seedDefaults['meta:seed-version']?.[0] as
              { version?: unknown } | undefined
          )?.version,
        ) || 0;
      if (seedVersion > currentVersion) {
        let canAdvanceSeedVersion = true;
        if (this.seedMigration) {
          try {
            const migration = this.seedMigration(
              remote,
              currentVersion,
              seedVersion,
            );
            if (migration.changed) {
              for (const [key, value] of Object.entries(migration.store)) {
                if (sameValue(remote[key], value)) continue;
                await this.transport.writeKey(key, value);
              }
              for (const key of Object.keys(remote)) {
                if (key in migration.store) continue;
                if (!this.transport.deleteKey) {
                  throw new Error(`无法迁移需删除的旧数据键: ${key}`);
                }
                await this.transport.deleteKey(key);
              }
              remote = migration.store;
            }
          } catch {
            canAdvanceSeedVersion = false;
          }
        }
        if (!canAdvanceSeedVersion) {
          // 保留旧版本号，下次连接时继续执行幂等迁移。
          this.cache = new Map(Object.entries(remote));
          this.synced = cloneMap(this.cache);
          this.status = 'online';
          this.lastError = null;
          this.snapshotLocal();
          this.emitStatus();
          return {
            migrated,
            seeded,
            keyCount: this.cache.size,
            status: 'online',
          };
        }
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
    if (this.status !== 'online') {
      return false;
    }
    if (key === STORAGE_KEY) {
      const next = parseStoreJson(value);
      return next !== null && this.syncStore(next);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return false;
    }
    if (!Array.isArray(parsed)) return false;
    if (!this.cache.has(key) && parsed.length === 0) return true;
    if (sameValue(this.cache.get(key), parsed)) return true;
    this.cache.set(key, parsed);
    this.enqueueChanges(new Map([[key, parsed]]));
    return true;
  }

  snapshotLocal() {
    if (!this.local || this.status !== 'online' || this.localSnapshotDisabled) {
      return;
    }
    try {
      this.local.setItem(STORAGE_KEY, this.readStoreJson());
    } catch {
      // A backend snapshot can be much larger than localStorage's quota. Retrying
      // the same full serialization after every CRUD write blocks the UI again.
      // A fresh bridge (page reload/reconnect) gets one new recovery attempt.
      this.localSnapshotDisabled = true;
    }
  }

  private syncStore(nextStore: Record<string, unknown[]>): boolean {
    const changedKeys = new Set<string>();
    const removedKeys: string[] = [];

    for (const key of this.cache.keys()) {
      if (!(key in nextStore)) removedKeys.push(key);
    }
    const nextCache = new Map<string, unknown[]>();
    for (const [key, value] of Object.entries(nextStore)) {
      // 仓库的读取路径会为没有数据的组合补出空数组（如遍历全部机型 × 分区）。
      // 后端不存在与空数组等价，推送它们只会在下一次真实保存时排出成百上千个
      // 空 PUT 和审计日志，所以这类 key 既不推送也不进缓存。
      if (!this.cache.has(key) && value.length === 0) continue;
      nextCache.set(key, value);
      if (!sameValue(this.cache.get(key), value)) changedKeys.add(key);
    }

    const changes = new Map<string, unknown[] | null>();
    for (const key of changedKeys)
      changes.set(key, nextStore[key] as unknown[]);
    for (const key of removedKeys) changes.set(key, null);
    if (changes.size > 1 && !this.transport.writeBatch) return false;
    this.cache = nextCache;
    if (changes.size > 0) this.enqueueChanges(changes);
    return true;
  }
}
