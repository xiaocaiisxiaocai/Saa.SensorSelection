import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import type { MachineSectionRow } from '@/domain';
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
) {
  window.localStorage.clear();
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useSelectionStore();
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

  it('highlights only the Sensor名称 row of a structure comparison', async () => {
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
    wrapper.unmount();

    // 机型注意事项的对比不加底色
    const notes = fixture([row(1, '安全')], [row(2, '安全')], 'notes');
    await flushPromises();
    expect(notes.wrapper.find('.machine-comparison-row--key').exists()).toBe(
      false,
    );
    notes.wrapper.unmount();
  });
});
