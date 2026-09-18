import { describe, expect, it } from 'vitest';

import { formatAuditTarget } from './audit-target';

describe('formatAuditTarget', () => {
  it('translates store keys into page names and drops internal ids', () => {
    expect(formatAuditTarget('machine-section-rows:1002:E2E机型')).toBe(
      '机型选型 · E2E机型',
    );
    expect(
      formatAuditTarget('machine-section-images:1001:01 单段输送段（搭配）'),
    ).toBe('结构示意图 · 01 单段输送段（搭配）');
    expect(formatAuditTarget('customer-req:鹏鼎集团')).toBe(
      '客户通用要求 · 鹏鼎集团',
    );
  });

  it('shows only the collection name for whole-list keys', () => {
    expect(formatAuditTarget('sensor-catalog:all')).toBe('Sensor 型号');
    expect(formatAuditTarget('process-steps:all')).toBe('工艺制程');
  });

  it('names the entity group being reordered', () => {
    expect(formatAuditTarget('entity-groups:customer')).toBe('客户分类');
    expect(formatAuditTarget('entity-groups:machine')).toBe('机型分类');
  });

  it('keeps non-store targets and unknown keys verbatim', () => {
    expect(formatAuditTarget('admin')).toBe('admin');
    expect(formatAuditTarget('#85')).toBe('#85');
    expect(formatAuditTarget('unknown-space:x')).toBe('unknown-space:x');
    expect(formatAuditTarget('entity-groups:other')).toBe('entity-groups:other');
    expect(formatAuditTarget(null)).toBe('');
    expect(formatAuditTarget('  ')).toBe('');
  });
});
