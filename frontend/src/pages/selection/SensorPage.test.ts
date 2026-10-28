import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, type UserProfile } from '@/api';
import { isSensorStatus } from '@/domain';
import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import type { SensorTableRow } from './sensor/sensor-table';
import {
  activeTabText,
  chooseColumnFilter,
  clickTab,
  findButton,
  findColumn,
  tagColor,
} from '@/test-helpers';
import SensorPage from './SensorPage.vue';

const writer: UserProfile = {
  username: 'admin',
  displayName: '管理员',
  roles: [{ id: 1, code: 'admin', name: '系统管理员' }],
  permissions: ['selection:write', 'data:transfer'],
  orgUnit: null,
};

let columnSettings: unknown[] = [];

async function mountPage(
  query: Record<string, string> = {},
  profile: UserProfile | null = null,
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/selection/sensor', component: SensorPage }],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore(pinia).applyProfile(profile);
  await router.push({ path: '/selection/sensor', query });
  await router.isReady();
  return mount(SensorPage, { global: { plugins: [pinia, router] } });
}

/** 状态列的表头漏斗。空选（filteredValue 为 null）就是分组的「全部」。 */
function statusFilter(wrapper: VueWrapper) {
  return findColumn(wrapper, '状态').column;
}

function searchInput(wrapper: VueWrapper) {
  return wrapper
    .findAllComponents({ name: 'AInput' })
    .find(
      (input) =>
        input.props('placeholder') === '搜索型号',
    )!;
}

function tableRows(wrapper: VueWrapper) {
  return wrapper
    .getComponent({ name: 'ATable' })
    .props('dataSource') as SensorTableRow[];
}

