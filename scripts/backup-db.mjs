#!/usr/bin/env node
/**
 * 备份 SQLite 数据文件（backend/Saa.SensorSelection.Api/App_Data/symtek.db）到 backups/，
 * 保留最近 KEEP 份（默认 10）。
 *
 * 用法：
 *   pnpm run backup:db
 *   KEEP=30 pnpm run backup:db          # 保留 30 份
 *   BACKUP_DIR=/data/saa-sensor-selection-backups pnpm run backup:db
 *
 * 说明：直接拷贝主库文件。若后端处于写操作中（WAL 模式），拷贝可能不含
 * 尚未 checkpoint 的尾部数据；对一致性要求高的场景，建议先停后端再备份，
 * 或用 sqlite3 的 VACUUM INTO / .backup 命令。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const dbPath = join(root, 'backend', 'Saa.SensorSelection.Api', 'App_Data', 'symtek.db');
const backupDir = resolve(process.env.BACKUP_DIR || join(root, 'backups'));
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
copyFileSync(dbPath, target);
console.log(`已备份到 ${target}`);

const pattern = /^saa-sensor-selection-\d{8}-\d{6}\.db$/;
const backups = readdirSync(backupDir)
  .filter((name) => pattern.test(name))
  .sort()
  .reverse();

for (const stale of backups.slice(keep)) {
  rmSync(join(backupDir, stale));
}
if (backups.length > keep) {
  console.log(`已清理 ${backups.length - keep} 份旧备份（保留 ${keep} 份）`);
} else {
  console.log(`当前共 ${backups.length} 份备份（上限 ${keep} 份）`);
}
