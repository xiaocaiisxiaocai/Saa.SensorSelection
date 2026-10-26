import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import type { MachineSectionRow, SensorItem } from '@/domain';
import { useSelectionStore } from '@/stores/selection';
import MachineComparisonPanel from './MachineComparisonPanel.vue';

vi.mock('@/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api')>();
  return {
    ...original,
    api: { ...original.api, getKey: vi.fn().mockResolvedValue([]) },
  };
});

function row(id: number, role: string, note = ''): MachineSectionRow {
  return {
    id,
    role,
    note,
    name: '',
    desc: '',
    machineModelId: null,
    processStepId: null,
    boardCharacteristicId: null,
    sensorIds: [],
    sensorType: '',
    spec: '',
    purpose: '',
  };
}

function fixture(
  left: MachineSectionRow[],
  right: MachineSectionRow[],
  kind: 'structure' | 'notes' = 'structure',
  sensors?: SensorItem[],
) {
  window.localStorage.clear();
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useSelectionStore();
  if (sensors) vi.spyOn(store, 'sensors', 'get').mockReturnValue(sensors);
  const leftRows = ref(left);
  const rightRows = ref(right);
  vi.spyOn(store, 'machineSectionRows').mockImplementation((id) =>
    id === 801 ? leftRows.value : rightRows.value,
  );
  const side = (id: number, name: string) => ({
    name,
    path: `输送机构 / ${name}`,
    section: { id, name: '输送机构', sort: 1, scope: 'machine' as const, kind },
  });
  const wrapper = mount(MachineComparisonPanel, {
    props: { left: side(801, '左机型'), right: side(802, '右机型') },
    global: { plugins: [pinia] },
  });
  return { wrapper, leftRows, rightRows };
}

async function selectRecord(wrapper: VueWrapper, label: string) {
  const tab = wrapper
    .get('.machine-comparison-tabs')
    .findAll('.ant-tabs-tab')
    .find((item) => item.text() === label);
  if (!tab) throw new Error(`Missing record tab: ${label}`);
  await tab.get('.ant-tabs-tab-btn').trigger('click');
  await flushPromises();
}
const activeLabel = (wrapper: VueWrapper) =>
  wrapper.get('.machine-comparison-tabs .ant-tabs-tab-active').text();
const activeCells = (wrapper: VueWrapper) =>
  wrapper
    .get('.machine-comparison-record tr')
    .findAll('td')
    .map((cell) => cell.text());

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fieldRow(wrapper: VueWrapper, label: string) {
  const found = wrapper
    .findAll('.machine-comparison-record tr')
    .find((item) => item.get('th').text().replace('≠', '').trim() === label);
  if (!found) throw new Error(`Missing comparison field: ${label}`);
  return found;
}

const image = (dataUrl: string, fileName = 'structure.png') => ({
  dataUrl,
  fileName,
  mimeType: 'image/png',
  size: 3,
});

