import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserProfile } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import ASelect from '@/ui/ASelect.vue';
import ATokenField from '@/ui/ATokenField.vue';
import { toast } from '@/ui/toast';
import SensorPage from './SensorPage.vue';

const writer: UserProfile = {
  username: 'admin',
  displayName: '管理员',
  roles: [],
  permissions: ['selection:write'],
  orgUnit: null,
};

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

describe('SensorPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    toast.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows an independent SOP tab before 型录 and 3D', async () => {
    const wrapper = await mountPage();
    const labels = wrapper
      .findAll('.a-segmented button')
      .map((button) => button.text());

    expect(labels.slice(0, 3)).toEqual(['SOP', '型录', '3D']);
    expect(wrapper.text()).toContain('现用');
    expect(wrapper.text()).toContain('全部');
    expect(wrapper.text()).toContain('感应器类型');
    wrapper.unmount();
  });

  it('renders the SOP PDF workspace from its tab', async () => {
    const wrapper = await mountPage({ tab: 'sop-library' }, writer);
    expect(wrapper.text()).toContain('暂无 SOP 文件');
    expect(wrapper.text()).toContain('仅支持 PDF，不超过 8 MB');
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
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      '安装作业',
    );

    wrapper.unmount();
  });

  it('previews PDF files from the document workspace', async () => {
    const wrapper = await mountPage({ tab: 'sop' }, writer);
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
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      '产品资料',
    );

    wrapper.unmount();
  });

  it('shows separate 型录 and 3D associations in the table', async () => {
    const wrapper = await mountPage({ tab: '全部' }, writer);
    const headers = wrapper.findAll('th').map((item) => item.text());

    expect(headers.slice(-3)).toEqual(['关联型录', '关联 3D', '操作']);

    wrapper.unmount();
  });

  it('copies a non-empty part number on double click', async () => {
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

    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const success = vi.spyOn(toast, 'success');
    const partNumber = wrapper.get('[aria-label="复制料号 PN-COPY-001"]');

    expect(partNumber.attributes('title')).toBe('双击复制料号');
    await partNumber.trigger('dblclick');

    expect(writeText).toHaveBeenCalledWith('PN-COPY-001');
    expect(success).toHaveBeenCalledWith('料号已复制：PN-COPY-001');

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
    if (!documentResult.ok || !model3dResult.ok) throw new Error('测试文件保存失败');

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

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      '产品资料',
    );
    expect(
      wrapper.get('[role="tab"][aria-selected="true"]').text(),
    ).toBe('现用');

    document.querySelector<HTMLButtonElement>('[aria-label="关闭"]')?.click();
    await nextTick();

    const model3dButton = row!
      .findAll('button')
      .find((button) => button.text().includes('三维图纸'));
    expect(model3dButton?.classes()).toContain('sensor-file-link');
    await model3dButton!.trigger('click');
    await nextTick();

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      '三维图纸',
    );
    expect(
      wrapper.get('[role="tab"][aria-selected="true"]').text(),
    ).toBe('现用');

    wrapper.unmount();
  });

  it('places 型录 and 3D associations together in one two-column row', async () => {
    const wrapper = await mountPage({}, writer);
    const addButton = wrapper
      .findAll('button')
      .find((button) => button.text() === '新增型号');

    expect(addButton).toBeDefined();
    await addButton!.trigger('click');
    await nextTick();

    const associationRow = [...document.body.querySelectorAll('.a-form-grid')].find(
      (grid) =>
        grid.textContent?.includes('关联型录') &&
        grid.textContent.includes('关联 3D'),
    );

    expect(associationRow).toBeDefined();
    expect(associationRow?.classList.contains('a-form-grid--2')).toBe(true);
    expect(associationRow?.children).toHaveLength(2);

    wrapper.unmount();
  });

  it('filters by any of multiple sensor types and restores them from the URL', async () => {
    const wrapper = await mountPage({
      tab: '全部',
      sensorTypes: '漫反射,对照式',
    });
    const typeFilter = wrapper.getComponent(ATokenField);
    const rows = wrapper.findAll('tbody tr').map((row) => row.text());

    expect(typeFilter.props('modelValue')).toEqual(['漫反射', '对照式']);
    expect(rows.some((row) => row.includes('WL12-2B530'))).toBe(true);
    expect(rows.some((row) => row.includes('E3Z-T61'))).toBe(true);
    expect(rows.some((row) => row.includes('E2E-X5MF1'))).toBe(false);

    await wrapper.get('button[aria-label="重置筛选"]').trigger('click');
    await nextTick();
    expect(typeFilter.props('modelValue')).toEqual([]);
    expect(wrapper.findAll('tbody tr').some((row) => row.text().includes('E2E-X5MF1'))).toBe(true);

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
    expect(wrapper.text()).toContain('暂无 3D 文件');
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
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      '设备模型',
    );

    wrapper.unmount();
  });

  it('uses green, yellow, and red badges for current, alternate, and disabled sensors', async () => {
    const currentWrapper = await mountPage();
    expect(currentWrapper.get('.a-badge').classes()).toContain('a-badge--green');
    currentWrapper.unmount();

    const alternateWrapper = await mountPage({ tab: '备选' });
    expect(alternateWrapper.get('.a-badge').classes()).toContain('a-badge--yellow');
    alternateWrapper.unmount();

    const disabledWrapper = await mountPage({ tab: '停用' });
    const store = useSelectionStore();
    store.saveSensor({
      model: '停用颜色测试型号',
      sensorType: store.sensors[0]?.sensorType,
      status: '停用',
    });
    await nextTick();
    expect(disabledWrapper.get('.a-badge').classes()).toContain('a-badge--red');
    disabledWrapper.unmount();
  });

  it('shows the disabled date and reason on the disabled status page', async () => {
    const wrapper = await mountPage({ tab: '停用' });
    const store = useSelectionStore();
    expect(
      store.saveSensor({
        model: '停用信息测试型号',
        sensorType: store.sensors[0]?.sensorType,
        status: '停用',
        problemNote: '现场检测距离不稳定',
        replacedAt: '2026-08-31',
      }),
    ).toMatchObject({ ok: true });
    await nextTick();

    const headers = wrapper.findAll('th').map((item) => item.text());
    const row = wrapper
      .findAll('tbody tr')
      .find((item) => item.text().includes('停用信息测试型号'));

    expect(headers).toContain('停用时间');
    expect(headers).toContain('停用原因');
    expect(headers.slice(-2)).toEqual(['关联型录', '关联 3D']);
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

    expect(currentRow?.get('.a-badge').classes()).toContain('a-badge--green');
    expect(alternateRow?.get('.a-badge').classes()).toContain('a-badge--yellow');
    expect(alternateRow?.find('[aria-label="替换现用"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it('does not use same-type priority when replacing a sensor', async () => {
    const wrapper = await mountPage({ tab: '备选' }, writer);

    await wrapper.get('[aria-label="替换现用"]').trigger('click');
    await nextTick();

    const sameTypeSelect = wrapper
      .findAllComponents(ASelect)
      .find(
        (component) =>
          component.props('placeholder') === '同类型优先，也可选其他现用',
      );
    expect(sameTypeSelect).toBeUndefined();

    wrapper.unmount();
  });
});
