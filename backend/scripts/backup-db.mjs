#!/usr/bin/env node
/**
 * Use SQLite VACUUM INTO to create a consistent, verified database snapshot.
 * No file-copy fallback is permitted because a live database and its WAL can
 * change between independent copies.
 */
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const backendRoot = resolve(dirname(scriptPath), '..');
const repoRoot = resolve(backendRoot, '..');
const apiRoot = join(backendRoot, 'Saa.SensorSelection.Api');
const DEFAULT_DB_PATH = join(apiRoot, 'App_Data', 'symtek.db');
const BACKUP_PATTERN = /^saa-sensor-selection-\d{8}-\d{6}(?:-\d{3}-\d{4})?\.db$/;
const LOCK_FILE_NAME = '.saa-sensor-selection-backup.lock';

export function parseSqliteDataSource(connectionString) {
  if (!connectionString?.trim()) return null;
  for (const segment of connectionString.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 0) continue;
    const key = segment.slice(0, separator).trim().toLowerCase();
    if (key !== 'data source' && key !== 'datasource' && key !== 'filename') continue;
    const value = segment.slice(separator + 1).trim();
    if (!value || value === ':memory:' || value.startsWith('file:')) {
      throw new Error('备份仅支持本地 SQLite 文件路径');
    }
    return value;
  }
  throw new Error('连接串缺少 SQLite Data Source');
}

export function resolveDatabasePath(environment = process.env) {
  const explicit = environment.DB_PATH?.trim();
  const configured = explicit || parseSqliteDataSource(environment.ConnectionStrings__Default);
  if (!configured) return DEFAULT_DB_PATH;
  return isAbsolute(configured) ? resolve(configured) : resolve(apiRoot, configured);
}

function timestamp(date) {
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` +
    `-${pad(date.getMilliseconds(), 3)}`
  );
}

export function nextBackupPath(backupDir, date = new Date()) {
  const stem = `saa-sensor-selection-${timestamp(date)}`;
  let suffix = 0;
  let candidate = join(backupDir, `${stem}-${String(suffix).padStart(4, '0')}.db`);
  while (existsSync(candidate)) {
    suffix += 1;
    if (suffix > 9999) throw new Error('同一毫秒产生的备份数量超出限制');
    candidate = join(backupDir, `${stem}-${String(suffix).padStart(4, '0')}.db`);
  }
  return candidate;
}

function quoteSqlite(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function assertIntegrity(sqlite, target) {
  const snapshot = new sqlite.DatabaseSync(target, { readOnly: true });
  try {
    const rows = snapshot.prepare('PRAGMA integrity_check').all();
    if (rows.length !== 1 || Object.values(rows[0] ?? {})[0] !== 'ok') {
      throw new Error('SQLite integrity_check 未通过');
    }
  } finally {
    snapshot.close();
  }
}

export async function loadSqlite() {
  try {
    return await import('node:sqlite');
  } catch {
    return null;
  }
}

export async function runBackup({
  environment = process.env,
  now = new Date(),
  sqlite: injectedSqlite,
} = {}) {
  const keep = Number(environment.KEEP || 10);
  if (!Number.isSafeInteger(keep) || keep <= 0) {
    throw new Error(`KEEP 必须是正整数，当前: ${environment.KEEP ?? ''}`);
  }

  const dbPath = resolveDatabasePath(environment);
  if (!existsSync(dbPath)) throw new Error(`未找到数据库文件：${dbPath}`);

  const sqlite = injectedSqlite === undefined ? await loadSqlite() : injectedSqlite;
  if (!sqlite?.DatabaseSync) {
    throw new Error(
      '当前 Node.js 不支持 node:sqlite，已拒绝不一致的文件复制备份；' +
        '请使用 Node.js 22.13+，或由 SQLite 备份工具生成一致快照。',
    );
  }

  const backupDir = resolve(environment.BACKUP_DIR || join(repoRoot, 'backups'));
  mkdirSync(backupDir, { recursive: true });
  const lockPath = join(backupDir, LOCK_FILE_NAME);
  let lockDescriptor;
  try {
    lockDescriptor = openSync(lockPath, 'wx');
    writeFileSync(
      lockDescriptor,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    );
  } catch (error) {
    if (lockDescriptor !== undefined) {
      try {
        closeSync(lockDescriptor);
      } finally {
        rmSync(lockPath, { force: true });
      }
    }
    throw new Error(`备份目录已有运行中或待人工确认的锁：${lockPath}`, { cause: error });
  }

  try {
    const target = nextBackupPath(backupDir, now);
    const source = new sqlite.DatabaseSync(dbPath);
    try {
      source.exec('PRAGMA busy_timeout = 30000');
      source.exec(`VACUUM INTO ${quoteSqlite(target)}`);
      assertIntegrity(sqlite, target);
    } catch (error) {
      rmSync(target, { force: true });
      throw error;
    } finally {
      source.close();
    }

    const backups = readdirSync(backupDir)
      .filter((name) => BACKUP_PATTERN.test(name))
      .map((name) => ({ name, modified: statSync(join(backupDir, name)).mtimeMs }))
      .sort((left, right) => right.modified - left.modified || right.name.localeCompare(left.name));
    for (const stale of backups.slice(keep)) rmSync(join(backupDir, stale.name));

    return {
      backupCount: Math.min(backups.length, keep),
      dbPath,
      removed: Math.max(0, backups.length - keep),
      target,
    };
  } finally {
    try {
      closeSync(lockDescriptor);
    } finally {
      rmSync(lockPath, { force: true });
    }
  }
}

async function main() {
  try {
    const result = await runBackup();
    console.log(`已通过 SQLite 一致快照备份到 ${result.target}`);
    console.log(`当前共 ${result.backupCount} 份备份（上限 ${process.env.KEEP || 10} 份）`);
    if (result.removed > 0) console.log(`已清理 ${result.removed} 份旧备份`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
