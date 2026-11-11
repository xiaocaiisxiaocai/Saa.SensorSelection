import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  nextBackupPath,
  parseSqliteDataSource,
  resolveDatabasePath,
  runBackup,
} from './backup-db.mjs';

function createWorkspace() {
  const root = join(
    tmpdir(),
    `saa-backup-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const source = join(root, 'source.db');
  const backups = join(root, 'backups');
  mkdirSync(root, { recursive: true });
  const db = new DatabaseSync(source);
  db.exec('CREATE TABLE Records (Id INTEGER PRIMARY KEY, Value TEXT NOT NULL)');
  db.prepare('INSERT INTO Records (Value) VALUES (?)').run('safe');
  db.close();
  return { backups, root, source };
}

test('parses explicit SQLite paths without accepting memory or URI sources', () => {
  assert.equal(
    parseSqliteDataSource('Data Source=C:\\data\\symtek.db;Cache=Shared'),
    'C:\\data\\symtek.db',
  );
  assert.equal(parseSqliteDataSource('Filename=relative.db'), 'relative.db');
  assert.throws(() => parseSqliteDataSource('Data Source=:memory:'), /本地 SQLite/);
  assert.throws(() => parseSqliteDataSource('Mode=ReadWrite'), /Data Source/);
});

test('DB_PATH takes precedence over the configured connection string', () => {
  const expected = resolve('preferred.db');
  assert.equal(
    resolveDatabasePath({
      DB_PATH: expected,
      ConnectionStrings__Default: 'Data Source=ignored.db',
    }),
    expected,
  );
});

test('refuses backup without node:sqlite and does not create or rotate backups', async () => {
  const workspace = createWorkspace();
  try {
    await assert.rejects(
      runBackup({
        environment: { BACKUP_DIR: workspace.backups, DB_PATH: workspace.source, KEEP: '1' },
        sqlite: null,
      }),
      /拒绝不一致/,
    );
    assert.deepEqual(readdirSync(workspace.root).sort(), ['source.db']);
  } finally {
    rmSync(workspace.root, { force: true, recursive: true });
  }
});

test('creates a verified snapshot, keeps unique names and rotates only after success', async () => {
  const workspace = createWorkspace();
  try {
    const environment = { BACKUP_DIR: workspace.backups, DB_PATH: workspace.source, KEEP: '2' };
    const fixed = new Date(2026, 10, 10, 9, 8, 7, 6);
    const first = await runBackup({ environment, now: fixed, sqlite: { DatabaseSync } });
    const second = await runBackup({ environment, now: fixed, sqlite: { DatabaseSync } });
    const third = await runBackup({ environment, now: fixed, sqlite: { DatabaseSync } });
    assert.notEqual(first.target, second.target);
    assert.notEqual(second.target, third.target);
    const files = readdirSync(workspace.backups).sort();
    assert.equal(files.length, 2);
    assert.equal(files.includes(first.target.split(/[\\/]/).at(-1)), false);
    for (const file of files) {
      const db = new DatabaseSync(join(workspace.backups, file), { readOnly: true });
      try {
        assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
        assert.equal(db.prepare('SELECT Value FROM Records').get().Value, 'safe');
      } finally {
        db.close();
      }
    }
  } finally {
    rmSync(workspace.root, { force: true, recursive: true });
  }
});

test('cleans its partial target and keeps existing good backups when VACUUM fails', async () => {
  const workspace = createWorkspace();
  try {
    const environment = {
      BACKUP_DIR: workspace.backups,
      DB_PATH: workspace.source,
      KEEP: '1',
    };
    await runBackup({ environment, sqlite: { DatabaseSync } });
    const before = readdirSync(workspace.backups).sort();

    class FailingDatabase {
      constructor() {}
      exec(sql) {
        if (!sql.startsWith('VACUUM INTO ')) return;
        const target = sql.slice('VACUUM INTO '.length + 1, -1).replaceAll("''", "'");
        writeFileSync(target, 'partial snapshot owned by this test process');
        throw new Error('injected VACUUM failure');
      }
      close() {}
    }

    await assert.rejects(
      runBackup({ environment, sqlite: { DatabaseSync: FailingDatabase } }),
      /injected VACUUM failure/,
    );
    assert.deepEqual(readdirSync(workspace.backups).sort(), before);
  } finally {
    rmSync(workspace.root, { force: true, recursive: true });
  }
});

test('refuses a concurrent or stale directory lock without creating a target', async () => {
  const workspace = createWorkspace();
  try {
    mkdirSync(workspace.backups, { recursive: true });
    writeFileSync(
      join(workspace.backups, '.saa-sensor-selection-backup.lock'),
      'owned by another process',
    );
    const before = readdirSync(workspace.backups).sort();
    await assert.rejects(
      runBackup({
        environment: {
          BACKUP_DIR: workspace.backups,
          DB_PATH: workspace.source,
          KEEP: '1',
        },
        sqlite: { DatabaseSync },
      }),
      /备份目录已有运行中或待人工确认的锁/,
    );
    assert.deepEqual(readdirSync(workspace.backups).sort(), before);
  } finally {
    rmSync(workspace.root, { force: true, recursive: true });
  }
});

test('nextBackupPath includes milliseconds and an ordered collision suffix', () => {
  const workspace = createWorkspace();
  try {
    assert.match(nextBackupPath(workspace.root, new Date(2026, 0, 1)), /-000-0000\.db$/);
  } finally {
    rmSync(workspace.root, { force: true, recursive: true });
  }
});
