import { describe, expect, it } from 'vitest';

import { parseAuditDetail } from './audit-actions';

describe('parseAuditDetail', () => {
  it('names permission codes in old login logs and keeps names in new ones', () => {
    expect(parseAuditDetail('权限：selection:read')?.pairs).toEqual([
      { label: '权限', value: '查看业务数据', items: undefined },
    ]);
    expect(
      parseAuditDetail('权限：查看业务数据、编辑业务数据')?.pairs[0]?.items,
    ).toEqual(['查看业务数据', '编辑业务数据']);
    expect(parseAuditDetail('权限：custom:x')?.pairs[0]?.value).toBe(
      'custom:x',
    );
  });
});
