import type { StorageLike } from './domain.js';

export type BackendSyncStatus =
  | 'connecting'
  | 'offline'
  | 'online'
  | 'unauthorized';

export interface BackendStoreTransport {
  fetchStore(): Promise<Record<string, unknown[]>>;
  writeKey(key: string, value: unknown[]): Promise<void>;
  deleteKey?(key: string): Promise<void>;
  writeAll(store: Record<string, unknown[]>): Promise<void>;
}

export interface BackendStorageOptions {
  transport: BackendStoreTransport;
  /** 本地回退存储（localStorage），离线模式读写、首次迁移数据源。 */
  local: StorageLike;
  onStatus?: (status: BackendSyncStatus) => void;
  onWriteFailure?: (message: string) => void;
  /** 首次接入时把本地数据导入后端 */
  migrateOnEmpty?: boolean;
}

export interface BackendInitResult {
  migrated: boolean;
  keyCount: number;
  status: BackendSyncStatus;
}

export class BackendStorage implements StorageLike {
  /** 最近一次同步是否失败（用于 UI 提示）。 */
  lastError: null | string;
  status: BackendSyncStatus;
  constructor(options: BackendStorageOptions);
  getItem(key: string): null | string;
  init(): Promise<BackendInitResult>;
  setItem(key: string, value: string): boolean;
}
