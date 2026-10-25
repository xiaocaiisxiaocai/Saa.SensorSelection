import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '@/api';
import { MACHINE_TAB_PAGE_OWNER, STORAGE_KEY } from '@/domain';
import {
  currentOperation,
  operationHeaders,
  runAsOperation,
  type AuditOperation,
} from '@/api/audit-operation';
import { OPERATION_LABELS } from './operation-labels';
import { useSelectionStore } from './selection';

describe('selection store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    window.localStorage.clear();
    vi.spyOn(api, 'putKey').mockResolvedValue([]);
    vi.spyOn(api, 'putEntityGroups').mockResolvedValue(undefined);
    vi.spyOn(api, 'replaceAll').mockResolvedValue(undefined);
    vi.spyOn(api, 'deleteKey').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // 写入走 BackendStorage 的串行队列，是纯 Promise 链，不受假计时器
    // 影响。断言完就 return 时这条链可能还没跑完——如果先恢复 mock 再让它继续
    // 跑，剩下的写入会打到真实的 api.putKey 上，产生真实网络请求，还可能把状态
    // 波动带进下一个用例。这里先排空微任务队列，再清掉可能残留的自动重连计时器
    // （比如故意不等待重连的用例），最后才恢复 mock/真实计时器。
    for (let i = 0; i < 50; i += 1) {
      await Promise.resolve();
    }
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('bumps revision after a successful write', () => {
    const store = useSelectionStore();
    const before = store.revision;
    const result = store.saveEntityGroup('customer', { name: '测试区' });
    expect(result.ok).toBe(true);
    expect(store.revision).toBe(before + 1);
    expect(
      store.entityGroups('customer').some((group) => group.name === '测试区'),
    ).toBe(true);
  });

  it('goes online when the store endpoint succeeds', async () => {
    vi.spyOn(api, 'getStore').mockResolvedValue({
      'entity-groups:customer': [],
    });
    const store = useSelectionStore();
    await store.initBackend();
    expect(store.backendStatus).toBe('online');
  });

  it('renders demo records only when they come from the backend store', async () => {
    vi.spyOn(api, 'getStore').mockResolvedValue({
      'entity-groups:customer': [{ name: '演示客户', items: ['客户A'] }],
      'entity-groups:machine': [{ name: '输送机构', items: ['演示机型'] }],
      'dict:sensor-status': [{ id: 1, name: '现用', sort: 1 }],
      'dict:sensor-type': [{ id: 1, name: '漫反射', sort: 1 }],
      'sensor-catalog:all': [
        {
          id: 1,
          model: 'BACKEND-E3Z',
          brand: 'OMRON',
          sensorType: '漫反射',
          status: '现用',
        },
      ],
    });
    const store = useSelectionStore();

    await store.initBackend();

    // 旧目录没有 regions：叶子名就是区域
    expect(store.entityGroups('customer')).toEqual([
      { name: '演示客户', items: ['客户A'], regions: { 客户A: '客户A' } },
    ]);
    expect(store.entityGroups('machine')).toContainEqual(
      expect.objectContaining({
        name: '输送机构',
        items: ['演示机型'],
        machineType: 'mechanism',
      }),
    );
    expect(store.sensors[0]?.model).toBe('BACKEND-E3Z');
  });

  it('deduplicates concurrent backend initialization', async () => {
    let resolveStore!: (store: Record<string, unknown[]>) => void;
    const getStore = vi.spyOn(api, 'getStore').mockImplementation(
      () =>
        new Promise<Record<string, unknown[]>>((resolve) => {
          resolveStore = resolve;
        }),
    );
    const store = useSelectionStore();

    const first = store.initBackend();
    const second = store.initBackend();
    const ensured = store.ensureBackendInit();
    await vi.waitFor(() => expect(getStore).toHaveBeenCalledTimes(1));
    resolveStore({ 'entity-groups:customer': [] });
    await Promise.all([first, second, ensured]);

    expect(getStore).toHaveBeenCalledTimes(1);
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
          (item) => 'content' in item && item.content === '浏览器本地旧数据',
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

  it('automatically retries and recovers from a connection failure without a manual reconnect', async () => {
    const getStore = vi
      .spyOn(api, 'getStore')
      .mockRejectedValueOnce(new ApiError('offline', '无法连接后端服务'))
      .mockResolvedValueOnce({ 'entity-groups:customer': [] });
    const store = useSelectionStore();

    await store.ensureBackendInit();
    expect(store.backendStatus).toBe('offline');
    expect(getStore).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);

    expect(getStore).toHaveBeenCalledTimes(2);
    expect(store.backendStatus).toBe('online');
  });

  it('backs off exponentially across repeated auto-retry failures', async () => {
    const getStore = vi
      .spyOn(api, 'getStore')
      .mockRejectedValue(new ApiError('offline', '无法连接后端服务'));
    const store = useSelectionStore();

    await store.ensureBackendInit();
    expect(getStore).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(getStore).toHaveBeenCalledTimes(2);

    // 第二次重试前的退避应翻倍到 6s，3s 时不该再次触发
    await vi.advanceTimersByTimeAsync(3000);
    expect(getStore).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(getStore).toHaveBeenCalledTimes(3);

    expect(store.backendStatus).toBe('offline');
  });

  it('auto-retries after a later write failure, not just an initial connection failure', async () => {
    vi.spyOn(api, 'getStore')
      .mockResolvedValueOnce({ 'entity-groups:customer': [] })
      .mockResolvedValueOnce({ 'entity-groups:customer': [] });
    vi.spyOn(api, 'putEntityGroups').mockRejectedValueOnce(
      new ApiError('offline', '无法连接后端服务'),
    );
    const store = useSelectionStore();

    await store.ensureBackendInit();
    expect(store.backendStatus).toBe('online');

    store.saveEntityGroup('customer', { name: '测试区' });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.backendStatus).toBe('offline');

    await vi.advanceTimersByTimeAsync(3000);

    expect(store.backendStatus).toBe('online');
  });

  it('rolls the repository back when a queued write is rejected', async () => {
    vi.spyOn(api, 'getStore').mockResolvedValue({
      'entity-groups:customer': [],
    });
    vi.spyOn(api, 'putEntityGroups').mockRejectedValueOnce(
      new ApiError('error', '数据格式无效', 400),
    );
    const store = useSelectionStore();
    await store.ensureBackendInit();

    expect(store.saveEntityGroup('customer', { name: '测试区' }).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(
      store.entityGroups('customer').some((g) => g.name === '测试区'),
    ).toBe(false);
    expect(store.lastFailure).toBe('storage');
    // 4xx 是确定性的拒绝，不应进入离线、触发重连
    expect(store.backendStatus).toBe('online');
  });

  it('rebuilds the bridge after signing in again from an unauthorized session', async () => {
    const getStore = vi
      .spyOn(api, 'getStore')
      .mockResolvedValue({ 'entity-groups:customer': [] });
    vi.spyOn(api, 'putEntityGroups').mockRejectedValueOnce(
      new ApiError('unauthorized', '登录已失效'),
    );
    const store = useSelectionStore();
    await store.ensureBackendInit();

    store.saveEntityGroup('customer', { name: '测试区' });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.backendStatus).toBe('unauthorized');
    expect(
      store.entityGroups('customer').some((g) => g.name === '测试区'),
    ).toBe(false);

    // 登录页在登录成功后调用 ensureBackendInit
    await store.ensureBackendInit();
    expect(getStore).toHaveBeenCalledTimes(2);
    expect(store.backendStatus).toBe('online');
    expect(store.saveEntityGroup('customer', { name: '测试区' }).ok).toBe(true);
  });

  it('lets queued writes land before reconnecting, and keeps the page mounted', async () => {
    const getStore = vi
      .spyOn(api, 'getStore')
      .mockResolvedValue({ 'entity-groups:customer': [] });
    vi.spyOn(api, 'putEntityGroups').mockRejectedValueOnce(
      new ApiError('offline', '无法连接后端服务'),
    );
    let finishPut!: () => void;
    vi.spyOn(api, 'putKey').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPut = () => resolve([]);
        }),
    );
    const store = useSelectionStore();
    await store.ensureBackendInit();
    expect(store.hasConnected).toBe(true);

    store.saveEntityGroup('customer', { name: '测试区' });
    store.saveDictionaryItem('sensor-type', { name: '漫反射' });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.backendStatus).toBe('offline');

    await vi.advanceTimersByTimeAsync(3000);
    expect(store.backendStatus).toBe('connecting');
    expect(getStore).toHaveBeenCalledTimes(1);
    expect(store.hasConnected).toBe(true);

    finishPut();
    await vi.advanceTimersByTimeAsync(0);
    expect(getStore).toHaveBeenCalledTimes(2);
    expect(store.backendStatus).toBe('online');
  });

  it('does not auto-retry while the session is unauthorized', async () => {
    const getStore = vi
      .spyOn(api, 'getStore')
      .mockRejectedValue(new ApiError('unauthorized', '登录已失效'));
    const store = useSelectionStore();

    await store.ensureBackendInit();
    expect(store.backendStatus).toBe('unauthorized');
    expect(getStore).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(getStore).toHaveBeenCalledTimes(1);
  });

  it('sends every write of one action under one operation id and label', async () => {
    vi.spyOn(api, 'getStore').mockResolvedValue({
      'entity-groups:customer': [{ name: '演示客户', items: ['华东'] }],
    });
    const store = useSelectionStore();
    await store.initBackend();
    const putGroups = vi.mocked(api.putEntityGroups);
    putGroups.mockClear();

    // 新建厂区、新建客户都要写目录（putEntityGroups）
    expect(
      store.saveEntityItem('customer', {
        category: '演示客户',
        name: '深圳厂',
        region: '华东',
      }).ok,
    ).toBe(true);
    expect(store.saveEntityGroup('customer', { name: '新客户' }).ok).toBe(true);
    // 新建客户会连带归一化机型目录，写入次数不止两次；按名称找各自的操作
    const operationNamed = (label: string) =>
      putGroups.mock.calls
        .map((call) => call[2])
        .find((op) => op?.label === label);
    await vi.waitFor(() =>
      expect(operationNamed('新建客户「新客户」')).toBeTruthy(),
    );

    const itemOperation = operationNamed('新建厂区「深圳厂」');
    const groupOperation = operationNamed('新建客户「新客户」');
    expect(itemOperation?.label).toBe('新建厂区「深圳厂」');
    expect(groupOperation?.label).toBe('新建客户「新客户」');
    // 两次点击是两次操作
    expect(itemOperation?.id).toBeTruthy();
    expect(groupOperation?.id).not.toBe(itemOperation?.id);
  });

  it('names a rename with both the old and the new name', () => {
    expect(
      OPERATION_LABELS.saveEntityItem('customer', { name: '华南' }, '华东'),
    ).toBe('编辑厂区「华东」→「华南」');
    expect(
      OPERATION_LABELS.saveEntityGroup(
        'machine',
        { name: '输送机构' },
        '输送机构',
      ),
    ).toBe('编辑分类「输送机构」');
    expect(
      OPERATION_LABELS.deleteMachineSectionRow(1, MACHINE_TAB_PAGE_OWNER),
    ).toBe('删除选型记录');
  });

  it('shares one operation across all writes made inside it', () => {
    const seen: Array<AuditOperation | null> = [];
    runAsOperation('删除机型「A」', () => {
      seen.push(currentOperation());
      // 嵌套调用沿用外层操作
      runAsOperation('内层', () => seen.push(currentOperation()));
    });
    expect(seen[0]?.label).toBe('删除机型「A」');
    expect(seen[1]).toBe(seen[0]);
    expect(currentOperation()).toBeNull();
    expect(operationHeaders(seen[0])).toEqual({
      'X-Operation-Id': seen[0]!.id,
      'X-Operation-Label': encodeURIComponent('删除机型「A」'),
    });
  });

  it('names every write method in the operation log', () => {
    const store = useSelectionStore();
    const writeMethods = Object.keys(store).filter(
      (name) =>
        /^(save|delete|reorder|replace|move|ensure|import|restore)[A-Z]/.test(
          name,
        ) &&
        name !== 'ensureBackendInit' &&
        typeof (store as unknown as Record<string, unknown>)[name] ===
          'function',
    );
    const missing = writeMethods.filter((name) => !(name in OPERATION_LABELS));
    expect(missing).toEqual([]);
  });
});
