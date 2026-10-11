import { flushPromises, mount } from '@vue/test-utils';
import { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import MachineSectionPanel from './MachineSectionPanel.vue';

const uploadFileMock = vi.hoisted(() => vi.fn());
vi.mock('@/pages/shared/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/pages/shared/files')>()),
  uploadFile: uploadFileMock,
}));

const MACHINE = '测试机型';

function setup(kind: 'notes' | 'structure') {
  window.localStorage.clear();
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().applyProfile({
    displayName: '维护员',
    orgUnit: null,
    permissions: ['selection:write'],
    roles: [{ code: 'editor', id: 3, name: '业务维护员' }],
    username: 'editor',
  });
  const store = useSelectionStore();
  const section = store.saveExtraMachineSection(MACHINE, {
    kind,
    name: kind === 'notes' ? '测试注意事项' : '测试结构',
    sort: 1,
  });
  if (!section.ok) throw new Error('section fixture failed');
  return { pinia, section: section.item, store };
}

function addNoteRows(
  store: ReturnType<typeof useSelectionStore>,
  sectionId: number,
  count: number,
) {
  for (let index = 1; index <= count; index += 1) {
    const result = store.saveMachineSectionRow(sectionId, MACHINE, {
      name: `事项 ${String(index).padStart(2, '0')}`,
      role: '分类',
    });
    if (!result.ok) throw new Error('row fixture failed');
  }
  return store.machineSectionRows(sectionId, MACHINE, 1);
}

function visibleRowIds(wrapper: ReturnType<typeof mount>) {
  return (
    wrapper.getComponent({ name: 'ATable' }).props('dataSource') as Array<{
      source: { id: number };
    }>
  ).map((row) => row.source.id);
}

describe('MachineSectionPanel', () => {
  beforeEach(() => {
    uploadFileMock.mockReset();
  });
  afterEach(() => {
    message.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('focuses a deep-linked row that sits on the second page', async () => {
    const { pinia, section, store } = setup('notes');
    const rows = addNoteRows(store, section.id, 25);
    const target = rows[22];
    if (!target) throw new Error('target row missing');

    const wrapper = mount(MachineSectionPanel, {
      props: {
        focusRowId: target.id,
        machineName: MACHINE,
        processId: 1,
        section,
      },
      global: { plugins: [pinia] },
    });
    await flushPromises();

    expect(visibleRowIds(wrapper)).toContain(target.id);
    // 定位到的行用 antd 的选中行样式高亮
    expect(wrapper.find('tr.ant-table-row-selected').exists()).toBe(true);
    wrapper.unmount();
  });

  it('does not clear filters again when rows change after the focus was handled', async () => {
    const { pinia, section, store } = setup('notes');
    const rows = addNoteRows(store, section.id, 3);
    const target = rows[0];
    if (!target) throw new Error('target row missing');

    const wrapper = mount(MachineSectionPanel, {
      props: {
        focusRowId: target.id,
        machineName: MACHINE,
        processId: 1,
        section,
      },
      global: { plugins: [pinia] },
    });
    await flushPromises();

    const search = () => wrapper.getComponent({ name: 'AInput' });
    search().vm.$emit('update:value', '事项');
    await flushPromises();
    addNoteRows(store, section.id, 1);
    await flushPromises();

    expect(search().props('value')).toBe('事项');
    wrapper.unmount();
  });

  it('pulls the page back when the only row on the last page is deleted', async () => {
    const { pinia, section, store } = setup('notes');
    const rows = addNoteRows(store, section.id, 21);
    const last = rows[20];
    if (!last) throw new Error('last row missing');

    const wrapper = mount(MachineSectionPanel, {
      props: {
        focusRowId: last.id,
        machineName: MACHINE,
        processId: 1,
        section,
      },
      global: { plugins: [pinia] },
    });
    await flushPromises();
    expect(visibleRowIds(wrapper)).toEqual([last.id]);

    expect(
      store.deleteMachineSectionRow(section.id, MACHINE, last.id, 1).ok,
    ).toBe(true);
    await flushPromises();

    expect(visibleRowIds(wrapper)).toHaveLength(20);
    wrapper.unmount();
  });

  it('saves uploaded images to the section that started the upload and locks the drop zone', async () => {
    const { pinia, section, store } = setup('structure');
    const sensor = store.sensors[0];
    if (!sensor) throw new Error('sensor fixture missing');
    expect(
      store.saveMachineSectionRow(section.id, MACHINE, {
        role: '定位',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);
    const saveSpy = vi.spyOn(store, 'saveMachineSectionImages');
    // 中等宽度下示意图栏默认折叠，测试里固定为展开。
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        matches: false,
        media: '',
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );

    let resolveUpload!: (value: string) => void;
    uploadFileMock.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveUpload = resolve;
        }),
    );

    const wrapper = mount(MachineSectionPanel, {
      props: { machineName: MACHINE, processId: 1, section },
      global: { plugins: [pinia] },
    });
    await flushPromises();

    const dragger = () => wrapper.getComponent({ name: 'AUploadDragger' });
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const pick = async () => {
      (dragger().props('beforeUpload') as (file: File) => boolean)(file);
      // createFilePicker 用 setTimeout 把同一次选择的文件合成一批
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flushPromises();
    };
    await pick();
    expect(dragger().props('disabled')).toBe(true);

    // 上传中的第二次拖放直接被锁拒绝，不会再发起上传。
    await pick();
    expect(uploadFileMock).toHaveBeenCalledTimes(1);

    // 上传途中切到别的制程，图片仍要写进发起上传时的分区。
    await wrapper.setProps({ processId: 2 });
    resolveUpload('/api/files/1/content');
    await flushPromises();

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0]?.[0]).toBe(section.id);
    expect(saveSpy.mock.calls[0]?.[1]).toBe(MACHINE);
    expect(saveSpy.mock.calls[0]?.[3]).toBe(1);
    wrapper.unmount();
  });
});
