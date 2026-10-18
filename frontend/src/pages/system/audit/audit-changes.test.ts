import { describe, expect, it } from 'vitest';

import type { AuditLogItem, AuditOperationItem } from '@/api';

import {
  changeSummaryText,
  entryName,
  entryObject,
  operationKindOptions,
  entrySummary,
  fieldLabel,
  operationObject,
  operationSummary,
  operationTitle,
  parseChanges,
  targetNamespace,
} from './audit-changes';

function entry(overrides: Partial<AuditLogItem>): AuditLogItem {
  return {
    action: 'store.upsert',
    detail: '数据类型：数组；记录数：1',
    error: null,
    id: 1,
    ip: '127.0.0.1',
    result: true,
    target: 'customer-req:鹏鼎集团/华东',
    timestamp: '2026-10-14T09:00:00Z',
    username: 'admin',
    ...overrides,
  };
}

function operation(
  entries: AuditLogItem[],
  label: null | string = null,
): AuditOperationItem {
  return {
    displayName: '管理员',
    entries,
    entryCount: entries.length,
    ip: '127.0.0.1',
    label,
    operationId: 'admin:op',
    result: entries.every((item) => item.result),
    timestamp: '2026-10-14T09:00:00Z',
    username: 'admin',
  };
}

const modifiedJson = JSON.stringify({
  added: [],
  removed: [],
  modified: [
    {
      label: '01 sensor标准',
      fields: [
        { name: 'content', before: '旧', after: '新' },
        { name: 'source', before: '02', after: '03' },
      ],
    },
  ],
  addedCount: 0,
  removedCount: 0,
  modifiedCount: 1,
  reordered: false,
  truncated: false,
});

describe('audit changes', () => {
  it('names fields the way each page does', () => {
    expect(fieldLabel('customer-req', 'type')).toBe('要求分类');
    expect(fieldLabel('customer-proc', 'role')).toBe('制程作用');
    expect(fieldLabel('machine-section-rows', 'role')).toBe('Sensor名称');
    expect(fieldLabel(null, 'content')).toBe('要求内容');
    expect(fieldLabel(null, 'unknownField')).toBe('unknownField');
    expect(targetNamespace('entity-groups:machine')).toBe(
      'entity-groups:machine',
    );
    expect(targetNamespace('customer-req:A/B')).toBe('customer-req');
    expect(targetNamespace('admin')).toBeNull();
  });

  it('summarises modified, added, removed and reordered rows in one line', () => {
    expect(changeSummaryText(parseChanges(modifiedJson)!, 'customer-req')).toBe(
      '修改「01 sensor标准」：要求内容、来源',
    );
    const many = parseChanges(
      JSON.stringify({
        added: [{ label: 'A', fields: [] }],
        removed: [
          { label: 'B', fields: [] },
          { label: 'C', fields: [] },
          { label: 'D', fields: [] },
        ],
        modified: [],
        addedCount: 1,
        removedCount: 3,
        modifiedCount: 0,
        reordered: false,
        truncated: false,
      }),
    )!;
    expect(changeSummaryText(many, null)).toBe(
      '新增「A」；删除 3 条「B」「C」 等',
    );
    expect(parseChanges('not json')).toBeNull();
  });

  it('hides uninformative legacy details and shows failures with their reason', () => {
    expect(entrySummary(entry({}))).toBe('');
    expect(entrySummary(entry({ changes: modifiedJson }))).toBe(
      '修改「01 sensor标准」：要求内容、来源',
    );
    expect(
      entrySummary(entry({ result: false, error: '值必须是 JSON 数组' })),
    ).toBe('失败：值必须是 JSON 数组');
    expect(
      entrySummary(
        entry({
          action: 'auth.login',
          detail: '登录成功；账号：admin',
          target: 'admin',
        }),
      ),
    ).toBe('登录成功');
  });

  it('says an empty delete or an unchanged write had nothing to change', () => {
    const recorded = { operationId: 'admin:op-1', detail: '删除目标：x' };
    expect(entrySummary(entry({ ...recorded, action: 'store.delete' }))).toBe(
      '删除（原本没有内容）',
    );
    expect(entrySummary(entry(recorded))).toBe('内容没有变化');
    // 早期日志没有记明细，不能说成「没有变化」
    expect(
      entrySummary(entry({ action: 'store.delete', operationId: 'legacy-9' })),
    ).toBe('');
  });

  it('names an uploaded file by its file name instead of its id', () => {
    const upload = entry({
      action: 'file.upload',
      detail: '文件名：e2e-sample.png；大小：6775 B',
      target: 'd2159766-e2e7-466a-90d7-5f137d724f5c',
    });
    expect(entryObject(upload)).toBe('e2e-sample.png');
    expect(entryName(upload)).toBe('上传文件 · e2e-sample.png');
  });

  it('names a downloaded file by its file name and merges its filter label', () => {
    const download = entry({
      action: 'file.download',
      detail: '文件名：e2e-sample.png；大小：6775 B',
      target: 'd2159766-e2e7-466a-90d7-5f137d724f5c',
    });
    expect(entryObject(download)).toBe('e2e-sample.png');
    expect(entryName(download)).toBe('下载文件 · e2e-sample.png');
    expect(operationKindOptions(['file.download', '下载文件'])).toEqual([
      {
        label: '下载文件',
        value: '下载文件',
        kinds: ['file.download', '下载文件'],
      },
    ]);
  });

  it('merges filter options that read the same and sorts them', () => {
    expect(
      operationKindOptions([
        '删除机型',
        'file.upload',
        '上传文件',
        'auth.login',
      ]),
    ).toEqual([
      { label: '登录', value: '登录', kinds: ['auth.login'] },
      { label: '删除机型', value: '删除机型', kinds: ['删除机型'] },
      {
        label: '上传文件',
        value: '上传文件',
        kinds: ['file.upload', '上传文件'],
      },
    ]);
  });

  it('titles an operation by its label, falling back to the first action', () => {
    const deleted = operation(
      [
        entry({ action: 'store.delete', target: 'machine-section-rows:1:A' }),
        entry({ action: 'store.delete', target: 'machine-section-rows:2:A' }),
        entry({ target: 'entity-groups:machine' }),
      ],
      '删除机型「A」',
    );
    expect(operationTitle(deleted)).toBe('删除机型「A」');
    expect(operationTitle(operation([entry({ action: 'auth.login' })]))).toBe(
      '登录',
    );
    // 同名目标只算一次
    expect(operationObject(deleted)).toBe('机型选型 · A 等 2 项');
  });

  it('puts the failure first and caps the summary at three parts', () => {
    const failed = operation([
      entry({ changes: modifiedJson }),
      entry({ result: false, error: 'key 不存在' }),
    ]);
    expect(operationSummary(failed)).toBe('失败：key 不存在');
    const parts = ['A', 'B', 'C', 'D'].map((label, index) =>
      entry({
        id: index,
        changes: JSON.stringify({
          added: [{ label, fields: [] }],
          removed: [],
          modified: [],
          addedCount: 1,
          removedCount: 0,
          modifiedCount: 0,
          reordered: false,
          truncated: false,
        }),
      }),
    );
    expect(operationSummary(operation(parts))).toBe(
      '新增「A」；新增「B」；新增「C」；等 4 项改动',
    );
  });
});