describe('SensorPage', () => {
  it('shows export only with data:transfer and import only with write as well', async () => {
    const guest = await mountPage();
    expect(guest.find('button[aria-label="导出 Excel"]').exists()).toBe(false);
    expect(guest.find('button[aria-label="导入 Excel"]').exists()).toBe(false);
    guest.unmount();

    const transferOnly = await mountPage(
      {},
      { ...writer, permissions: ['data:transfer'] },
    );
    expect(transferOnly.find('button[aria-label="导出 Excel"]').exists()).toBe(
      true,
    );
    expect(transferOnly.find('button[aria-label="导入 Excel"]').exists()).toBe(
      false,
    );
    transferOnly.unmount();

    const both = await mountPage({}, writer);
    expect(both.find('button[aria-label="导入 Excel"]').exists()).toBe(true);
    both.unmount();
  });

  beforeEach(() => {
    window.localStorage.clear();
    message.destroy();
    columnSettings = [];
    vi.spyOn(api, 'getKey').mockImplementation(() =>
      Promise.resolve(columnSettings),
    );
    vi.spyOn(api, 'putKey').mockImplementation(async (_key, value) => {
      columnSettings = structuredClone(value);
      return value;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('separates the model workspace from SOP, 型录 and 3D resources', async () => {
    const wrapper = await mountPage();
    expect(wrapper.get('h1.visually-hidden').text()).toBe('Sensor型号');
    const labels = wrapper
      .findAll('.ant-tabs-tab')
      .map((tab) => tab.text().trim());

    expect(labels).toEqual(['型号', 'SOP', '型录', '3D']);
    expect(wrapper.text()).toContain('现用');
    const status = statusFilter(wrapper);
    expect(
      (status.filters as Array<{ value: string }>).map((item) => item.value),
    ).toEqual(['现用', '备选', '停用']);
    expect(status.filteredValue).toBeNull();
    expect(status.filterSearch).toBeUndefined();
    expect(findColumn(wrapper, '感应器类型').column.filterSearch).toBe(true);
    expect(wrapper.text()).toContain('感应器类型');
    wrapper.unmount();
  });

  it('does not pin a non-leading model column over the preceding columns', async () => {
    const wrapper = await mountPage();
    const table = wrapper.getComponent({ name: 'ATable' });
    const columns = table.props('columns') as Array<{
      key: string;
      fixed?: 'left' | 'right';
    }>;

    expect(
      columns.find((column) => column.key === 'model')?.fixed,
    ).toBeUndefined();
    expect(
      columns.find((column) => column.key === 'images')?.fixed,
    ).toBeUndefined();
    wrapper.unmount();
  });

  it('does not sort the model table from column headers', async () => {
    const columnsOf = (current: VueWrapper) =>
      current.getComponent({ name: 'ATable' }).props('columns') as Array<{
        key: string;
        sortOrder?: unknown;
      }>;
    const keepsStoreOrder = (column: object) =>
      !(
        'sortOrder' in column &&
        (column as { sortOrder?: unknown }).sortOrder != null
      ) &&
      !Object.entries(column).some(
        ([key, value]) =>
          key !== 'sortOrder' &&
          key.toLowerCase().startsWith('sort') &&
          value != null,
      );
    const grouped = await mountPage({ tab: '全部' });
    expect(columnsOf(grouped).every(keepsStoreOrder)).toBe(true);
    const before = tableRows(grouped).map((row) => row.item.model);
    const brandHeader = grouped
      .findAll('th')
      .find((header) => header.text().includes('品牌'));
    await brandHeader!.trigger('click');
    await nextTick();
    expect(tableRows(grouped).map((row) => row.item.model)).toEqual(before);
    grouped.unmount();

    const disabled = await mountPage({ tab: '停用' });
    const disabledColumns = columnsOf(disabled);
    expect(disabledColumns.some((column) => column.key === 'disabledAt')).toBe(
      true,
    );
    expect(disabledColumns.every(keepsStoreOrder)).toBe(true);
    disabled.unmount();
  });

  it('applies administrator column settings and shares them across mounts', async () => {
    const wrapper = await mountPage({ tab: '全部' }, writer);
    await flushPromises();
    const headerLabels = () => wrapper.findAll('th').map((item) => item.text());

    expect(headerLabels()).toContain('规格参数');

    await wrapper.get('[aria-label="管理员设置显示列"]').trigger('click');
    await vi.waitFor(() =>
      expect(
        document.body.querySelector('.ant-popover .ant-checkbox-wrapper'),
      ).not.toBeNull(),
    );
    const specCheckbox = [
      ...document.body.querySelectorAll('.ant-popover .ant-checkbox-wrapper'),
    ]
      .find((item) => item.textContent?.includes('规格参数'))
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(specCheckbox).toBeDefined();
    specCheckbox!.click();
    await flushPromises();

    expect(headerLabels()).not.toContain('规格参数');
    expect(columnSettings).toEqual([
      { tableId: 'sensor-models', hidden: ['spec'] },
    ]);

    wrapper.unmount();

    const reopened = await mountPage({ tab: '全部' }, writer);
    await flushPromises();
    expect(reopened.findAll('th').map((item) => item.text())).not.toContain(
      '规格参数',
    );
    reopened.unmount();
  });

  it('keeps prose-heavy columns wide enough for compact readable rows', async () => {
    const wrapper = await mountPage({}, writer);
    const table = wrapper.getComponent({ name: 'ATable' });
    const columns = table.props('columns') as Array<{
      key: string;
      width?: number;
    }>;

    const width = (key: string) =>
      columns.find((column) => column.key === key)?.width ?? 0;
    expect(width('spec')).toBe(200);
    expect(width('actualCondition')).toBe(200);
    expect(width('usedAt')).toBe(112);
    expect(width('disabledAt')).toBe(112);
    expect(width('enteredAt')).toBe(160);
    expect(width('feature')).toBe(240);
    expect(width('scene')).toBe(180);
    expect(width('actions')).toBe(120);
    // 日期与工况列保留可读宽度，超出可视区时由表格横向滚动。
    expect(
      columns.reduce((sum, column) => sum + (column.width ?? 0), 0),
    ).toBeLessThanOrEqual(2300);
    // 长描述列完整显示不截断，宽度要从内容很短的列里匀过来
    for (const short of ['relation', 'sop', 'model3d']) {
      expect(width(short)).toBeLessThan(width('scene'));
    }
    wrapper.unmount();
  });

  it('renders the SOP PDF workspace from its tab', async () => {
    const wrapper = await mountPage({ tab: 'sop-library' }, writer);
    // 可写用户在空列表下看到的就是上传区本身，不再额外挂一句「暂无 SOP 文件」
    // 把同一件事说两遍；一个文件都没有时也不显示搜索框。
    expect(wrapper.text()).toContain('点击或将文件拖到此处上传');
    expect(wrapper.text()).toContain('仅支持 PDF，不超过 8 MB');
    expect(wrapper.text()).not.toContain('暂无 SOP 文件');
    expect(wrapper.find('[aria-label="搜索 SOP 文件"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('previews PDF files from the SOP workspace', async () => {
    const wrapper = await mountPage({ tab: 'sop-library' }, writer);
    const store = useSelectionStore();
    expect(
      store.saveSensorSopFile({
        dataUrl: 'data:application/pdf;base64,YQ==',
        fileName: '安装作业.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        title: '安装作业',
        uploadedAt: '2026-08-28T00:00:00.000Z',
      }),
    ).toMatchObject({ ok: true });
    await nextTick();

    await wrapper.get('[aria-label="预览"]').trigger('click');
    await nextTick();

    expect(document.querySelector('.a-pdf-viewer--large')).not.toBeNull();
    expect(
      [...document.querySelectorAll('[role="dialog"]')]
        .map((node) => node.textContent)
        .join(''),
    ).toContain('安装作业');

    wrapper.unmount();
  });

  it('previews PDF files from the document workspace', async () => {
    const wrapper = await mountPage({ tab: 'sop' }, writer);
    // 空列表时不显示搜索框（没什么可搜）
    expect(wrapper.find('[aria-label="搜索型录文件"]').exists()).toBe(false);
    const store = useSelectionStore();
    expect(
      store.saveSensorSop({
        dataUrl: 'data:application/pdf;base64,YQ==',
        fileName: '产品资料.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        title: '产品资料',
        uploadedAt: '2026-08-28T00:00:00.000Z',
      }),
    ).toMatchObject({ ok: true });
    await nextTick();

    await wrapper.get('[aria-label="预览"]').trigger('click');
    await nextTick();

    expect(document.querySelector('.a-pdf-viewer--large')).not.toBeNull();
    expect(
      [...document.querySelectorAll('[role="dialog"]')]
        .map((node) => node.textContent)
        .join(''),
    ).toContain('产品资料');

    wrapper.unmount();
  });

  it('returns from a resource workspace to the previous model status', async () => {
    const wrapper = await mountPage({ tab: '备选' }, writer);
    await clickTab(wrapper, 'SOP');
    await clickTab(wrapper, '型号');

    expect(statusFilter(wrapper).filteredValue).toEqual(['备选']);
    expect(activeTabText(wrapper)).toBe('型号');
    wrapper.unmount();
  });

  it('shows separate 型录 and 3D associations in the table', async () => {
    const wrapper = await mountPage({ tab: '全部' }, writer);
    const headers = wrapper.findAll('th').map((item) => item.text());

    expect(headers.slice(-6)).toEqual([
      '关联型录',
      '关联 3D',
      '使用日期',
      '停用日期',
      '录入日期',
      '操作',
    ]);
    expect(headers.indexOf('图片')).toBe(headers.indexOf('型号') + 1);

    wrapper.unmount();
  });

  it('copies a non-empty part number with the copy action', async () => {
    const wrapper = await mountPage({ tab: '全部' }, writer);
    const store = useSelectionStore();
    expect(
      store.saveSensor({
        model: '料号复制测试型号',
        partNumber: 'PN-COPY-001',
        sensorType: '漫反射',
        status: '现用',
      }),
    ).toMatchObject({ ok: true });
    await nextTick();

    // antd 的 copyable 通过 execCommand('copy') 写剪贴板
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    const row = wrapper
      .findAll('tbody tr')
      .find((item) => item.text().includes('PN-COPY-001'));
    await row!.get('.ant-typography-copy').trigger('click');

    expect(execCommand).toHaveBeenCalledWith('copy');
    await vi.waitFor(() =>
      expect(row!.find('.ant-typography-copy-success').exists()).toBe(true),
    );

    wrapper.unmount();
  });

  it('previews linked 型录 and 3D in place without leaving the sensor list', async () => {
    const wrapper = await mountPage({}, writer);
    const store = useSelectionStore();
    const documentResult = store.saveSensorSop({
      dataUrl: 'data:application/pdf;base64,YQ==',
      fileName: '产品资料.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      title: '产品资料',
      uploadedAt: '2026-08-28T00:00:00.000Z',
    });
    const model3dResult = store.saveSensor3dFile({
      dataUrl: 'data:application/pdf;base64,YQ==',
      fileName: '三维图纸.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      title: '三维图纸',
      uploadedAt: '2026-08-28T00:00:00.000Z',
    });
    expect(documentResult).toMatchObject({ ok: true });
    expect(model3dResult).toMatchObject({ ok: true });
    if (!documentResult.ok || !model3dResult.ok)
      throw new Error('测试文件保存失败');

    expect(
      store.saveSensor({
        brand: 'Test',
        model: '关联预览测试型号',
        model3dId: model3dResult.item.id,
        sensorType: '漫反射',
        sopId: documentResult.item.id,
        status: '现用',
      }),
    ).toMatchObject({ ok: true });
    await nextTick();

    const row = wrapper
      .findAll('tbody tr')
      .find((item) => item.text().includes('关联预览测试型号'));
    expect(row).toBeDefined();

    const documentButton = row!
      .findAll('button')
      .find((button) => button.text().includes('产品资料'));
    expect(documentButton?.classes()).toContain('sensor-file-link');
    await documentButton!.trigger('click');
    await nextTick();

    expect(
      [...document.querySelectorAll('[role="dialog"]')]
        .map((node) => node.textContent)
        .join(''),
    ).toContain('产品资料');
    expect(activeTabText(wrapper)).toBe('型号');

    document.querySelector<HTMLButtonElement>('.ant-modal-close')?.click();
    await nextTick();

    const model3dButton = row!
      .findAll('button')
      .find((button) => button.text().includes('三维图纸'));
    expect(model3dButton?.classes()).toContain('sensor-file-link');
    await model3dButton!.trigger('click');
    await nextTick();

    expect(
      [...document.querySelectorAll('[role="dialog"]')]
        .map((node) => node.textContent)
        .join(''),
    ).toContain('三维图纸');
    expect(activeTabText(wrapper)).toBe('型号');

    wrapper.unmount();
  });

  it('places 型录 and 3D associations together in one two-column row', async () => {
    const wrapper = await mountPage({}, writer);
    const addButton = findButton(wrapper, '新增型号');

    expect(addButton).toBeDefined();
    await addButton!.trigger('click');
    await nextTick();

    const associationRow = [
      ...document.body.querySelectorAll('[role="dialog"] .ant-form > .ant-row'),
    ].find(
      (row) =>
        row.textContent?.includes('关联型录') &&
        row.textContent.includes('关联 3D'),
    );

    expect(associationRow).toBeDefined();
    // 两项各占半行，并排在同一行
    const associationCols = [...(associationRow?.children ?? [])].filter(
      (col) => /关联型录|关联 3D/.test(col.textContent ?? ''),
    );
    expect(associationCols).toHaveLength(2);
    for (const col of associationCols) {
      expect(col.classList.contains('ant-col-12')).toBe(true);
    }

    wrapper.unmount();
  });

  it('fills the identity row with brand, model and part number in three columns', async () => {
    const wrapper = await mountPage({}, writer);
    const addButton = findButton(wrapper, '新增型号');
    await addButton!.trigger('click');
    await nextTick();

    // 只看 a-form 下的栅格行；a-form-item 自身也带 .ant-row
    const rows = [
      ...document.body.querySelectorAll('[role="dialog"] .ant-form > .ant-row'),
    ];
    const span = (col: Element) =>
      Number(/ant-col-(\d+)/.exec(col.className)?.[1] ?? 24);
    const identityCols = rows
      .flatMap((row) => [...row.children])
      .filter((col) =>
        /^(品牌|型号|料号)$/.test(
          col
            .querySelector('.ant-form-item-label label')
            ?.textContent?.replace(/\s/g, '') ?? '',
        ),
      );
    expect(
      identityCols.map((col) =>
        col
          .querySelector('.ant-form-item-label label')
          ?.textContent?.replace(/\s/g, ''),
      ),
    ).toEqual(['品牌', '型号', '料号']);
    // 三项各占三分之一行
    expect(identityCols.map(span)).toEqual([8, 8, 8]);
    // 每一行的栅格都排满，不留半行空格
    for (const row of rows) {
      const total = [...row.children].reduce((sum, col) => sum + span(col), 0);
      expect(total % 24).toBe(0);
    }

    wrapper.unmount();
    // 弹窗传送到 body，卸载组件不会带走它，清掉以免影响后续用例
    document.body.innerHTML = '';
  });

  it('filters by any of multiple sensor types and restores them from the URL', async () => {
    const wrapper = await mountPage({
      tab: '全部',
      sensorTypes: '漫反射,对照式',
    });
    const typeFilter = () => findColumn(wrapper, '感应器类型').column;
    const rows = wrapper.findAll('tbody tr').map((row) => row.text());

    expect(typeFilter().filteredValue).toEqual(['漫反射', '对照式']);
    expect(rows.some((row) => row.includes('WL12-2B530'))).toBe(true);
    expect(rows.some((row) => row.includes('E3Z-T61'))).toBe(true);
    expect(rows.some((row) => row.includes('E2E-X5MF1'))).toBe(false);

    await wrapper.get('button[aria-label="重置筛选"]').trigger('click');
    await nextTick();
    expect(typeFilter().filteredValue).toBeNull();
    expect(
      wrapper
        .findAll('tbody tr')
        .some((row) => row.text().includes('E2E-X5MF1')),
    ).toBe(true);

    wrapper.unmount();
  });

  it('exports only the filtered records from the current status page to Excel', async () => {
    const wrapper = await mountPage(
      { tab: '备选', sensorTypes: '漫反射' },
      writer,
    );
    const store = useSelectionStore();
    expect(
      store.saveSensor({
        model: '导出包含型号',
        sensorType: '漫反射',
        status: '备选',
      }),
    ).toMatchObject({ ok: true });
    expect(
      store.saveSensor({
        model: '导出排除状态型号',
        sensorType: '漫反射',
        status: '现用',
      }),
    ).toMatchObject({ ok: true });
    expect(
      store.saveSensor({
        model: '导出排除类型型号',
        sensorType: '对照式',
        status: '备选',
      }),
    ).toMatchObject({ ok: true });
    await nextTick();

    let exportedBlob: Blob | undefined;
    let exportedName = '';
    const NativeUrl = URL;
    class ExportTestUrl extends NativeUrl {
      static createObjectURL(blob: Blob) {
        exportedBlob = blob;
        return 'blob:sensor-export-test';
      }

      static revokeObjectURL() {}
    }
    vi.stubGlobal('URL', ExportTestUrl);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      exportedName = this.download;
    });

    await wrapper.get('button[aria-label="导出 Excel"]').trigger('click');
    await nextTick();

    expect(exportedName).toMatch(/^Sensor型号-备选-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(exportedBlob?.type).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const archiveText = new TextDecoder().decode(
      await exportedBlob!.arrayBuffer(),
    );
    expect(archiveText).toContain('导出包含型号');
    expect(archiveText).not.toContain('导出排除状态型号');
    expect(archiveText).not.toContain('导出排除类型型号');

    wrapper.unmount();
  });

  it('renders the 3D file workspace from its tab', async () => {
    const wrapper = await mountPage({ tab: '3d' }, writer);
    expect(wrapper.text()).toContain('点击或将文件拖到此处上传');
    expect(wrapper.text()).not.toContain('暂无 3D 文件');
    expect(wrapper.text()).toContain('仅支持 PDF，不超过 8 MB');
    wrapper.unmount();
  });

  it('previews PDF files from the 3D workspace', async () => {
    const wrapper = await mountPage({ tab: '3d' }, writer);
    const store = useSelectionStore();
    expect(
      store.saveSensor3dFile({
        dataUrl: 'data:application/pdf;base64,YQ==',
        fileName: '设备模型.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        title: '设备模型',
        uploadedAt: '2026-08-28T00:00:00.000Z',
      }),
    ).toMatchObject({ ok: true });
    await nextTick();

    expect(wrapper.find('[aria-label="预览"]').exists()).toBe(true);
    await wrapper.get('[aria-label="预览"]').trigger('click');
    await nextTick();

    expect(document.querySelector('.a-pdf-viewer--large')).not.toBeNull();
    expect(
      [...document.querySelectorAll('[role="dialog"]')]
        .map((node) => node.textContent)
        .join(''),
    ).toContain('设备模型');

    wrapper.unmount();
  });

  it('uses green, gold, and red tags for current, alternate, and disabled sensors', async () => {
    const currentWrapper = await mountPage();
    expect(
      tagColor(currentWrapper.get('.ant-table-tbody .ant-tag').element),
    ).toBe('green');
    currentWrapper.unmount();

    const alternateWrapper = await mountPage({ tab: '备选' });
    expect(
      tagColor(alternateWrapper.get('.ant-table-tbody .ant-tag').element),
    ).toBe('gold');
    alternateWrapper.unmount();

    const disabledWrapper = await mountPage({ tab: '停用' });
    const store = useSelectionStore();
    const current = store.sensors.find((item) => item.model === 'E3Z-D61');
    const alternate = store.sensors.find((item) => item.model === 'WL12-2B530');
    if (!current || !alternate) throw new Error('seed sensors missing');
    store.replaceSensorCurrent(alternate.id, current.id, '颜色测试');
    await nextTick();
    expect(
      tagColor(disabledWrapper.get('.ant-table-tbody .ant-tag').element),
    ).toBe('red');
    disabledWrapper.unmount();
  });

  it('shows the disabled date and reason on the disabled status page', async () => {
    const wrapper = await mountPage({ tab: '停用' });
    const store = useSelectionStore();
    const current = store.sensors.find((item) => item.model === 'E3Z-D61');
    const alternate = store.sensors.find((item) => item.model === 'WL12-2B530');
    if (!current || !alternate) throw new Error('seed sensors missing');
    expect(
      store.replaceSensorCurrent(alternate.id, current.id, '临时原因'),
    ).toMatchObject({ ok: true });
    const retired = store.sensors.find((item) => item.id === current.id);
    if (!retired) throw new Error('retired sensor missing');
    expect(
      store.saveSensor(
        {
          ...retired,
          model: '停用信息测试型号',
          disabledAt: '2026-08-31',
          problemNote: '现场检测距离不稳定',
          replacedAt: '2026-08-31',
        },
        retired.id,
      ),
    ).toMatchObject({ ok: true });
    await nextTick();

    const headers = wrapper.findAll('th').map((item) => item.text());
    const row = wrapper
      .findAll('tbody tr')
      .find((item) => item.text().includes('停用信息测试型号'));

    expect(headers).toContain('停用日期');
    expect(headers).toContain('停用原因');
    expect(headers.slice(-5)).toEqual([
      '关联型录',
      '关联 3D',
      '使用日期',
      '停用日期',
      '录入日期',
    ]);
    expect(row?.text()).toContain('2026-08-31');
    expect(row?.text()).toContain('现场检测距离不稳定');

    wrapper.unmount();
  });

  it('keeps status colors and replacement action when labels include numeric prefixes', async () => {
    const wrapper = await mountPage({ tab: '全部' }, writer);
    const store = useSelectionStore();
    const renamedStatuses = [
      ['现用', '01 现用'],
      ['备选', '02 备选'],
      ['停用', '03 停用'],
    ] as const;

    for (const [previousName, nextName] of renamedStatuses) {
      const item = store
        .dictionaryItems('sensor-status')
        .find((entry) => entry.name === previousName);
      if (!item) throw new Error(`missing sensor status: ${previousName}`);
      expect(
        store.saveDictionaryItem(
          'sensor-status',
          { name: nextName, sort: item.sort },
          item.id,
        ),
      ).toMatchObject({ ok: true });
    }
    await nextTick();

    const rows = wrapper.findAll('tbody tr');
    const currentRow = rows.find((row) => row.text().includes('01 现用'));
    const alternateRow = rows.find((row) => row.text().includes('02 备选'));

    expect(tagColor(currentRow!.get('.ant-tag').element)).toBe('green');
    expect(tagColor(alternateRow!.get('.ant-tag').element)).toBe('gold');
    expect(alternateRow?.find('[aria-label^="替换现用"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it('does not use same-type priority when replacing a sensor', async () => {
    const wrapper = await mountPage({ tab: '备选' }, writer);

    await wrapper.get('[aria-label="替换现用"]').trigger('click');
    await nextTick();

    const sameTypeSelect = wrapper
      .findAllComponents({ name: 'ASelect' })
      .find(
        (component) =>
          component.props('placeholder') === '同类型优先，也可选其他现用',
      );
    expect(sameTypeSelect).toBeUndefined();
    expect(
      wrapper
        .findAllComponents({ name: 'ASelect' })
        .some(
          (component) => component.props('placeholder') === '请选择现用型号',
        ),
    ).toBe(true);

    wrapper.unmount();
  });

  it('replaces the grouped current directly and still asks in the alternate filter', async () => {
    const wrapper = await mountPage({}, writer);
    const store = useSelectionStore();
    const parent = store.sensors.find((item) => item.model === 'E3Z-D61');
    const alternate = store.sensors.find((item) => item.model === 'WL12-2B530');
    const replace = vi.spyOn(store, 'replaceSensorCurrent');
    const alternateRow = wrapper
      .findAll('tbody tr.ant-table-row')
      .find((row) => row.text().includes('WL12-2B530'));

    expect(
      alternateRow!
        .findAllComponents({ name: 'ATooltip' })
        .some(
          (tooltip: { props: (name: string) => unknown }) =>
            tooltip.props('title') === '替换现用 E3Z-D61',
        ),
    ).toBe(true);

    await alternateRow!.get('[aria-label="替换现用 E3Z-D61"]').trigger('click');
    await nextTick();
    const dialogText = () =>
      [...document.querySelectorAll('[role="dialog"]')]
        .map((node) => node.textContent)
        .join('');
    expect(dialogText()).toContain('漫反射 · OMRON');
    expect(dialogText()).toContain('E3Z-D61');
    expect(dialogText()).toContain('WL12-2B530');
    expect(dialogText()).toContain('替换后停用');
    expect(dialogText()).toContain('替换后转为现用');
    expect(dialogText()).toContain(
      '替换后，E3Z-D61 记为停用并保存问题点，WL12-2B530 转为现用。',
    );
    expect(document.querySelector('#sensor-target-id')).toBeNull();

    const cancel = [
      ...document.querySelectorAll('[role="dialog"] button'),
    ].find((button) => button.textContent?.includes('取消'));
    cancel?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(document.body.textContent).not.toContain('放弃未保存的修改');

    await alternateRow!.get('[aria-label="替换现用 E3Z-D61"]').trigger('click');
    await nextTick();
    const note = document.querySelector<HTMLTextAreaElement>('#sensor-note');
    note!.value = '检测距离不稳定';
    note!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    const save = [...document.querySelectorAll('[role="dialog"] button')].find(
      (button) => button.textContent?.trim() === '替换',
    );
    save?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(replace).toHaveBeenCalledWith(
      alternate!.id,
      parent!.id,
      '检测距离不稳定',
    );

    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('mentions inherited catalog and 3d in the replace hint only when the current has them', async () => {
    const wrapper = await mountPage({}, writer);
    const store = useSelectionStore();
    const parent = store.sensors.find((item) => item.model === 'E3Z-D61');
    if (!parent) throw new Error('missing current sensor');
    const pdf = 'data:application/pdf;base64,JVBERi0xLjAK';
    const catalog = store.saveSensorSop({
      dataUrl: pdf,
      fileName: '现用型录.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      title: '现用型录',
      uploadedAt: '2026-08-28T00:00:00.000Z',
    });
    const model = store.saveSensor3dFile({
      dataUrl: pdf,
      fileName: '现用三维.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      title: '现用三维',
      uploadedAt: '2026-08-28T00:00:00.000Z',
    });
    if (!catalog.ok || !model.ok) throw new Error('link files missing');

    const base = '替换后，E3Z-D61 记为停用并保存问题点，WL12-2B530 转为现用';
    const hint = () =>
      document.querySelector('.replace-hint')?.textContent ?? '';
    const openReplace = async () => {
      await nextTick();
      const row = wrapper
        .findAll('tbody tr.ant-table-row')
        .find((item) => item.text().includes('WL12-2B530'));
      await row!.get('[aria-label="替换现用 E3Z-D61"]').trigger('click');
      await nextTick();
    };
    const closeReplace = async () => {
      const cancel = [
        ...document.querySelectorAll('[role="dialog"] button'),
      ].find((button) => button.textContent?.includes('取消'));
      cancel?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await nextTick();
    };
    const link = (sopId: number | null, model3dId: number | null) => {
      expect(
        store.saveSensor(
          {
            brand: parent.brand,
            model: parent.model,
            model3dId,
            sensorType: parent.sensorType,
            sopId,
            status: parent.status,
          },
          parent.id,
        ),
      ).toMatchObject({ ok: true });
    };

    await openReplace();
    expect(hint()).toContain(`${base}。`);
    expect(hint()).not.toContain('沿用');
    await closeReplace();

    link(catalog.item.id, null);
    await openReplace();
    expect(hint()).toContain(`${base}，并沿用原型号的型录。`);
    await closeReplace();

    link(catalog.item.id, model.item.id);
    await openReplace();
    expect(hint()).toContain(`${base}，并沿用原型号的型录和 3D。`);
    await closeReplace();

    link(null, model.item.id);
    await openReplace();
    expect(hint()).toContain(`${base}，并沿用原型号的 3D。`);
    expect(hint()).not.toContain('型录');

    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('fills the current card after a selection on the alternate filter', async () => {
    const wrapper = await mountPage({ tab: '备选' }, writer);
    const store = useSelectionStore();
    const parent = store.sensors.find((item) => item.model === 'E3Z-D61');
    const alternate = store.sensors.find((item) => item.model === 'WL12-2B530');
    const replace = vi.spyOn(store, 'replaceSensorCurrent');
    const alternateRow = wrapper
      .findAll('tbody tr.ant-table-row')
      .find((row) => row.text().includes('WL12-2B530'));

    await alternateRow!.get('[aria-label="替换现用"]').trigger('click');
    await nextTick();
    const dialogText = () =>
      [...document.querySelectorAll('[role="dialog"]')]
        .map((node) => node.textContent)
        .join('');
    expect(dialogText()).toContain('请选择要替换的现用型号');
    expect(dialogText()).not.toContain(
      '替换后，E3Z-D61 记为停用并保存问题点，WL12-2B530 转为现用。',
    );

    expect(document.querySelector('#sensor-target-id')).toBeTruthy();
    const targetSelect = wrapper
      .findAllComponents({ name: 'ASelect' })
      .find((component) => component.props('placeholder') === '请选择现用型号');
    targetSelect!.vm.$emit('update:value', parent!.id);
    await nextTick();
    expect(dialogText()).toContain('漫反射 · OMRON');
    expect(dialogText()).toContain('E3Z-D61');
    expect(dialogText()).toContain(
      '替换后，E3Z-D61 记为停用并保存问题点，WL12-2B530 转为现用。',
    );

    const note = document.querySelector<HTMLTextAreaElement>('#sensor-note');
    note!.value = '检测距离不稳定';
    note!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    const save = [...document.querySelectorAll('[role="dialog"] button')].find(
      (button) => button.textContent?.trim() === '替换',
    );
    save?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(replace).toHaveBeenCalledWith(
      alternate!.id,
      parent!.id,
      '检测距离不稳定',
    );

    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('lines up edit, replace and delete in the same three slots', async () => {
    const wrapper = await mountPage({}, writer);
    const currentRow = wrapper
      .findAll('tbody tr.ant-table-row')
      .find((row) => row.text().includes('E3Z-D61'));
    const alternateRow = wrapper
      .findAll('tbody tr.ant-table-row')
      .find((row) => row.text().includes('WL12-2B530'));
    const currentSlots = currentRow!.get('.sensor-actions').element.children;
    const alternateSlots =
      alternateRow!.get('.sensor-actions').element.children;

    const labeled = (slot: Element | undefined, label: string) =>
      slot?.matches(`[aria-label="${label}"]`) ||
      slot?.querySelector(`[aria-label="${label}"]`);
    const hasButton = (slot: Element | undefined) =>
      slot?.matches('button') || slot?.querySelector('button');

    expect(currentSlots).toHaveLength(3);
    expect(alternateSlots).toHaveLength(3);
    expect(labeled(currentSlots[0], '编辑')).toBeTruthy();
    expect(hasButton(currentSlots[1])).toBeFalsy();
    expect(labeled(currentSlots[2], '删除')).toBeTruthy();
    expect(labeled(alternateSlots[1], '替换现用 E3Z-D61')).toBeTruthy();
    expect(labeled(alternateSlots[2], '删除')).toBeTruthy();

    wrapper.unmount();

    const alternates = await mountPage({ tab: '备选' }, writer);
    const plainAlternate = alternates
      .findAll('tbody tr.ant-table-row')
      .find((row) => row.text().includes('WL12-2B530'));
    const plainAlternateSlot =
      plainAlternate!.get('.sensor-actions').element.children[1];
    expect(plainAlternate?.classes()).not.toContain('sensor-row--group');
    expect(
      plainAlternateSlot?.matches('[aria-label="替换现用"]') ||
        plainAlternateSlot?.querySelector('[aria-label="替换现用"]'),
    ).toBeTruthy();
    alternates.unmount();

    const currents = await mountPage({ tab: '现用' }, writer);
    const plainCurrent = currents
      .findAll('tbody tr.ant-table-row')
      .find((row) => row.text().includes('E3Z-D61'));
    const plainCurrentSlot =
      plainCurrent!.get('.sensor-actions').element.children[1];
    expect(
      plainCurrentSlot?.matches('button') ||
        plainCurrentSlot?.querySelector('button'),
    ).toBeFalsy();
    expect(currents.get('.selection-panel').classes()).not.toContain(
      'sensor-models--grouped',
    );
    currents.unmount();
  });

  it('keeps the status tab when typing in the search box but honours external model deep links', async () => {
    const wrapper = await mountPage({ tab: '备选' });
    const router = wrapper.vm.$router;
    expect(statusFilter(wrapper).filteredValue).toEqual(['备选']);

    searchInput(wrapper).vm.$emit('update:value', 'E3Z');
    await flushPromises();
    expect(router.currentRoute.value.query.model).toBe('E3Z');
    expect(statusFilter(wrapper).filteredValue).toEqual(['备选']);

    await router.push({
      path: '/selection/sensor',
      query: { tab: '备选', model: 'WL12' },
    });
    await flushPromises();
    expect(statusFilter(wrapper).filteredValue).toBeNull();
    expect(searchInput(wrapper).props('value')).toBe('WL12');

    wrapper.unmount();
  });

  it('highlights matching brand and model cells and clears marks without leaving grouped view', async () => {
    const wrapper = await mountPage({ tab: '全部' });
    const initialRows = tableRows(wrapper).map((row) => row.rowKey);

    expect(statusFilter(wrapper).filteredValue).toBeNull();
    expect(wrapper.get('.selection-panel').classes()).toContain(
      'sensor-models--grouped',
    );

    searchInput(wrapper).vm.$emit('update:value', 'OMRON E3Z');
    await flushPromises();

    const highlighted = wrapper
      .findAll('tbody mark')
      .map((item) => item.text());
    expect(highlighted).toContain('OMRON');
    expect(highlighted).toContain('E3Z');
    expect(statusFilter(wrapper).filteredValue).toBeNull();
    expect(wrapper.get('.selection-panel').classes()).toContain(
      'sensor-models--grouped',
    );

    searchInput(wrapper).vm.$emit('update:value', '');
    await flushPromises();

    expect(wrapper.find('tbody mark').exists()).toBe(false);
    expect(tableRows(wrapper).map((row) => row.rowKey)).toEqual(initialRows);
    expect(statusFilter(wrapper).filteredValue).toBeNull();
    expect(wrapper.get('.selection-panel').classes()).toContain(
      'sensor-models--grouped',
    );

    wrapper.unmount();
  });

  it('exports grouped members in catalog order', async () => {
    const wrapper = await mountPage({ tab: '全部', model: '导出排序' }, writer);
    const store = useSelectionStore();
    for (const brand of ['MMM导出排序', 'ZZZ导出排序', 'AAA导出排序']) {
      expect(
        store.saveSensor({
          brand,
          model: `${brand}型号`,
          sensorType: '漫反射',
          status: '现用',
        }),
      ).toMatchObject({ ok: true });
    }
    await nextTick();

    let exportedBlob: Blob | undefined;
    const NativeUrl = URL;
    class ExportTestUrl extends NativeUrl {
      static createObjectURL(blob: Blob) {
        exportedBlob = blob;
        return 'blob:sensor-export-sort-test';
      }

      static revokeObjectURL() {}
    }
    vi.stubGlobal('URL', ExportTestUrl);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await wrapper.get('button[aria-label="导出 Excel"]').trigger('click');
    await nextTick();

    const text = new TextDecoder().decode(await exportedBlob!.arrayBuffer());
    const mmm = text.indexOf('MMM导出排序型号');
    const zzz = text.indexOf('ZZZ导出排序型号');
    const aaa = text.indexOf('AAA导出排序型号');
    expect(mmm).toBeGreaterThan(-1);
    expect(mmm).toBeLessThan(zzz);
    expect(zzz).toBeLessThan(aaa);

    wrapper.unmount();
  });

  it('places same-type alternates under current rows and paginates currents only', async () => {
    const wrapper = await mountPage({}, writer);
    const store = useSelectionStore();
    const rows = tableRows(wrapper);
    const models = rows.map((row) => row.item.model);
    const start = models.indexOf('E3Z-D61');

    expect(models.slice(start, start + 3)).toEqual([
      'E3Z-D61',
      'WL12-2B530',
      'PZ-G61CP',
    ]);
    expect(wrapper.get('.selection-panel').classes()).toContain(
      'sensor-models--grouped',
    );
    expect(rows[start]?.muted).toBe(false);
    expect(rows[start + 1]?.muted).toBe(true);
    expect(rows[start + 1]?.rowKey).toBe(
      `${rows[start]!.item.id}:${rows[start + 1]!.item.id}`,
    );
    const currentCount = store.sensors.filter((item) =>
      isSensorStatus(item.status, 'current'),
    ).length;
    expect(wrapper.getComponent({ name: 'APagination' }).props('total')).toBe(
      currentCount,
    );
    expect(rows.length).toBeGreaterThan(currentCount);

    const alternateRow = wrapper
      .findAll('tbody tr.ant-table-row')
      .find((row) => row.text().includes('WL12-2B530'));
    const currentRow = wrapper
      .findAll('tbody tr.ant-table-row')
      .find(
        (row) =>
          row.text().includes('E3Z-D61') &&
          !row.classes().includes('sensor-row--alternate'),
      );
    const loneRow = wrapper
      .findAll('tbody tr.ant-table-row')
      .find((row) => row.text().includes('LV-H62'));
    expect(currentRow?.classes()).toContain('sensor-row--group');
    expect(currentRow?.classes()).not.toContain('sensor-row--alternate');
    expect(alternateRow?.classes()).toContain('sensor-row--alternate');
    expect(alternateRow?.classes()).toContain('sensor-row--group');
    expect(loneRow?.classes()).not.toContain('sensor-row--group');
    expect(loneRow?.classes()).not.toContain('sensor-row--alternate');
    expect(alternateRow?.text()).toContain('SICK');

    await alternateRow!.trigger('mouseenter');
    await nextTick();
    const hovered = () => wrapper.findAll('tbody tr.sensor-row--group-hover');
    expect(hovered()).toHaveLength(3);
    expect(hovered().some((row) => row.text().includes('E3Z-D61'))).toBe(true);
    expect(hovered().some((row) => row.text().includes('WL12-2B530'))).toBe(
      true,
    );
    expect(hovered().some((row) => row.text().includes('PZ-G61CP'))).toBe(true);
    expect(hovered().some((row) => row.text().includes('LV-H62'))).toBe(false);

    alternateRow!.element.dispatchEvent(
      new MouseEvent('mouseleave', { relatedTarget: currentRow!.element }),
    );
    await nextTick();
    expect(hovered()).toHaveLength(3);

    alternateRow!.element.dispatchEvent(
      new MouseEvent('mouseleave', { relatedTarget: document.body }),
    );
    await nextTick();
    expect(hovered()).toHaveLength(0);
    expect(alternateRow?.find('[aria-label="替换现用 E3Z-D61"]').exists()).toBe(
      true,
    );
    expect(alternateRow?.find('[aria-label="编辑"]').exists()).toBe(true);
    expect(alternateRow?.find('[aria-label="删除"]').exists()).toBe(true);
    expect(
      currentRow?.get('[aria-label="删除"]').element.hasAttribute('disabled'),
    ).toBe(true);
    expect(
      currentRow!
        .findAllComponents({ name: 'ATooltip' })
        .some(
          (tooltip: { props: (name: string) => unknown }) =>
            tooltip.props('title') ===
            '该现用型号下还有备选，请先用「替换」处理',
        ),
    ).toBe(true);
    expect(
      loneRow?.get('[aria-label="删除"]').element.hasAttribute('disabled'),
    ).toBe(false);
    expect(
      alternateRow?.get('[aria-label="删除"]').element.hasAttribute('disabled'),
    ).toBe(false);

    await alternateRow!.get('[aria-label="替换现用 E3Z-D61"]').trigger('click');
    await nextTick();
    expect(
      [...document.querySelectorAll('[role="dialog"]')]
        .map((node) => node.textContent)
        .join(''),
    ).toContain('WL12-2B530');

    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('does not open the editor from a grouped row click, and still opens it from a standalone row', async () => {
    const wrapper = await mountPage({}, writer);
    const alternateRow = wrapper
      .findAll('tbody tr.ant-table-row')
      .find((row) => row.text().includes('WL12-2B530'));
    const currentRow = wrapper
      .findAll('tbody tr.ant-table-row')
      .find(
        (row) =>
          row.text().includes('E3Z-D61') &&
          !row.classes().includes('sensor-row--alternate'),
      );
    const loneRow = wrapper
      .findAll('tbody tr.ant-table-row')
      .find((row) => row.text().includes('LV-H62'));

    await alternateRow!.trigger('click');
    await currentRow!.trigger('click');
    await nextTick();
    expect(document.body.textContent).not.toContain('编辑 Sensor 型号');
    expect(document.querySelector('#sensor-model')).toBeNull();

    await alternateRow!.get('[aria-label="编辑"]').trigger('click');
    await nextTick();
    expect(
      document.querySelector<HTMLInputElement>('#sensor-model')?.value,
    ).toBe('WL12-2B530');

    const cancel = [
      ...document.querySelectorAll('[role="dialog"] button'),
    ].find((button) => button.textContent?.includes('取消'));
    cancel?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    await loneRow!.trigger('click');
    await nextTick();
    expect(document.body.textContent).toContain('编辑 Sensor 型号');
    expect(
      document.querySelector<HTMLInputElement>('#sensor-model')?.value,
    ).toBe('LV-H62');

    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('only previews model images in the table and uploads them in the dialog', async () => {
    const wrapper = await mountPage({}, writer);
    const store = useSelectionStore();
    const lone = store.sensors.find((item) => item.model === 'LV-H62')!;
    expect(
      store.saveSensor(
        {
          ...lone,
          images: [
            {
              dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
              fileName: '正面.png',
              mimeType: 'image/png',
              size: 8,
            },
          ],
        },
        lone.id,
      ),
    ).toMatchObject({ ok: true });
    await nextTick();

    const loneRow = wrapper
      .findAll('tbody tr.ant-table-row')
      .find((row) => row.text().includes('LV-H62'))!;
    expect(loneRow.findAll('.sensor-images__item')).toHaveLength(1);
    expect(wrapper.find('tbody .ant-upload').exists()).toBe(false);
    expect(wrapper.find('tbody [aria-label^="删除图片"]').exists()).toBe(false);

    await loneRow.get('[aria-label="编辑"]').trigger('click');
    await nextTick();
    const dialog = document
      .querySelector('#sensor-model')
      ?.closest('[role="dialog"]');
    expect(dialog?.querySelector('.ant-upload-drag')).not.toBeNull();
    expect(dialog?.querySelectorAll('.sensor-images__item')).toHaveLength(1);

    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('merges a group into one catalog cell and one 3d cell showing the current model', async () => {
    const wrapper = await mountPage({}, writer);
    const store = useSelectionStore();
    const pdf = 'data:application/pdf;base64,JVBERi0xLjAK';
    const parentSop = store.saveSensorSop({
      dataUrl: pdf,
      fileName: '现用型录.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      title: '现用型录E3Z',
      uploadedAt: '2026-08-28T00:00:00.000Z',
    });
    const parent3d = store.saveSensor3dFile({
      dataUrl: pdf,
      fileName: '现用三维.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      title: '现用三维E3Z',
      uploadedAt: '2026-08-28T00:00:00.000Z',
    });
    const alternateSop = store.saveSensorSop({
      dataUrl: pdf,
      fileName: '备选型录.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      title: '备选型录WL12',
      uploadedAt: '2026-08-28T00:00:00.000Z',
    });
    const alternate3d = store.saveSensor3dFile({
      dataUrl: pdf,
      fileName: '备选三维.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      title: '备选三维WL12',
      uploadedAt: '2026-08-28T00:00:00.000Z',
    });
    expect(
      parentSop.ok && parent3d.ok && alternateSop.ok && alternate3d.ok,
    ).toBe(true);
    if (!parentSop.ok || !parent3d.ok || !alternateSop.ok || !alternate3d.ok) {
      throw new Error('测试文件保存失败');
    }
    const parent = store.sensors.find((item) => item.model === 'E3Z-D61');
    const alternate = store.sensors.find((item) => item.model === 'WL12-2B530');
    if (!parent || !alternate) throw new Error('缺少漫反射型号');
    expect(
      store.saveSensor(
        {
          brand: parent.brand,
          model: parent.model,
          model3dId: parent3d.item.id,
          sensorType: parent.sensorType,
          sopId: parentSop.item.id,
          status: parent.status,
        },
        parent.id,
      ),
    ).toMatchObject({ ok: true });
    expect(
      store.saveSensor(
        {
          brand: alternate.brand,
          model: alternate.model,
          model3dId: alternate3d.item.id,
          sensorType: alternate.sensorType,
          sopId: alternateSop.item.id,
          status: alternate.status,
        },
        alternate.id,
      ),
    ).toMatchObject({ ok: true });
    await nextTick();

    const cellsWith = (text: string) =>
      wrapper.findAll('tbody td').filter((cell) => cell.text().includes(text));
    const catalogCells = cellsWith('现用型录E3Z');
    const model3dCells = cellsWith('现用三维E3Z');
    expect(catalogCells).toHaveLength(1);
    expect(model3dCells).toHaveLength(1);
    expect(catalogCells[0]!.attributes('rowspan')).toBe('3');
    expect(model3dCells[0]!.attributes('rowspan')).toBe('3');
    expect(catalogCells[0]!.classes()).toContain('sensor-shared-cell');
    expect(model3dCells[0]!.classes()).toContain('sensor-shared-cell');
    expect(wrapper.text()).not.toContain('备选型录WL12');
    expect(wrapper.text()).not.toContain('备选三维WL12');

    await chooseColumnFilter(wrapper, '状态', ['现用']);
    await nextTick();
    const currentRow = wrapper
      .findAll('tbody tr.ant-table-row')
      .find((row) => row.text().includes('E3Z-D61'));
    expect(currentRow?.text()).toContain('现用型录E3Z');
    expect(currentRow?.text()).toContain('现用三维E3Z');
    expect(currentRow?.find('[rowspan]').exists()).toBe(false);
    expect(cellsWith('现用型录E3Z')).toHaveLength(1);
    expect(cellsWith('现用型录E3Z')[0]!.attributes('rowspan')).toBeUndefined();

    await chooseColumnFilter(wrapper, '状态', ['备选']);
    await nextTick();
    const alternateRow = wrapper
      .findAll('tbody tr.ant-table-row')
      .find((row) => row.text().includes('WL12-2B530'));
    expect(alternateRow?.text()).toContain('备选型录WL12');
    expect(alternateRow?.text()).toContain('备选三维WL12');
    expect(alternateRow?.find('[rowspan]').exists()).toBe(false);

    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('keeps a status filter flat', async () => {
    const wrapper = await mountPage({ tab: '现用' });
    const store = useSelectionStore();
    const rows = tableRows(wrapper);
    const currents = store.sensors.filter((item) =>
      isSensorStatus(item.status, 'current'),
    );

    expect(rows).toHaveLength(currents.length);
    expect(rows.every((row) => !row.muted)).toBe(true);
    expect(rows.every((row) => !row.struck)).toBe(true);
    expect(rows.every((row) => !row.groupStart)).toBe(true);
    expect(rows.every((row) => row.parent === row.item)).toBe(true);
    expect(rows.every((row) => row.groupSize === 1)).toBe(true);
    expect(rows.every((row) => row.rowKey === String(row.item.id))).toBe(true);
    expect(wrapper.find('tr.sensor-row--group').exists()).toBe(false);
    expect(wrapper.find('tr.sensor-row--alternate').exists()).toBe(false);
    expect(wrapper.get('.selection-panel').classes()).not.toContain(
      'sensor-models--grouped',
    );

    wrapper.unmount();
  });

  it('exports grouped members from 全部 and only flat hits from a status filter', async () => {
    let exportedBlob: Blob | undefined;
    const NativeUrl = URL;
    class ExportTestUrl extends NativeUrl {
      static createObjectURL(blob: Blob) {
        exportedBlob = blob;
        return 'blob:sensor-export-current-test';
      }

      static revokeObjectURL() {}
    }
    vi.stubGlobal('URL', ExportTestUrl);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const exportText = async (query: Record<string, string> = {}) => {
      const wrapper = await mountPage(query, writer);
      exportedBlob = undefined;
      await wrapper.get('button[aria-label="导出 Excel"]').trigger('click');
      await nextTick();
      const text = new TextDecoder().decode(await exportedBlob!.arrayBuffer());
      wrapper.unmount();
      return text;
    };

    const grouped = await exportText();
    expect(grouped.indexOf('E3Z-D61')).toBeGreaterThan(-1);
    expect(grouped.indexOf('E3Z-D61')).toBeLessThan(
      grouped.indexOf('WL12-2B530'),
    );
    expect(grouped.indexOf('WL12-2B530')).toBeLessThan(
      grouped.indexOf('PZ-G61CP'),
    );

    const current = await exportText({ tab: '现用' });
    expect(current).toContain('E3Z-D61');
    expect(current).not.toContain('WL12-2B530');
    expect(current).not.toContain('PZ-G61CP');
  });

  it('omits the tab query on 全部 and writes it for a status filter', async () => {
    const wrapper = await mountPage();
    const router = wrapper.vm.$router;
    await flushPromises();
    expect(statusFilter(wrapper).filteredValue).toBeNull();
    expect(router.currentRoute.value.query.tab).toBeUndefined();

    await chooseColumnFilter(wrapper, '状态', ['现用']);
    await flushPromises();
    expect(router.currentRoute.value.query.tab).toBe('现用');

    findColumn(wrapper, '状态').table.vm.$emit(
      'change',
      {},
      { status: null },
      {},
      { action: 'paginate' },
    );
    await flushPromises();
    expect(router.currentRoute.value.query.tab).toBe('现用');

    await chooseColumnFilter(wrapper, '状态', ['现用', '备选']);
    await flushPromises();
    expect(router.currentRoute.value.query.tab).toBe('现用,备选');
    expect(wrapper.get('.selection-panel').classes()).not.toContain(
      'sensor-models--grouped',
    );

    await chooseColumnFilter(wrapper, '状态', ['现用', '备选', '停用']);
    await flushPromises();
    expect(router.currentRoute.value.query.tab).toBe('现用,备选,停用');
    expect(wrapper.get('.selection-panel').classes()).not.toContain(
      'sensor-models--grouped',
    );
    const headers = wrapper.findAll('th').map((item) => item.text());
    expect(headers).toContain('停用日期');
    expect(headers).toContain('停用原因');

    await chooseColumnFilter(wrapper, '状态', []);
    await flushPromises();
    expect(router.currentRoute.value.query.tab).toBeUndefined();
    expect(wrapper.get('.selection-panel').classes()).toContain(
      'sensor-models--grouped',
    );

    wrapper.unmount();
  });

  it('keeps an unknown status token as a flat empty filter', async () => {
    const unknown = await mountPage({ tab: '不是状态' });
    expect(statusFilter(unknown).filteredValue).toEqual(['不是状态']);
    expect(unknown.get('.selection-panel').classes()).not.toContain(
      'sensor-models--grouped',
    );
    expect(tableRows(unknown)).toHaveLength(0);
    unknown.unmount();

    const mixed = await mountPage({ tab: '现用,不是状态' });
    expect(statusFilter(mixed).filteredValue).toEqual(['现用']);
    expect(mixed.get('.selection-panel').classes()).not.toContain(
      'sensor-models--grouped',
    );
    searchInput(mixed).vm.$emit('update:value', 'E3Z');
    await flushPromises();
    expect(mixed.vm.$router.currentRoute.value.query.tab).toBe('现用');
    mixed.unmount();
  });

  it('explains a guarded current and keeps 停用 selectable only when already disabled', async () => {
    const wrapper = await mountPage({}, writer);
    const currentRow = wrapper
      .findAll('tbody tr.ant-table-row')
      .find(
        (row) =>
          row.text().includes('E3Z-D61') &&
          !row.classes().includes('sensor-row--alternate'),
      );
    await currentRow!.get('[aria-label="编辑"]').trigger('click');
    await nextTick();
    expect(document.body.textContent).toContain(
      '该现用型号下还有备选，请先用「替换」处理',
    );

    const statusSelect = () =>
      wrapper
        .findAllComponents({ name: 'ASelect' })
        .find((item) => item.props('id') === 'sensor-status');
    const disabledOption = () =>
      (
        statusSelect()?.props('options') as Array<{
          disabled?: boolean;
          title?: string;
          value: string;
        }>
      ).find((option) => isSensorStatus(option.value, 'disabled'));
    expect(disabledOption()?.disabled).toBe(true);
    expect(disabledOption()?.title).toBe('停用只能通过「替换」产生');
    expect(
      wrapper
        .findAllComponents({ name: 'ASelect' })
        .find((item) => item.props('id') === 'sensor-sensor-type')
        ?.props('disabled'),
    ).toBeFalsy();

    document.querySelector<HTMLButtonElement>('.ant-modal-close')?.click();
    await nextTick();
    await findButton(wrapper, '新增型号')!.trigger('click');
    await nextTick();
    expect(disabledOption()?.disabled).toBe(true);
    expect(document.body.textContent).not.toContain(
      '该现用型号下还有备选，请先用「替换」处理',
    );
    document.querySelector<HTMLButtonElement>('.ant-modal-close')?.click();
    await nextTick();

    const store = useSelectionStore();
    const current = store.sensors.find((item) => item.model === 'E3Z-D61');
    const alternate = store.sensors.find((item) => item.model === 'WL12-2B530');
    if (!current || !alternate) throw new Error('seed sensors missing');
    store.replaceSensorCurrent(alternate.id, current.id, '保留停用');
    await nextTick();
    const retiredRow = wrapper
      .findAll('tbody tr.ant-table-row')
      .find((row) => row.get('.ant-tag').text() === '停用');
    await retiredRow!.get('[aria-label="编辑"]').trigger('click');
    await nextTick();
    expect(disabledOption()?.disabled).toBe(false);

    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('strikes only the wrapped text of an in-group disabled row', async () => {
    const wrapper = await mountPage({}, writer);
    const store = useSelectionStore();
    const parent = store.sensors.find((item) => item.model === 'E3Z-D61');
    const alternate = store.sensors.find((item) => item.model === 'WL12-2B530');
    if (!parent || !alternate) throw new Error('missing current sensor');
    expect(
      store.replaceSensorCurrent(alternate.id, parent.id, '链式停用'),
    ).toMatchObject({ ok: true });
    const retired = store.sensors.find((item) => item.id === parent.id);
    if (!retired) throw new Error('retired sensor missing');
    expect(
      store.saveSensor(
        {
          ...retired,
          model: '链式停用测试',
          sensorType: '激光式',
          spec: '停用规格整段',
        },
        retired.id,
      ),
    ).toMatchObject({ ok: true });
    await nextTick();

    const row = wrapper.findAll('tbody tr.ant-table-row').find((item) => {
      return (
        item.text().includes('链式停用测试') &&
        item.get('.ant-tag').text() === '停用'
      );
    });
    expect(row?.classes()).toEqual(
      expect.arrayContaining([
        'sensor-row--alternate',
        'sensor-row--struck',
        'sensor-row--group',
      ]),
    );
    const struck = row!.findAll('.sensor-struck').map((node) => node.text());
    expect(struck).toContain('链式停用测试');
    expect(struck).toContain('停用规格整段');
    expect(struck.join('')).not.toContain('激光式');
    expect(row?.get('.ant-tag').element.closest('.sensor-struck')).toBeNull();
    expect(
      row?.get('[aria-label="编辑"]').element.closest('.sensor-struck'),
    ).toBeNull();
    expect(row?.get('.ant-tag').text()).toBe('停用');
    const relation = row!.get('.sensor-relation-link');
    expect(relation.classes()).toContain('ant-btn-link');
    expect(relation.text()).toContain('被 SICK WL12-2B530 替换');

    wrapper.unmount();
  });
});
