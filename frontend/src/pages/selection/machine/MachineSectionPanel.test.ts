import { flushPromises, mount } from '@vue/test-utils';
import { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dialogs } from '@/pages/shared/confirm';
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
  return store.machineSectionRows(sectionId, MACHINE);
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
        section,
      },
      global: { plugins: [pinia] },
    });
    await flushPromises();
    expect(visibleRowIds(wrapper)).toEqual([last.id]);

    expect(store.deleteMachineSectionRow(section.id, MACHINE, last.id).ok).toBe(
      true,
    );
    await flushPromises();

    expect(visibleRowIds(wrapper)).toHaveLength(20);
    wrapper.unmount();
  });

  it('saves an uploaded image to the rows that started the upload and locks the button', async () => {
    const { pinia, section, store } = setup('structure');
    const sensor = store.sensors[0];
    if (!sensor) throw new Error('sensor fixture missing');
    const saved = store.saveMachineSectionRow(section.id, MACHINE, {
      role: '定位',
      sensorIds: [sensor.id],
    });
    if (!saved.ok) throw new Error('row fixture failed');
    const saveSpy = vi.spyOn(store, 'saveMachineRowsImage');

    let resolveUpload!: (value: string) => void;
    uploadFileMock.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveUpload = resolve;
        }),
    );

    const wrapper = mount(MachineSectionPanel, {
      props: { machineName: MACHINE, section },
      global: { plugins: [pinia] },
    });
    await flushPromises();

    const upload = () =>
      wrapper
        .getComponent({ name: 'MachineRowImageCell' })
        .getComponent({ name: 'AUpload' });
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const pick = async () => {
      (upload().props('beforeUpload') as (file: File) => boolean)(file);
      // createFilePicker 用 setTimeout 把同一次选择的文件合成一批
      await new Promise((resolve) => setTimeout(resolve, 0));
      await flushPromises();
    };
    await pick();
    expect(upload().props('disabled')).toBe(true);

    // 上传中再选一次直接被锁拒绝，不会再发起上传。
    await pick();
    expect(uploadFileMock).toHaveBeenCalledTimes(1);

    // 上传途中切到别的机型，图片仍要写进发起上传时的记录。
    await wrapper.setProps({ machineName: '02 多段输送段（搭配）' });
    resolveUpload('/api/files/1/content');
    await flushPromises();

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0]?.slice(0, 3)).toEqual([
      section.id,
      MACHINE,
      [saved.item.id],
    ]);
    wrapper.unmount();
  });

  it('marks a merged schematic cell as shared and leaves a single image plain', async () => {
    const { pinia, section, store } = setup('structure');
    const sensor = store.sensors[0];
    if (!sensor) throw new Error('sensor fixture missing');
    const sharedImage = {
      dataUrl: 'data:image/png;base64,QQ==',
      fileName: '共用.png',
      mimeType: 'image/png',
      size: 1,
    };
    const aloneImage = {
      ...sharedImage,
      dataUrl: 'data:image/png;base64,Qg==',
      fileName: '单独.png',
    };
    for (const [role, image] of [
      ['入料确认', sharedImage],
      ['入料减速', sharedImage],
      ['出料确认', aloneImage],
    ] as const) {
      expect(
        store.saveMachineSectionRow(section.id, MACHINE, {
          role,
          sensorIds: [sensor.id],
          image,
        }).ok,
      ).toBe(true);
    }
    expect(
      store.saveMachineSectionRow(section.id, MACHINE, {
        role: '出料停止',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);

    const wrapper = mount(MachineSectionPanel, {
      props: { machineName: MACHINE, section },
      global: { plugins: [pinia] },
    });
    await flushPromises();

    const cells = wrapper.findAll('td:has(.machine-row-image)');
    expect(cells).toHaveLength(3);

    const sharedCell = cells[0]!;
    expect(sharedCell.attributes('rowspan')).toBe('2');
    expect(sharedCell.classes()).toContain('machine-image-cell--shared');
    expect(sharedCell.get('img').attributes('alt')).toBe('共用.png');
    expect(sharedCell.get('.machine-row-image__frame').attributes('title')).toBe(
      '共用.png',
    );
    expect(sharedCell.find('.ant-tag').exists()).toBe(false);
    expect(sharedCell.text()).not.toContain('共用.png');
    expect(sharedCell.text()).not.toContain('笔共用');

    const aloneCell = cells[1]!;
    expect(aloneCell.classes()).not.toContain('machine-image-cell--shared');
    expect(aloneCell.find('.ant-tag').exists()).toBe(false);
    expect(aloneCell.get('img').attributes('alt')).toBe('单独.png');
    expect(aloneCell.text()).not.toContain('单独.png');

    expect(
      cells[2]!.find('button[aria-label="出料停止 沿用上一笔的图"]').exists(),
    ).toBe(true);

    const confirm = vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    await sharedCell
      .get('button[aria-label="删除 入料确认、入料减速 的示意图"]')
      .trigger('click');
    expect(confirm).toHaveBeenCalledWith({
      title: '删除示意图',
      content: '确认删除“共用.png”吗？（2 笔记录共用，会一起删除）',
      okText: '删除',
      danger: true,
    });

    wrapper.unmount();
  });
});
