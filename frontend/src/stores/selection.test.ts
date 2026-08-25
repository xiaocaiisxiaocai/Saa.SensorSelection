import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '@/api';
import { STORAGE_KEY } from '@/domain';
import { useSelectionStore } from './selection';

describe('selection store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    vi.spyOn(api, 'putKey').mockResolvedValue(undefined);
    vi.spyOn(api, 'putEntityGroups').mockResolvedValue(undefined);
    vi.spyOn(api, 'replaceAll').mockResolvedValue(undefined);
    vi.spyOn(api, 'deleteKey').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bumps revision after a successful write', () => {
    const store = useSelectionStore();
    const before = store.revision;
    const result = store.saveEntityGroup('customer', { name: '测试区' });
    expect(result.ok).toBe(true);
    expect(store.revision).toBe(before + 1);
    expect(store.entityGroups('customer').some((group) => group.name === '测试区')).toBe(
      true,
    );
  });

  it('goes online when the store endpoint succeeds', async () => {
    vi.spyOn(api, 'getStore').mockResolvedValue({
      'entity-groups:customer': [],
    });
    const store = useSelectionStore();
    await store.initBackend();
    expect(store.backendStatus).toBe('online');
  });

  it('does not expose browser local data when the backend is unreachable', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        'customer-req:庆鼎': [{ id: 99, content: '浏览器本地旧数据' }],
      }),
    );
    vi.spyOn(api, 'getStore').mockRejectedValue(
      new ApiError('offline', '无法连接后端服务'),
    );
    const store = useSelectionStore();
    await store.initBackend();
    expect(store.backendStatus).toBe('offline');
    expect(
      store
        .crudItems('customer-req', '庆鼎')
        .some(
          (item) =>
            'content' in item && item.content === '浏览器本地旧数据',
        ),
    ).toBe(false);
  });

  it('reconnects after an offline failure', async () => {
    const getStore = vi
      .spyOn(api, 'getStore')
      .mockRejectedValueOnce(new ApiError('offline', '无法连接后端服务'))
      .mockResolvedValueOnce({ 'entity-groups:customer': [] });
    const store = useSelectionStore();
    await store.ensureBackendInit();
    expect(store.backendStatus).toBe('offline');
    await store.reconnect();
    expect(getStore).toHaveBeenCalledTimes(2);
    expect(store.backendStatus).toBe('online');
  });
});
