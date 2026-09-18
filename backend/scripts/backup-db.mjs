#!/usr/bin/env node
/**
 * 备份 SQLite 数据文件（Saa.SensorSelection.Api/App_Data/symtek.db）到仓库根 backups/，
 * 保留最近 KEEP 份（默认 10）。
 *
 * 数据库启用了 WAL：最近提交的数据可能还在 symtek.db-wal 中，直接复制 symtek.db
 * 会丢数据甚至得到不一致的库。因此优先用 SQLite 的 VACUUM INTO 生成一致快照
 * （Node 22.13+ 内置 node:sqlite，后端运行中也可安全执行）；更旧的 Node 退回为
 * 同时复制主库与 -wal 文件，打开备份时 SQLite 会自动回放 WAL。
 *
 * 用法：
 *   pnpm run backup:db
 *   KEEP=30 pnpm run backup:db
 *   BACKUP_DIR=/data/saa-sensor-selection-backups pnpm run backup:db
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const repoRoot = resolve(backendRoot, '..');
const dbPath = join(backendRoot, 'Saa.SensorSelection.Api', 'App_Data', 'symtek.db');
const backupDir = resolve(process.env.BACKUP_DIR || join(repoRoot, 'backups'));
const keep = Number(process.env.KEEP || 10);

if (!Number.isSafeInteger(keep) || keep <= 0) {
  console.error(`KEEP 必须是正整数，当前: ${process.env.KEEP}`);
  process.exit(1);
}

if (!existsSync(dbPath)) {
  console.error(`未找到数据库文件：${dbPath}`);
  process.exit(1);
}

mkdirSync(backupDir, { recursive: true });

const now = new Date();
const pad = (value) => String(value).padStart(2, '0');
const stamp =
  `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
  `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const target = join(backupDir, `saa-sensor-selection-${stamp}.db`);

async function loadSqlite() {
  try {
    return await import('node:sqlite');
  } catch {
    return null;
  }
}

const sqlite = await loadSqlite();
if (sqlite) {
  const db = new sqlite.DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA busy_timeout = 30000');
    db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  } finally {
    db.close();
  }
  console.log(`已备份到 ${target}`);
} else {
  copyFileSync(dbPath, target);
  if (existsSync(`${dbPath}-wal`)) copyFileSync(`${dbPath}-wal`, `${target}-wal`);
  console.warn(
    '当前 Node 不支持 node:sqlite，已同时复制主库与 WAL 文件；' +
      '备份期间若有写入仍可能不一致，建议升级到 Node 22.13+ 或先停止后端。',
  );
  console.log(`已备份到 ${target}`);
}

const pattern = /^saa-sensor-selection-\d{8}-\d{6}\.db$/;
const backups = readdirSync(backupDir)
  .filter((name) => pattern.test(name))
  .sort()
  .reverse();

for (const stale of backups.slice(keep)) {
  rmSync(join(backupDir, stale));
  rmSync(join(backupDir, `${stale}-wal`), { force: true });
}
if (backups.length > keep) {
  console.log(`已清理 ${backups.length - keep} 份旧备份（保留 ${keep} 份）`);
} else {
  console.log(`当前共 ${backups.length} 份备份（上限 ${keep} 份）`);
}