describe('MachineComparisonPanel', () => {
  it('switches one shared record at a time and preserves the counterpart when searching either side', async () => {
    const { wrapper } = fixture(
      [row(1, '入口', '左侧唯一词'), row(2, '出口')],
      [row(3, '入口', '右侧内容')],
    );
    await flushPromises();
    expect(wrapper.findAll('.machine-comparison-record')).toHaveLength(1);
    expect(activeCells(wrapper)).toEqual(['入口', '入口']);
    await selectRecord(wrapper, '出口');
    expect(activeCells(wrapper)).toEqual(['出口', '—']);
    expect(wrapper.findAll('.machine-comparison-heading')[1]!.text()).toContain(
      '该机型无此记录',
    );
    expect(
      wrapper
        .get('.machine-comparison-record')
        .findAll('td')
        .filter((_, index) => index % 2 === 1)
        .every((cell) => cell.text() === '—'),
    ).toBe(true);
    await wrapper
      .get('input[aria-label="搜索对比内容"]')
      .setValue('左侧唯一词');
    await flushPromises();
    expect(activeLabel(wrapper)).toBe('入口');
    expect(wrapper.get('.machine-comparison-record').text()).toContain(
      '右侧内容',
    );
    expect(
      wrapper
        .findAll('.machine-comparison-record mark')
        .map((mark) => mark.text()),
    ).toEqual(['左侧唯一词']);
    await wrapper.get('input[aria-label="搜索对比内容"]').setValue('右侧内容');
    await flushPromises();
    expect(wrapper.get('.machine-comparison-record').text()).toContain(
      '左侧唯一词',
    );
    expect(
      wrapper
        .findAll('.machine-comparison-record mark')
        .map((mark) => mark.text()),
    ).toEqual(['右侧内容']);
    await wrapper.get('input[aria-label="搜索对比内容"]').setValue('无此内容');
    await flushPromises();
    expect(wrapper.text()).toContain('没有匹配的记录');
    expect(wrapper.find('mark').exists()).toBe(false);
    expect(wrapper.find('.machine-comparison-tabs').exists()).toBe(false);
    expect(wrapper.get('.machine-comparison-count').text()).toBe('共 0 项');
    wrapper.unmount();
  });

  it('keeps more than twenty records available as tabs and retains selection when clearing search', async () => {
    const left = Array.from({ length: 21 }, (_, index) =>
      row(index + 1, `记录${index + 1}`),
    );
    const right = [...left]
      .reverse()
      .map((item) => ({ ...item, note: `右侧${item.id}` }));
    const { wrapper } = fixture(left, right);
    await flushPromises();
    expect(wrapper.get('.machine-comparison-count').text()).toBe('共 21 项');
    expect(
      wrapper.get('.machine-comparison-tabs').findAll('.ant-tabs-tab'),
    ).toHaveLength(21);
    expect(wrapper.find('.ant-pagination').exists()).toBe(false);
    expect(wrapper.findAll('.machine-comparison-record')).toHaveLength(1);
    await selectRecord(wrapper, '记录21');
    expect(activeCells(wrapper)).toEqual(['记录21', '记录21']);
    expect(wrapper.get('.machine-comparison-record').text()).toContain(
      '右侧21',
    );
    await wrapper.get('input[aria-label="搜索对比内容"]').setValue('右侧21');
    await flushPromises();
    expect(wrapper.get('.machine-comparison-count').text()).toBe('共 1 项');
    expect(activeLabel(wrapper)).toBe('记录21');
    await wrapper.get('input[aria-label="搜索对比内容"]').setValue('');
    await flushPromises();
    expect(activeLabel(wrapper)).toBe('记录21');
    expect(wrapper.find('mark').exists()).toBe(false);
    expect(wrapper.findAll('.machine-comparison-record')).toHaveLength(1);
    wrapper.unmount();
  });

  it('disambiguates duplicate names, keeps their numbering during search and includes right-only rows', async () => {
    const { wrapper } = fixture(
      [row(1, '检知', '第一项'), row(2, '检知', '第二项')],
      [row(3, '检知'), row(4, '检知'), row(5, '右侧独有')],
    );
    await flushPromises();
    expect(
      wrapper
        .get('.machine-comparison-tabs')
        .findAll('.ant-tabs-tab')
        .map((tab) => tab.text()),
    ).toEqual(['检知（1）', '检知（2）', '右侧独有']);
    await selectRecord(wrapper, '检知（2）');
    expect(wrapper.get('.machine-comparison-record').text()).toContain(
      '第二项',
    );
    expect(wrapper.get('.machine-comparison-record').text()).not.toContain(
      '第一项',
    );
    await wrapper.get('input[aria-label="搜索对比内容"]').setValue('第二项');
    await flushPromises();
    expect(activeLabel(wrapper)).toBe('检知（2）');
    await wrapper.get('input[aria-label="搜索对比内容"]').setValue('');
    await flushPromises();
    await selectRecord(wrapper, '右侧独有');
    expect(activeCells(wrapper)).toEqual(['—', '右侧独有']);
    expect(wrapper.get('.machine-comparison-heading').text()).toContain(
      '该机型无此记录',
    );
    wrapper.unmount();
  });

  it('labels notes by their item names and falls back after the active record disappears', async () => {
    const first = { ...row(1, '安全'), name: '停机检查', desc: '检查一' };
    const second = { ...row(2, '安全'), name: '启动检查', desc: '检查二' };
    const { wrapper, leftRows, rightRows } = fixture(
      [first, second],
      [
        { ...first, id: 3 },
        { ...second, id: 4 },
      ],
      'notes',
    );
    await flushPromises();
    await selectRecord(wrapper, '启动检查');
    expect(wrapper.get('.machine-comparison-record').text()).toContain(
      '检查二',
    );
    leftRows.value = [first];
    rightRows.value = [{ ...first, id: 3 }];
    await flushPromises();
    expect(activeLabel(wrapper)).toBe('停机检查');
    expect(wrapper.get('.machine-comparison-record').text()).toContain(
      '检查一',
    );
    await wrapper.get('input[aria-label="搜索对比内容"]').setValue('无此内容');
    await flushPromises();
    const left = wrapper.props('left');
    const right = wrapper.props('right');
    await wrapper.setProps({
      left: { ...left, section: { ...left.section, id: 901 } },
      right: { ...right, section: { ...right.section, id: 902 } },
    });
    await flushPromises();
    expect(
      (
        wrapper.get('input[aria-label="搜索对比内容"]')
          .element as HTMLInputElement
      ).value,
    ).toBe('');
    expect(wrapper.findAll('.machine-comparison-record')).toHaveLength(1);
    wrapper.unmount();
  });

  it('keeps the Sensor名称 row separate from difference highlighting', async () => {
    const { wrapper } = fixture(
      [row(1, '收板口板件检知')],
      [row(2, '收板口板件检知')],
    );
    await flushPromises();
    const highlighted = wrapper.findAll(
      '.machine-comparison-record .machine-comparison-row--key',
    );
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]!.get('th').text()).toBe('Sensor名称');
    expect(highlighted[0]!.findAll('td').map((cell) => cell.text())).toEqual([
      '收板口板件检知',
      '收板口板件检知',
    ]);
    expect(highlighted[0]!.classes()).not.toContain(
      'machine-comparison-row--same',
    );
    expect(highlighted[0]!.classes()).not.toContain(
      'machine-comparison-row--different',
    );
    expect(highlighted[0]!.find('[aria-label="左右不同"]').exists()).toBe(
      false,
    );
    wrapper.unmount();

    // 机型注意事项不使用 Sensor 名称的蓝底样式
    const notes = fixture([row(1, '安全')], [row(2, '安全')], 'notes');
    await flushPromises();
    expect(notes.wrapper.find('.machine-comparison-row--key').exists()).toBe(
      false,
    );
    notes.wrapper.unmount();
  });

  it('compares each field independently and leaves two empty values neutral', async () => {
    const left = { ...row(1, '入口', '左侧备注'), purpose: '板件检知' };
    const right = { ...row(2, '入口', '右侧备注'), purpose: '板件检知' };
    const { wrapper, rightRows } = fixture([left], [right]);
    await flushPromises();
    for (const label of ['作用']) {
      const item = fieldRow(wrapper, label);
      expect(item.classes()).toContain('machine-comparison-row--same');
      expect(item.find('[aria-label="左右不同"]').exists()).toBe(false);
      expect(
        item.findAll('td').map((cell) => cell.attributes('title')),
      ).toEqual(['左右相同', '左右相同']);
    }
    const note = fieldRow(wrapper, '备注');
    expect(note.classes()).toContain('machine-comparison-row--different');
    expect(note.get('[aria-label="左右不同"]').text()).toBe('≠');
    for (const label of ['板件特性', '传感器类型', '规格', '示意图']) {
      expect(fieldRow(wrapper, label).classes()).not.toContain(
        'machine-comparison-row--same',
      );
      expect(fieldRow(wrapper, label).classes()).not.toContain(
        'machine-comparison-row--different',
      );
    }
    rightRows.value = [{ ...right, note: '左侧备注', purpose: '' }];
    await flushPromises();
    expect(fieldRow(wrapper, '备注').classes()).toContain(
      'machine-comparison-row--same',
    );
    expect(fieldRow(wrapper, '作用').classes()).toContain(
      'machine-comparison-row--different',
    );
    await wrapper.get('input[aria-label="搜索对比内容"]').setValue('板件检知');
    await flushPromises();
    expect(fieldRow(wrapper, '作用').classes()).toContain(
      'machine-comparison-row--different',
    );
    wrapper.unmount();
  });

  it('marks only populated fields different when the counterpart record is missing', async () => {
    const { wrapper } = fixture([row(1, '入口', '单侧备注')], []);
    await flushPromises();
    const name = fieldRow(wrapper, 'Sensor名称');
    expect(name.classes()).not.toContain('machine-comparison-row--different');
    expect(name.find('[aria-label="左右不同"]').exists()).toBe(false);
    expect(fieldRow(wrapper, '备注').classes()).toContain(
      'machine-comparison-row--different',
    );
    expect(fieldRow(wrapper, '规格').classes()).not.toContain(
      'machine-comparison-row--different',
    );
    wrapper.unmount();
  });

  it('compares note contents as well as structure contents', async () => {
    const { wrapper } = fixture(
      [{ ...row(1, '安全'), name: '检查', desc: '停机检查' }],
      [{ ...row(2, '安全'), name: '检查', desc: '运行检查' }],
      'notes',
    );
    await flushPromises();
    expect(fieldRow(wrapper, '事项名称').classes()).toContain(
      'machine-comparison-row--same',
    );
    expect(fieldRow(wrapper, '说明').classes()).toContain(
      'machine-comparison-row--different',
    );
    wrapper.unmount();
  });

  it('compares resolved sensor types and complete specs rather than sensor ids or order', async () => {
    const base: SensorItem = {
      id: 100,
      status: '',
      partNumber: '',
      sensorType: '',
      brand: '',
      model: '',
      spec: '',
      actualCondition: '',
      feature: '',
      scene: '',
      sopId: null,
      model3dId: null,
      replacesId: null,
      replacedById: null,
      problemNote: '',
      usedAt: '',
      disabledAt: '',
      enteredAt: '',
      replacedAt: '',
    };
    const sensors = [
      {
        ...base,
        id: 101,
        brand: 'OMRON',
        model: 'E2K',
        spec: '4mm',
        sensorType: '光纤式',
      },
      {
        ...base,
        id: 102,
        brand: 'KEYENCE',
        model: 'PZ',
        spec: '10mm',
        sensorType: '光电式',
      },
      {
        ...base,
        id: 103,
        brand: 'OMRON',
        model: 'E2K',
        spec: '4mm',
        sensorType: '光纤式',
      },
      {
        ...base,
        id: 104,
        brand: 'OMRON',
        model: 'E2K',
        spec: '8mm',
        sensorType: '光纤式',
      },
    ];
    const left = {
      ...row(1, '入口'),
      sensorIds: [101, 102],
      spec: 'ignored left',
    };
    const right = {
      ...row(2, '入口'),
      sensorIds: [102, 103],
      spec: 'ignored right',
    };
    const { wrapper, rightRows } = fixture(
      [left],
      [right],
      'structure',
      sensors,
    );
    await flushPromises();
    expect(fieldRow(wrapper, '传感器类型').classes()).toContain(
      'machine-comparison-row--same',
    );
    expect(fieldRow(wrapper, '规格').classes()).toContain(
      'machine-comparison-row--same',
    );
    rightRows.value = [{ ...right, sensorIds: [102, 104] }];
    await flushPromises();
    expect(fieldRow(wrapper, '传感器类型').classes()).toContain(
      'machine-comparison-row--same',
    );
    expect(fieldRow(wrapper, '规格').classes()).toContain(
      'machine-comparison-row--different',
    );
    rightRows.value = [{ ...right, sensorIds: [103] }];
    await flushPromises();
    expect(fieldRow(wrapper, '传感器类型').classes()).toContain(
      'machine-comparison-row--different',
    );
    expect(fieldRow(wrapper, '规格').classes()).toContain(
      'machine-comparison-row--different',
    );
    wrapper.unmount();
  });

  it('handles shared images, missing images and file metadata without extra requests', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const left = {
      ...row(1, '入口'),
      image: image('/api/files/shared/content'),
    };
    const right = {
      ...row(2, '入口'),
      image: image('/api/files/shared/content', 'renamed.png'),
    };
    const { wrapper, rightRows } = fixture([left], [right]);
    await flushPromises();
    expect(fieldRow(wrapper, '示意图').classes()).toContain(
      'machine-comparison-row--same',
    );
    rightRows.value = [{ ...right, image: null }];
    await flushPromises();
    expect(fieldRow(wrapper, '示意图').classes()).toContain(
      'machine-comparison-row--different',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it.each([
    { bytes: [1, 2, 3], state: 'same' },
    { bytes: [1, 2, 4], state: 'different' },
  ])(
    'compares separately uploaded image bytes: $state',
    async ({ bytes, state }) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (source: string) => ({
          ok: true,
          arrayBuffer: async () =>
            new Uint8Array(source.includes('left') ? [1, 2, 3] : bytes).buffer,
        })),
      );
      const { wrapper } = fixture(
        [{ ...row(1, '入口'), image: image('/api/files/left/content') }],
        [{ ...row(2, '入口'), image: image('/api/files/right/content') }],
      );
      await flushPromises();
      expect(fieldRow(wrapper, '示意图').classes()).toContain(
        `machine-comparison-row--${state}`,
      );
      wrapper.unmount();
    },
  );

  it('leaves failed image comparisons neutral and ignores late results after switching records', async () => {
    const finish: Array<
      (response: {
        ok: boolean;
        arrayBuffer: () => Promise<ArrayBuffer>;
      }) => void
    > = [];
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish.push(resolve);
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = fixture(
      [
        { ...row(1, '入口'), image: image('/api/files/left/content') },
        row(3, '出口'),
      ],
      [
        { ...row(2, '入口'), image: image('/api/files/right/content') },
        row(4, '出口'),
      ],
    );
    await flushPromises();
    expect(fieldRow(wrapper, '示意图').get('td').attributes('title')).toBe(
      '正在比较示意图',
    );
    await selectRecord(wrapper, '出口');
    expect(fetchMock.mock.calls[0]![1].signal.aborted).toBe(true);
    finish.forEach((resolve) =>
      resolve({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }),
    );
    await flushPromises();
    expect(
      fieldRow(wrapper, '示意图').get('td').attributes('title'),
    ).toBeUndefined();

    fetchMock.mockRejectedValue(new Error('offline'));
    await selectRecord(wrapper, '入口');
    const failed = fieldRow(wrapper, '示意图');
    expect(failed.get('td').attributes('title')).toBe(
      '示意图读取失败，无法比较',
    );
    expect(failed.classes()).not.toContain('machine-comparison-row--same');
    expect(failed.classes()).not.toContain('machine-comparison-row--different');
    wrapper.unmount();
  });
});
