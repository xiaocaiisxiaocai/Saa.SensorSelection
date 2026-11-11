import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '@/api';

import { useTableColumnSettingsStore } from './table-column-settings';

describe('table column settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('rolls consecutive failed saves back to the last confirmed settings', async () => {
    vi.spyOn(api, 'getKey').mockResolvedValue([]);
    vi.spyOn(api, 'putKey').mockRejectedValue(new Error('save failed'));
    const store = useTableColumnSettingsStore();
    await store.ensureLoaded();

    const first = store.setVisible('sensors', 'brand', false);
    const second = store.setVisible('sensors', 'model', false);

    await expect(first).rejects.toThrow('save failed');
    await expect(second).rejects.toThrow('save failed');
    expect([...store.hiddenColumns('sensors')]).toEqual([]);
  });

  it('keeps the last successful snapshot when a later save fails', async () => {
    vi.spyOn(api, 'getKey').mockResolvedValue([]);
    const put = vi
      .spyOn(api, 'putKey')
      .mockImplementationOnce(async (_key, value) => value)
      .mockRejectedValueOnce(new Error('save failed'));
    const store = useTableColumnSettingsStore();
    await store.ensureLoaded();

    await store.setVisible('sensors', 'brand', false);
    await expect(store.setVisible('sensors', 'model', false)).rejects.toThrow(
      'save failed',
    );
    expect([...store.hiddenColumns('sensors')]).toEqual(['brand']);
    expect(put).toHaveBeenNthCalledWith(
      1,
      'table-columns:global',
      [{ hidden: ['brand'], tableId: 'sensors' }],
      undefined,
      [],
    );
    expect(put).toHaveBeenNthCalledWith(
      2,
      'table-columns:global',
      [{ hidden: ['brand', 'model'], tableId: 'sensors' }],
      undefined,
      [{ hidden: ['brand'], tableId: 'sensors' }],
    );
  });

  it('refreshes after a conflict and cancels snapshots queued from the stale value', async () => {
    const initial = [{ hidden: ['email'], tableId: 'users' }];
    const external = [{ hidden: ['department'], tableId: 'users' }];
    vi.spyOn(api, 'getKey')
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(external);
    const put = vi
      .spyOn(api, 'putKey')
      .mockRejectedValueOnce(
        new ApiError('error', '数据已被其他用户修改，请刷新后重试', 409),
      )
      .mockImplementationOnce(async (_key, value) => value);
    const store = useTableColumnSettingsStore();
    await store.ensureLoaded();

    const conflicted = store.setVisible('users', 'name', false);
    const staleQueued = store.setVisible('users', 'role', false);

    await expect(conflicted).rejects.toMatchObject({ status: 409 });
    await expect(staleQueued).rejects.toMatchObject({ status: 409 });
    expect(put).toHaveBeenCalledTimes(1);
    expect([...store.hiddenColumns('users')]).toEqual(['department']);

    await store.setVisible('users', 'name', false);
    expect(put).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenLastCalledWith(
      'table-columns:global',
      [{ hidden: ['department', 'name'], tableId: 'users' }],
      undefined,
      external,
    );
  });
});
