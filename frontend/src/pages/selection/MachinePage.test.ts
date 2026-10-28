import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildDefaultStore,
  createSelectionRepository,
  CRUD_DEFAULTS,
  filterMachineGroups,
  keyFor,
  listEntityTreeItems,
  MACHINE_TAB_PAGE_OWNER,
  machineSectionRowsKey,
  SENSOR_DATA,
  type EntityGroup,
  type MachineNodeRef,
} from '@/domain';
import { dialogs } from '@/pages/shared/confirm';
import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import {
  chooseColumnFilter,
  chooseSegment,
  clickTreeNode,
  columnWidths,
  findButton,
  findColumn,
  runTreeAction,
  tabCount,
  treeNodes,
} from '@/test-helpers';
import EntityTree from './EntityTree.vue';
import EntitySource from './EntitySource.vue';
import { nodeTreeKey } from './machine/machine-nodes';
import MachineGlobalSearchFilters from './machine/MachineGlobalSearchFilters.vue';
import MachineGlobalSearchResults from './machine/MachineGlobalSearchResults.vue';
import MachineSectionPanel from './machine/MachineSectionPanel.vue';
import MachineComparisonPanel from './machine/MachineComparisonPanel.vue';
import { resolveMachineSelection } from './machine/machine-selection';
import MachinePage from './MachinePage.vue';

vi.mock('@/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api')>();
  return {
    ...original,
    api: { ...original.api, getKey: vi.fn().mockResolvedValue([]) },
  };
});

const machineDir = join(dirname(fileURLToPath(import.meta.url)), 'machine');
const machineSectionPanelSource = readFileSync(
  join(machineDir, 'MachineSectionPanel.vue'),
  'utf8',
);
const machineSectionPanelCss = readFileSync(
  join(machineDir, 'MachineSectionPanel.css'),
  'utf8',
);

async function mountPage(
  authenticated = false,
  writable = false,
  path = '/selection/machine',
) {
  window.localStorage.clear();
  document.body.innerHTML = '<div id="toolbar-context"></div>';
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/selection/machine', component: MachinePage }],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  const selectionStore = useSelectionStore();
  // 结构目录有一个「输送机构」Tab，机型目录项在其中各自拥有直属内容
  const conveyor = selectionStore.saveMachineTab('mechanism', {
    kind: 'structure',
    name: '输送机构',
    sort: 1,
  });
  if (!conveyor.ok) throw new Error('tab fixture failed');
  // 打开页面时默认选中结构目录的第一个机型，并为它准备直属表格
  const first = resolveMachineSelection(
    filterMachineGroups(selectionStore.entityGroups('machine'), 'mechanism'),
    {},
  );
  expect(
    selectionStore.ensureMachineDirectPage(conveyor.item.id, {
      category: first.category,
      configuration: first.configuration || null,
      item: first.item,
    }).ok,
  ).toBe(true);
  if (authenticated) {
    useAuthStore().applyProfile({
      displayName: '只读用户',
      orgUnit: null,
      permissions: [writable ? 'selection:write' : 'selection:read'],
      roles: [{ code: 'viewer', id: 2, name: '只读用户' }],
      username: 'viewer',
    });
  }
  await router.push(path);
  await router.isReady();
  return mount(MachinePage, { global: { plugins: [pinia, router] } });
}

/** 按 placeholder 找 a-select（含多选） */
function selectBy(
  wrapper: Pick<VueWrapper, 'findAllComponents'>,
  placeholder: string,
) {
  return wrapper
    .findAllComponents({ name: 'ASelect' })
    .find((component) => component.props('placeholder') === placeholder);
}

/** 按 placeholder 找 a-input */
function inputBy(
  wrapper: Pick<VueWrapper, 'findAllComponents'>,
  placeholder: string,
) {
  return wrapper
    .findAllComponents({ name: 'AInput' })
    .find((component) => component.props('placeholder') === placeholder);
}

describe('MachinePage', () => {
  afterEach(() => {
    message.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('separates mechanism and project machines', async () => {
    const wrapper = await mountPage(true, true);
    expect(wrapper.get('h1.visually-hidden').text()).toBe('机型结构');
    const catalogTabs = wrapper.get('.machine-catalog-tabs');
    const tabLabels = catalogTabs
      .findAll('.ant-segmented-item')
      .map((tab) => tab.text().trim());

    expect(tabLabels).toEqual(['结构', '专案机型']);
    expect(wrapper.text()).toContain('标准输送段配置');
    expect(wrapper.text()).not.toContain('CSL(U)R-802（插框机）');

    await chooseSegment(
      wrapper.getComponent({ name: 'ASegmented' }),
      '专案机型',
    );

    // 看树节点而不是整页文字：antd 树切换数据时的动画占位在测试环境里不会结束
    expect(treeNodes(wrapper, 'CSL(U)R-802（插框机）').length).toBeGreaterThan(
      0,
    );
    expect(wrapper.getComponent(EntityTree).props('groups')).not.toContainEqual(
      expect.objectContaining({
        configurations: expect.arrayContaining([
          expect.objectContaining({ name: '标准输送段配置' }),
        ]),
      }),
    );
    // 专案机型没有「配置」这一层
    expect(wrapper.getComponent(EntityTree).props('allowConfigurations')).toBe(
      false,
    );
    expect(wrapper.vm.$route.query.catalog).toBe('project');
    wrapper.unmount();
  });

  it('keeps legacy project-machine deep links working without a catalog query', async () => {
    const wrapper = await mountPage(
      false,
      false,
      '/selection/machine?category=专案机型&item=CSL(U)R-802（插框机）',
    );
    await flushPromises();

    expect(
      wrapper
        .get('.machine-catalog-tabs .ant-segmented-item-selected')
        .text()
        .trim(),
    ).toBe('专案机型');
    expect(wrapper.text()).toContain('CSL(U)R-802（插框机）');
    expect(wrapper.vm.$route.query.catalog).toBe('project');
    wrapper.unmount();
  });

  it('offers new category and new configuration in the structure tree header, not new machine', async () => {
    const wrapper = await mountPage(true, true);
    await flushPromises();
    const headerButtons = () =>
      wrapper
        .findAll('.entity-tree .ant-card-extra button')
        .map((button) => button.attributes('aria-label'));
    expect(headerButtons()).toContain('新建分类');
    expect(headerButtons()).toContain('新建配置');
    expect(headerButtons()).not.toContain('新建机型');

    // 默认放进当前选中机型所在的分类
    await wrapper.get('button[aria-label="新建配置"]').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('新建配置');
    expect(
      document.querySelector('.ant-modal .ant-select-selection-item')
        ?.textContent,
    ).toBe(String(wrapper.vm.$route.query.category));
    wrapper.unmount();

    // 专案机型没有配置层：仍是新建机型
    const project = await mountPage(
      true,
      true,
      '/selection/machine?catalog=project',
    );
    await flushPromises();
    const projectButtons = project
      .findAll('.entity-tree .ant-card-extra button')
      .map((button) => button.attributes('aria-label'));
    expect(projectButtons).toContain('新建机型');
    expect(projectButtons).not.toContain('新建配置');
    project.unmount();
  });

  it('has no machine process selector or process manager', async () => {
    const wrapper = await mountPage(true, true);

    expect(selectBy(wrapper, '选择制程')).toBeUndefined();
    expect(wrapper.find('.machine-process-context').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('管理制程');
    expect(wrapper.text()).toContain('标准输送段配置');
    expect(wrapper.text()).toContain('目录浏览');
    expect(wrapper.text()).toContain('条件查找');

    await chooseSegment(
      wrapper.findAllComponents({ name: 'ASegmented' })[1]!,
      '条件查找',
    );
    const split = wrapper.get('.selection-split');
    expect(split.classes()).not.toContain('selection-split--global-search');
    expect(
      split
        .get('.machine-source-stack')
        .find('.machine-global-search-filters')
        .exists(),
    ).toBe(true);
    expect(
      split
        .find('.machine-source-stack .machine-global-search-results')
        .exists(),
    ).toBe(false);
    expect(split.find('.machine-global-search-results').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('上层制程');
    expect(wrapper.text()).not.toContain('全部制程');
    expect(wrapper.text()).not.toContain('按条件查找全部结构');
    expect(wrapper.text()).toMatch(/找到 \d+ 个结构/);
    wrapper.unmount();
  });

  it('finds matching structures and opens the selected machine tab and row', async () => {
    const wrapper = await mountPage(true, true);
    const selectionStore = useSelectionStore();
    const panel = wrapper.getComponent(MachineSectionPanel);
    const machineName = panel.props('machineName') as string;
    const section = panel.props('section') as { id: number; kind: string };
    const sensor = selectionStore.sensors[0];
    if (!sensor) throw new Error('global search fixture failed');
    const row = selectionStore.saveMachineSectionRow(section.id, machineName, {
      role: '全局查找专用 Sensor',
      sensorIds: [sensor.id],
    });
    if (!row.ok) throw new Error('global search row fixture failed');
    await flushPromises();

    await chooseSegment(
      wrapper.findAllComponents({ name: 'ASegmented' })[1]!,
      '条件查找',
    );

    const filters = wrapper.getComponent(MachineGlobalSearchFilters);
    const results = wrapper.getComponent(MachineGlobalSearchResults);
    expect(findButton(wrapper, '查找')).toBeUndefined();
    expect(wrapper.text()).not.toContain('按条件查找全部结构');
    expect(results.text()).toMatch(/找到 \d+ 个结构/);
    // 已选条件全部显示，不折叠成「+N」
    expect(
      filters
        .findAllComponents({ name: 'ASelect' })
        .every((field) => field.props('maxTagCount') === undefined),
    ).toBe(true);
    expect(
      filters
        .findAllComponents({ name: 'ASelect' })
        .map((component) => component.props('placeholder')),
    ).toEqual(['选择板件特性']);
    const query = inputBy(filters, '搜索结构名称、Sensor名称或传感器');
    expect(query).toBeDefined();
    query!.vm.$emit('update:value', '全局查找专用 Sensor');
    await flushPromises();

    expect(results.text()).toContain('找到 1 个结构');
    query!.vm.$emit('update:value', '不会命中的关键词');
    await flushPromises();
    expect(results.text()).toContain('找到 0 个结构');
    expect(results.text()).toContain('没有找到符合条件的结构');
    query!.vm.$emit('update:value', '全局查找专用 Sensor');
    await flushPromises();
    expect(results.text()).toContain('找到 1 个结构');

    const result = results
      .findAll('button')
      .find((button) => button.text().includes('查看结构'));
    expect(result).toBeDefined();
    await result?.trigger('click');
    await flushPromises();

    expect(wrapper.vm.$route.query.view).toBeUndefined();
    expect(wrapper.vm.$route.query.process).toBeUndefined();
    expect(wrapper.vm.$route.query.focusRow).toBe(String(row.item.id));
    expect(wrapper.getComponent(MachineSectionPanel).props('focusRowId')).toBe(
      row.item.id,
    );
    wrapper.unmount();
  });

  it('filters immediately when only a board characteristic is selected', async () => {
    const wrapper = await mountPage(true, true);
    await chooseSegment(
      wrapper.findAllComponents({ name: 'ASegmented' })[1]!,
      '条件查找',
    );

    const resetButton = () => findButton(wrapper, '重置');
    expect(findButton(wrapper, '查找')).toBeUndefined();
    expect(resetButton()?.attributes('disabled')).toBeDefined();
    const filters = wrapper.getComponent(MachineGlobalSearchFilters);
    const boardField = filters
      .findAllComponents({ name: 'ASelect' })
      .find((component) => component.props('placeholder') === '选择板件特性');
    const board = useSelectionStore().dictionaryItems(
      'board-characteristic',
    )[0];
    boardField?.vm.$emit('update:value', [board?.id]);
    await flushPromises();

    expect(resetButton()?.attributes('disabled')).toBeUndefined();
    expect(wrapper.get('.machine-global-search-results').text()).toMatch(
      /找到 \d+ 个结构/,
    );

    await resetButton()?.trigger('click');
    await flushPromises();
    expect(boardField?.props('value')).toEqual([]);
    expect(resetButton()?.attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  async function openReportMenu(wrapper: VueWrapper) {
    await findButton(wrapper, '报告')?.trigger('click');
    await flushPromises();
  }
  const reportMenuElements = () => [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ];
  const reportMenuItems = () =>
    reportMenuElements().map((item) => item.textContent?.trim() ?? '');
  async function clickReportMenu(label: string) {
    const item = reportMenuElements().find(
      (element) => element.textContent?.trim() === label,
    );
    if (!item) throw new Error(`menu item "${label}" not found`);
    item.click();
    await flushPromises();
  }

  it('hides every report operation when not signed in', async () => {
    const wrapper = await mountPage();
    expect(findButton(wrapper, '报告')).toBeUndefined();
    expect(wrapper.find('.machine-sub-tab .ant-checkbox').exists()).toBe(false);
    expect(wrapper.find('.ant-tree-checkbox').exists()).toBe(false);
    expect(wrapper.text()).toMatch(/输送机构|分类/);
    wrapper.unmount();
  });

  it('shows report operations to an authenticated read-only user', async () => {
    const wrapper = await mountPage(true);
    // 报告操作收在一个「报告」下拉里，给同一行的一级 Tab 让位
    expect(reportMenuItems()).toEqual([]);
    await openReportMenu(wrapper);
    expect(reportMenuItems()).toEqual([
      '全选',
      '清空',
      '生成并下载报告（请先勾选）',
      '预览 / 打印 PDF（请先勾选）',
    ]);
    // 登录后目录树一直显示勾选框，不需要先进入「选择」模式
    expect(wrapper.find('.ant-tree-checkbox').exists()).toBe(true);
    wrapper.unmount();
  });

  it('checks every machine under a tree node from the tree', async () => {
    const wrapper = await mountPage(true);
    // 「已选 N / M 个机型」按目录树末级节点计数，没有内容页的机型也能勾
    expect(wrapper.text()).toMatch(/已选\s+0\s+\/\s+101/);
    await wrapper.get('.ant-tree-checkbox').trigger('click');
    expect(wrapper.text()).toMatch(/已选\s+29\s+\/\s+101/);
    expect(wrapper.find('.ant-tree-checkbox-disabled').exists()).toBe(false);
    expect(
      wrapper.get('.ant-tree-treenode-selected .ant-tree-checkbox').classes(),
    ).toContain('ant-tree-checkbox-checked');
    await wrapper.get('.ant-tree-checkbox').trigger('click');
    expect(wrapper.text()).toMatch(/已选\s+0\s+\/\s+101/);
    wrapper.unmount();
  });

  it('checks one machine for the report and selects all of them', async () => {
    const wrapper = await mountPage(true);
    expect(wrapper.text()).toMatch(/已选\s+0\s+\/\s+101/);
    await wrapper
      .get('.ant-tree-treenode-selected .ant-tree-checkbox')
      .trigger('click');
    expect(wrapper.text()).toMatch(/已选\s+1\s+\/\s+101/);
    await openReportMenu(wrapper);
    expect(reportMenuItems()).toContain('生成并下载报告');
    await clickReportMenu('清空');
    expect(wrapper.text()).toMatch(/已选\s+0\s+\//);
    await clickReportMenu('全选');
    expect(wrapper.text()).toMatch(/已选\s+101\s+\/\s+101/);
    wrapper.unmount();
  });

  it('shows configuration management and machine sorting to writers', async () => {
    const wrapper = await mountPage(true, true);

    expect(wrapper.getComponent(EntityTree).props('allowConfigurations')).toBe(
      true,
    );
    await runTreeAction(wrapper, '02 多段输送段（搭配）', '编辑机型');

    expect(document.body.textContent).toContain('配置（可选）');
    expect(document.body.textContent).toContain('排序');

    wrapper.unmount();
  });

  it('lets writers choose between structure and machine-notes tab types', async () => {
    const wrapper = await mountPage(true, true);

    await wrapper.get('.ant-tabs-nav-add').trigger('click');
    await flushPromises();

    const typeSelect = wrapper
      .findAllComponents({ name: 'ASelect' })
      .find((component) =>
        ((component.props('options') ?? []) as Array<{ value: string }>).some(
          (item) => item.value === 'notes',
        ),
      );
    expect(typeSelect).toBeDefined();
    expect(typeSelect?.props('options')).toEqual([
      { label: '结构', value: 'structure' },
      { label: '机型注意事项', value: 'notes' },
    ]);

    wrapper.unmount();
  });

  it('explains why a selected page with no rows or images cannot be reported', async () => {
    const wrapper = await mountPage(true);
    await wrapper
      .get('.ant-tree-treenode-selected .ant-tree-checkbox')
      .trigger('click');

    const openSpy = vi.spyOn(window, 'open');
    const warning = vi.spyOn(message, 'warning');
    await openReportMenu(wrapper);
    await clickReportMenu('预览 / 打印 PDF');

    expect(openSpy).not.toHaveBeenCalled();
    expect(warning).toHaveBeenLastCalledWith('所选机型暂无可生成的内容');
    wrapper.unmount();
  });

  it('uses Sensor名称 and board characteristic fields for structure records only', async () => {
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
    const selectionStore = useSelectionStore();
    const structure = selectionStore.saveExtraMachineSection('测试机型', {
      kind: 'structure',
      name: '测试结构',
      sort: 1,
    });
    const notes = selectionStore.saveExtraMachineSection('测试机型', {
      kind: 'notes',
      name: '测试注意事项',
      sort: 2,
    });
    if (!structure.ok || !notes.ok) {
      throw new Error('section fixture failed');
    }

    const structurePanel = mount(MachineSectionPanel, {
      props: {
        machineName: '测试机型',
        section: structure.item,
      },
      global: { plugins: [pinia] },
    });
    const addStructure = structurePanel
      .findAll('button')
      .find((button) => button.text() === '新增选型');
    await addStructure?.trigger('click');
    await flushPromises();
    const structureSelects = structurePanel
      .findAllComponents({ name: 'ASelect' })
      .map((component) => component.props('placeholder'));
    expect(document.body.textContent).toContain('Sensor名称');
    expect(structureSelects).toContain('选择板件特性（可选）');
    expect(structureSelects).not.toContain('选择机型（可选）');
    expect(structureSelects).not.toContain('选择工艺制程（可选）');
    expect(document.body.textContent).not.toContain('功能作用');
    expect(document.body.textContent).not.toContain('工艺制程');
    expect(document.body.textContent).not.toContain('机型（可选）');
    structurePanel.unmount();

    const notesPanel = mount(MachineSectionPanel, {
      props: {
        machineName: '测试机型',
        section: notes.item,
      },
      global: { plugins: [pinia] },
    });
    const addNotes = notesPanel
      .findAll('button')
      .find((button) => button.text() === '新增事项');
    await addNotes?.trigger('click');
    await flushPromises();
    expect(
      notesPanel
        .findAllComponents({ name: 'ASelect' })
        .some(
          (component) =>
            component.props('placeholder') === '选择板件特性（可选）',
        ),
    ).toBe(false);
    notesPanel.unmount();
  });

  it('offers a searchable optional board binding and displays the saved value', async () => {
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
    const selectionStore = useSelectionStore();
    const structure = selectionStore.saveExtraMachineSection('测试机型', {
      kind: 'structure',
      name: '测试结构',
      sort: 1,
    });
    if (!structure.ok) throw new Error('structure fixture failed');

    const wrapper = mount(MachineSectionPanel, {
      props: {
        machineName: '测试机型',
        section: structure.item,
      },
      global: { plugins: [pinia] },
    });
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '新增选型')
      ?.trigger('click');
    await flushPromises();

    const boardSelect = wrapper
      .findAllComponents({ name: 'ASelect' })
      .find(
        (component) =>
          component.props('placeholder') === '选择板件特性（可选）',
      );
    expect(
      wrapper
        .findAllComponents({ name: 'ASelect' })
        .some(
          (component) =>
            component.props('placeholder') === '选择机型（可选）' ||
            component.props('placeholder') === '选择工艺制程（可选）',
        ),
    ).toBe(false);
    expect(boardSelect?.props('showSearch')).toBe(true);
    expect(boardSelect?.props('allowClear')).toBe(true);
    expect(boardSelect?.props('options')).toEqual(
      selectionStore.dictionaryItems('board-characteristic').map((item) => ({
        label: item.name,
        value: item.id,
      })),
    );
    const sensor = selectionStore.sensors[0];
    const boardCharacteristic = selectionStore.dictionaryItems(
      'board-characteristic',
    )[0];
    if (!sensor || !boardCharacteristic) {
      throw new Error('dictionary binding options missing');
    }
    expect(
      selectionStore.saveMachineSectionRow(structure.item.id, '测试机型', {
        role: '字典绑定显示',
        sensorIds: [sensor.id],
        boardCharacteristicId: boardCharacteristic.id,
      }).ok,
    ).toBe(true);
    await flushPromises();
    expect(wrapper.text()).toContain('字典绑定显示');
    expect(wrapper.text()).toContain(boardCharacteristic.name);
    wrapper.unmount();
  });

  it('searches structure records by Sensor名称', async () => {
    window.localStorage.clear();
    const wrapper = await mountPage();
    const selectionStore = useSelectionStore();
    const panel = wrapper.getComponent(MachineSectionPanel);
    const machineName = panel.props('machineName') as string;
    const section = panel.props('section') as { id: number; kind: string };
    const sensor = selectionStore.sensors[0];

    expect(section.kind).toBe('structure');
    expect(sensor).toBeDefined();
    if (!sensor) return;

    expect(
      selectionStore.saveMachineSectionRow(section.id, machineName, {
        note: '',
        purpose: '',
        role: 'Sensor名称-不匹配',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);
    expect(
      selectionStore.saveMachineSectionRow(section.id, machineName, {
        note: '',
        purpose: '',
        role: 'Sensor名称-匹配',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);
    await flushPromises();

    const search = inputBy(panel, '搜索选型');
    expect(search).toBeDefined();

    search!.vm.$emit('update:value', 'Sensor名称-匹配');
    await flushPromises();

    expect(panel.text()).toContain('Sensor名称-匹配');
    expect(panel.text()).not.toContain('Sensor名称-不匹配');
    wrapper.unmount();
  });

  it('shows only the current structure columns after removing machine and process fields', async () => {
    window.localStorage.clear();
    const wrapper = await mountPage();
    const panel = wrapper.getComponent(MachineSectionPanel);
    const columns = panel
      .getComponent({ name: 'ATable' })
      .props('columns') as Array<{ title: string }>;
    expect(columns.map((column) => column.title)).toEqual([
      'Sensor名称',
      '板件特性',
      '传感器类型',
      '规格',
      '作用',
      '备注',
      '示意图',
    ]);
    wrapper.unmount();
  });

  it('filters structure records from the searchable board-characteristic dropdown', async () => {
    window.localStorage.clear();
    const wrapper = await mountPage();
    const selectionStore = useSelectionStore();
    const panel = wrapper.getComponent(MachineSectionPanel);
    const machineName = panel.props('machineName') as string;
    const section = panel.props('section') as { id: number; kind: string };
    const [firstBoardCharacteristic, secondBoardCharacteristic] =
      selectionStore.dictionaryItems('board-characteristic');
    const sensor = selectionStore.sensors[0];

    expect(section.kind).toBe('structure');
    expect(firstBoardCharacteristic).toBeDefined();
    expect(secondBoardCharacteristic).toBeDefined();
    expect(sensor).toBeDefined();
    if (!firstBoardCharacteristic || !secondBoardCharacteristic || !sensor) {
      return;
    }

    expect(
      selectionStore.saveMachineSectionRow(section.id, machineName, {
        boardCharacteristicId: firstBoardCharacteristic.id,
        note: '',
        purpose: '',
        role: '字典筛选-第一项',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);
    expect(
      selectionStore.saveMachineSectionRow(section.id, machineName, {
        boardCharacteristicId: secondBoardCharacteristic.id,
        note: '',
        purpose: '',
        role: '字典筛选-第二项',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);
    await flushPromises();

    const boardCharacteristicFilter = findColumn(panel, '板件特性').column;

    expect(boardCharacteristicFilter.filterSearch).toBe(true);
    expect(boardCharacteristicFilter.filterMultiple).toBe(true);
    expect(boardCharacteristicFilter.filters).toEqual(
      selectionStore.dictionaryItems('board-characteristic').map((item) => ({
        text: item.name,
        value: item.id,
      })),
    );
    expect(findColumn(panel, '传感器类型').column.filterSearch).toBe(true);

    await chooseColumnFilter(panel, '板件特性', [firstBoardCharacteristic.id]);
    expect(panel.text()).toContain('字典筛选-第一项');
    expect(panel.text()).not.toContain('字典筛选-第二项');

    await panel.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(findColumn(panel, '板件特性').column.filteredValue).toBeNull();
    expect(panel.text()).toContain('字典筛选-第一项');
    expect(panel.text()).toContain('字典筛选-第二项');
    wrapper.unmount();
  });

  it('keeps structure labels compact and gives specifications more room', async () => {
    const wrapper = await mountPage(true, true);
    const widths = Object.values(columnWidths(wrapper));

    expect(widths).toEqual([104, 144, 152, 220, 120, 96, 152, 72]);

    wrapper.unmount();
  });

  it('labels the table authoring action as a new selection', async () => {
    const wrapper = await mountPage(true, true);
    const panel = wrapper.getComponent(MachineSectionPanel);
    const button = panel.get('button[aria-label="新增选型"]');

    expect(button.text()).toContain('新增选型');
    expect(button.find('svg').exists()).toBe(true);
    wrapper.unmount();
  });

  it('uses aligned separators for sensor entries inside a compound row', () => {
    expect(machineSectionPanelSource).toContain(
      "'machine-sensor-entry--continued': !row.groupEnd",
    );
    expect(machineSectionPanelSource).toContain(
      'class="machine-spec-cell machine-sensor-entry"',
    );
    expect(machineSectionPanelCss).toMatch(
      /\.machine-sensor-entry--continued\s*\{[^}]*border-bottom:\s*1px solid var\(--color-split\);/s,
    );
  });

  it('puts the schematic in the column before 操作 and merges rows that share an image', async () => {
    const wrapper = await mountPage(true, true);
    const selectionStore = useSelectionStore();
    const panel = wrapper.getComponent(MachineSectionPanel);
    const machineName = panel.props('machineName') as string;
    const section = panel.props('section') as { id: number };
    const sensor = selectionStore.sensors[0]!;
    const image = {
      dataUrl: 'data:image/png;base64,QQ==',
      fileName: '入料段.png',
      mimeType: 'image/png',
      size: 1,
    };
    // 前两笔共用一张图（第二笔「沿用上一笔的图」），第三笔没有图
    for (const [role, withImage] of [
      ['入料确认', true],
      ['入料减速', true],
      ['入料停止', false],
    ] as const) {
      expect(
        selectionStore.saveMachineSectionRow(section.id, machineName, {
          role,
          sensorIds: [sensor.id],
          ...(withImage ? { image } : {}),
        }).ok,
      ).toBe(true);
    }
    await flushPromises();

    const headers = panel
      .findAll('.ant-table-thead th')
      .map((th) => th.text().trim())
      .filter(Boolean);
    expect(headers.slice(-2)).toEqual(['示意图', '操作']);
    const cells = panel.findAll('td:has(.machine-row-image)');
    expect(cells).toHaveLength(2);
    expect(cells[0]!.attributes('rowspan')).toBe('2');
    expect(cells[0]!.get('img').attributes('alt')).toBe('入料段.png');
    expect(cells[1]!.text()).toContain('新增图片');
    // 右侧示意图栏已经拿掉
    expect(panel.find('.machine-images').exists()).toBe(false);
    wrapper.unmount();
  });

  it('combines the active section and report actions into one desktop context bar', async () => {
    const wrapper = await mountPage(true, true);
    // 报告操作放在分区 a-tabs 的右侧区域，与标签同一行
    expect(
      wrapper
        .find('.machine-section-tabs .ant-tabs-extra-content .machine-report')
        .exists(),
    ).toBe(true);
    wrapper.unmount();
  });

  it('offers the image actions only to writers', async () => {
    const reader = await mountPage(true, false);
    const store = useSelectionStore();
    const panel = reader.getComponent(MachineSectionPanel);
    expect(
      store.saveMachineSectionRow(
        (panel.props('section') as { id: number }).id,
        panel.props('machineName') as string,
        { role: '只读行', sensorIds: [store.sensors[0]!.id] },
      ).ok,
    ).toBe(true);
    await flushPromises();
    expect(panel.find('.machine-row-image').text()).toBe('—');
    expect(panel.find('.machine-row-image button').exists()).toBe(false);
    reader.unmount();
  });

  it('filters machine structure rows by any of multiple sensor types', async () => {
    window.localStorage.clear();
    const wrapper = await mountPage();
    const selectionStore = useSelectionStore();
    const panel = wrapper.getComponent(MachineSectionPanel);
    const machineName = panel.props('machineName') as string;
    const section = panel.props('section') as { id: number; kind: string };
    const sensors = selectionStore.sensors
      .filter(
        (sensor, index, items) =>
          items.findIndex(
            (candidate) => candidate.sensorType === sensor.sensorType,
          ) === index,
      )
      .slice(0, 3);

    expect(section.kind).toBe('structure');
    expect(sensors).toHaveLength(3);
    if (sensors.length < 3) return;

    sensors.forEach((sensor, index) => {
      expect(
        selectionStore.saveMachineSectionRow(section.id, machineName, {
          note: '',
          purpose: '',
          role: `机型类型多选-${index + 1}`,
          sensorIds: [sensor.id],
        }).ok,
      ).toBe(true);
    });
    await flushPromises();

    expect(findColumn(panel, '传感器类型').column.filterSearch).toBe(true);
    await chooseColumnFilter(
      panel,
      '传感器类型',
      sensors.slice(0, 2).map((sensor) => sensor.sensorType),
    );

    expect(wrapper.text()).toContain('机型类型多选-1');
    expect(wrapper.text()).toContain('机型类型多选-2');
    expect(wrapper.text()).not.toContain('机型类型多选-3');

    await panel.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(findColumn(panel, '传感器类型').column.filteredValue).toBeNull();
    expect(wrapper.text()).toContain('机型类型多选-3');
    wrapper.unmount();
  });
});

describe('MachinePage comparison', () => {
  afterEach(() => {
    message.destroy();
    vi.restoreAllMocks();
  });

  async function comparisonFixture(writable = false) {
    const wrapper = await mountPage(writable, writable);
    await flushPromises();
    const store = useSelectionStore();
    const leaves = listEntityTreeItems(
      filterMachineGroups(store.entityGroups('machine'), 'mechanism'),
    );
    const nodes: MachineNodeRef[] = leaves.slice(0, 3).map((item) => ({
      category: item.category,
      configuration: item.configuration ?? null,
      item: item.name,
    }));
    const [left, right, empty] = nodes;
    if (!left || !right || !empty) throw new Error('comparison leaves missing');
    const conveyor = store.machineTabs.find((tab) => tab.name === '输送机构')!;
    const extra = store.saveMachineTab('mechanism', {
      kind: 'structure',
      name: '收板机构',
      sort: 2,
    });
    const oneSide = store.saveMachineTab('mechanism', {
      kind: 'structure',
      name: '仅左侧机构',
      sort: 3,
    });
    if (!extra.ok || !oneSide.ok) throw new Error('comparison tabs failed');
    const sections: number[] = [];
    for (const tab of [conveyor, extra.item]) {
      for (const [index, node] of [left, right].entries()) {
        const page = store.ensureMachineDirectPage(tab.id, node);
        if (!page.ok) throw new Error('comparison page failed');
        sections.push(page.item.id);
        const row = store.saveMachineSectionRow(
          page.item.id,
          MACHINE_TAB_PAGE_OWNER,
          {
            role: `${index ? '右' : '左'}-${tab.name}`,
            sensorIds: [store.sensors[0]!.id],
          },
        );
        if (!row.ok) throw new Error('comparison row failed');
      }
    }
    store.ensureMachineDirectPage(oneSide.item.id, left);
    await flushPromises();
    return { wrapper, store, left, right, empty, sections };
  }

  it('shows one aligned read-only comparison and switches both sides while retaining the single-view route', async () => {
    const { wrapper, right, left, sections } = await comparisonFixture(true);
    const originalQuery = { ...wrapper.vm.$route.query };
    wrapper.getComponent(EntitySource).vm.$emit('compare', right);
    await flushPromises();
    expect(wrapper.findAllComponents(MachineComparisonPanel)).toHaveLength(1);
    expect(wrapper.get('.machine-comparison-heading').text()).toContain(
      left.item,
    );
    expect(wrapper.findAll('.machine-comparison-heading')[1]!.text()).toContain(
      right.item,
    );
    expect(wrapper.get('.machine-compare-tabs').text()).toContain('输送机构');
    expect(wrapper.get('.machine-compare-tabs').text()).toContain('收板机构');
    expect(wrapper.get('.machine-compare-tabs').text()).not.toContain(
      '仅左侧机构',
    );
    expect(
      (['left', 'right'] as const).map(
        (side) =>
          wrapper.getComponent(MachineComparisonPanel).props(side).section.id,
      ),
    ).toEqual(sections.slice(0, 2));
    expect(wrapper.find('button[aria-label="新增选型"]').exists()).toBe(false);
    const firstRecord = wrapper.get('.machine-comparison-record');
    expect(firstRecord.findAll('th').map((cell) => cell.text())).toEqual([
      'Sensor名称',
      '板件特性',
      '传感器类型',
      '规格',
      '作用',
      '备注',
      '示意图',
    ]);
    expect(
      firstRecord
        .findAll('tr')
        .every(
          (row) =>
            row.findAll('th').length === 1 && row.findAll('td').length === 2,
        ),
    ).toBe(true);
    expect(wrapper.findAll('input[aria-label="搜索对比内容"]')).toHaveLength(1);
    expect(wrapper.findAll('.machine-comparison-tabs')).toHaveLength(1);
    const tab = wrapper
      .get('.machine-compare-tabs')
      .findAll('.ant-tabs-tab')
      .find((tab) => tab.text() === '收板机构')!;
    await tab.get('.ant-tabs-tab-btn').trigger('click');
    await flushPromises();
    expect(
      (['left', 'right'] as const).map(
        (side) =>
          wrapper.getComponent(MachineComparisonPanel).props(side).section.id,
      ),
    ).toEqual(sections.slice(2, 4));
    expect(wrapper.text()).toContain('左-收板机构');
    expect(wrapper.text()).toContain('右-收板机构');
    expect(wrapper.vm.$route.query).toEqual(originalQuery);
    await findButton(wrapper, '退出对比')!.trigger('click');
    await flushPromises();
    expect(wrapper.findAllComponents(MachineSectionPanel)).toHaveLength(1);
    expect(wrapper.vm.$route.query).toEqual(originalQuery);
    wrapper.unmount();
  });

  it('offers a searchable picker to anonymous readers and returns to single view on a normal tree click', async () => {
    const { wrapper, right } = await comparisonFixture();
    await findButton(wrapper, '选择对比项')!.trigger('click');
    await flushPromises();
    const picker = wrapper
      .findAllComponents({ name: 'ASelect' })
      .find(
        (component) =>
          component.attributes('aria-label') === '选择另一个机型条目',
      )!;
    expect(picker.props('mode')).not.toBe('multiple');
    picker.vm.$emit('update:value', nodeTreeKey(right));
    await flushPromises();
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>('.ant-modal button'),
    ].find((button) => button.textContent?.replace(/\s+/g, '') === '开始对比')!;
    button.click();
    await flushPromises();
    expect(wrapper.findAll('.machine-comparison-heading')).toHaveLength(2);
    await clickTreeNode(wrapper, right.item!);
    expect(wrapper.find('.machine-comparison-panel').exists()).toBe(false);
    expect(wrapper.vm.$route.query.item).toBe(right.item);
    wrapper.unmount();
  });

  it('opens the picker from the current machine context menu and compares with another machine', async () => {
    const { wrapper, left, right } = await comparisonFixture();
    const originalQuery = { ...wrapper.vm.$route.query };
    const currentNode = wrapper
      .findAll('.entity-tree__node')
      .find((node) => node.attributes('data-item') === left.item)!;
    await currentNode.trigger('contextmenu', { clientX: 40, clientY: 20 });
    await flushPromises();
    const menuItem = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent?.trim() === '选择其他机型对比…')!;
    expect(menuItem).toBeDefined();
    menuItem.click();
    await flushPromises();
    const picker = wrapper
      .findAllComponents({ name: 'ASelect' })
      .find(
        (component) =>
          component.attributes('aria-label') === '选择另一个机型条目',
      )!;
    expect(
      picker.props('options').map((option: { value: string }) => option.value),
    ).not.toContain(nodeTreeKey(left));
    expect(wrapper.vm.$route.query).toEqual(originalQuery);
    expect(wrapper.find('.machine-comparison-panel').exists()).toBe(false);
    picker.vm.$emit('update:value', nodeTreeKey(right));
    await flushPromises();
    const start = [
      ...document.querySelectorAll<HTMLButtonElement>('.ant-modal button'),
    ].find((button) => button.textContent?.replace(/\s+/g, '') === '开始对比')!;
    start.click();
    await flushPromises();
    expect(wrapper.findAll('.machine-comparison-heading')).toHaveLength(2);
    expect(wrapper.findAll('.machine-comparison-heading')[1]!.text()).toContain(
      right.item,
    );
    expect(wrapper.vm.$route.query).toEqual(originalQuery);
    wrapper.unmount();
  });

  it('handles no common tabs and replaces the right item without adding a third pane', async () => {
    const { wrapper, right, empty } = await comparisonFixture();
    wrapper.getComponent(EntitySource).vm.$emit('compare', right);
    await flushPromises();
    expect(wrapper.findAll('.machine-comparison-heading')).toHaveLength(2);
    wrapper.getComponent(EntitySource).vm.$emit('compare', empty);
    await flushPromises();
    expect(wrapper.text()).toContain('这两个条目暂无可对比的机构');
    expect(wrapper.findAllComponents(MachineComparisonPanel)).toHaveLength(0);
    wrapper.unmount();
  });

  it('clears comparison if a compared item is removed', async () => {
    const { wrapper, store, empty } = await comparisonFixture();
    wrapper.getComponent(EntitySource).vm.$emit('compare', empty);
    await flushPromises();
    expect(wrapper.find('.machine-compare-summary').exists()).toBe(true);
    expect(
      store.deleteEntityItem(
        'machine',
        empty.item!,
        empty.category,
        empty.configuration,
      ).ok,
    ).toBe(true);
    await flushPromises();
    expect(wrapper.find('.machine-compare-summary').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('MachinePage machine tabs', () => {
  const OTHER_MACHINE = '02 多段输送段（搭配）';

  afterEach(() => {
    message.destroy();
    vi.restoreAllMocks();
  });

  async function goTo(wrapper: VueWrapper, query: Record<string, string>) {
    await wrapper.vm.$router.replace({ path: '/selection/machine', query });
    await flushPromises();
  }

  it('shows a machine’s own table directly under the first-level tab, without second-level tabs', async () => {
    const wrapper = await mountPage(true, true);
    await flushPromises();
    const tab = useSelectionStore().machineTabs[0]!;
    const direct = tab.pages[0]!;
    expect(direct.direct).toBe(true);

    // 徽标是机型直属表格的记录数
    expect(tabCount(wrapper, '输送机构')).toBe('0');
    expect(wrapper.find('.machine-sub-tabs').exists()).toBe(false);
    expect(wrapper.getComponent(MachineSectionPanel).props()).toMatchObject({
      machineName: MACHINE_TAB_PAGE_OWNER,
      section: { id: direct.id, kind: 'structure' },
      saveFirstRow: undefined,
    });

    // 右侧最上方（一级 Tab 之上）写出选中节点的完整路径；
    // 空表格说明是哪个机型、哪个 Tab，并附新增按钮
    expect(wrapper.get('.machine-node-path').text()).toContain(
      direct.node.item!,
    );
    expect(
      wrapper.get('.machine-workspace').element.firstElementChild?.classList,
    ).toContain('machine-workspace-heading');
    expect(wrapper.getComponent(MachineSectionPanel).props('emptyHint')).toBe(
      `「${direct.node.item}」在「输送机构」下还没有选型记录`,
    );
    expect(wrapper.text()).toContain('还没有选型记录');
    expect(findButton(wrapper, '新增选型')).toBeDefined();

    // 换一个还没有表格的机型：同样直接显示（空）表格，第一次新增记录时才建表
    await clickTreeNode(wrapper, OTHER_MACHINE);
    expect(wrapper.vm.$route.query).toMatchObject({
      item: OTHER_MACHINE,
      tab: String(tab.id),
    });
    expect(wrapper.find('.machine-sub-tabs').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('还没有二级 Tab');
    const panel = wrapper.getComponent(MachineSectionPanel);
    expect(panel.props('section').id).toBe(0);
    const saveFirstRow = panel.props('saveFirstRow') as (
      payload: Record<string, unknown>,
    ) => { ok: boolean; reason?: string };
    // 第一笔记录不合法：表格不建
    const pagesBefore = useSelectionStore().machineTabs[0]!.pages.length;
    expect(saveFirstRow({ role: '缺传感器' })).toMatchObject({
      ok: false,
      reason: 'validation',
    });
    expect(useSelectionStore().machineTabs[0]!.pages).toHaveLength(pagesBefore);
    // 合法时表格和记录一起建
    const sensorId = useSelectionStore().sensors[0]!.id;
    expect(saveFirstRow({ role: '首条记录', sensorIds: [sensorId] }).ok).toBe(
      true,
    );
    const created = useSelectionStore().machineTabs[0]!.pages.find(
      (page) => page.direct && page.node.item === OTHER_MACHINE,
    );
    expect(created).toBeDefined();
    await flushPromises();
    expect(wrapper.getComponent(MachineSectionPanel).props('section').id).toBe(
      created!.id,
    );
    expect(wrapper.text()).toContain('首条记录');
    wrapper.unmount();
  });

  it('shows no second-level tabs for a node that has sub-menus', async () => {
    const wrapper = await mountPage(true, true);
    await flushPromises();
    const node = useSelectionStore().machineTabs[0]!.pages[0]!.node;

    await goTo(wrapper, {
      category: node.category,
      ...(node.configuration ? { configuration: node.configuration } : {}),
    });

    expect(wrapper.text()).toContain('下有子选单');
    expect(wrapper.text()).toContain('请在左侧选择下一级');
    expect(wrapper.find('.machine-sub-tabs').exists()).toBe(false);
    expect(wrapper.find('.machine-section-tabs').exists()).toBe(false);
    wrapper.unmount();
  });

  it('projects configuration directory items into their own first-level-tab content', async () => {
    const wrapper = await mountPage(true, true);
    await flushPromises();
    const store = useSelectionStore();
    const group = store
      .entityGroups('machine')
      .find((item) => item.configurations?.length)!;
    const configuration = group.configurations![0]!.name;
    expect(
      store.saveEntityItem('machine', {
        category: group.name,
        configuration,
        name: '配置目录项',
      }).ok,
    ).toBe(true);
    const node: MachineNodeRef = {
      category: group.name,
      configuration,
      item: '配置目录项',
    };
    const page = store.ensureMachineDirectPage(store.machineTabs[0]!.id, node);
    if (!page.ok) throw new Error('direct page fixture failed');
    expect(
      store.saveMachineSectionRow(page.item.id, MACHINE_TAB_PAGE_OWNER, {
        role: '目录项自己的内容',
        sensorIds: [store.sensors[0]!.id],
      }).ok,
    ).toBe(true);
    await flushPromises();

    await clickTreeNode(wrapper, '配置目录项');
    expect(wrapper.vm.$route.query).toMatchObject({
      category: group.name,
      configuration,
      item: '配置目录项',
    });
    expect(wrapper.find('.machine-sub-tabs').exists()).toBe(false);
    expect(wrapper.getComponent(MachineSectionPanel).props('section').id).toBe(
      page.item.id,
    );
    expect(wrapper.text()).toContain('目录项自己的内容');
    wrapper.unmount();
  });

  it('disables deleting a configuration or category that still has children', async () => {
    const wrapper = await mountPage(true, true);
    await flushPromises();
    const store = useSelectionStore();
    const group = store
      .entityGroups('machine')
      .find((candidate) =>
        candidate.configurations?.some((item) => item.items.length),
      )!;
    const configuration = group.configurations!.find(
      (item) => item.items.length,
    )!.name;
    const menuItem = (label: string) =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
        (item) => item.textContent?.includes(label),
      );

    await wrapper
      .get(`button[aria-label="${configuration} 的更多操作"]`)
      .trigger('click');
    await flushPromises();
    expect(menuItem('删除配置')?.textContent?.trim()).toBe(
      '删除配置（下面还有内容）',
    );
    expect(menuItem('删除配置')?.getAttribute('aria-disabled')).toBe('true');

    await wrapper
      .get(`button[aria-label="${group.name} 的更多操作"]`)
      .trigger('click');
    await flushPromises();
    expect(menuItem('删除分类')?.textContent?.trim()).toBe(
      '删除分类（下面还有内容）',
    );
    expect(menuItem('删除分类')?.getAttribute('aria-disabled')).toBe('true');
    wrapper.unmount();
  });

  it('migrates legacy configuration pages into directory items without changing content ids', () => {
    const seed = buildDefaultStore({
      crudDefaults: CRUD_DEFAULTS,
      sensorData: SENSOR_DATA,
    });
    const groups = seed[keyFor('entity-groups', 'machine')] as EntityGroup[];
    const group = groups.find((item) => item.configurations?.length)!;
    const configuration = group.configurations![0]!;
    seed[keyFor('machine-tabs', 'all')] = [
      {
        id: 90,
        catalog: 'mechanism',
        name: '输送机构',
        sort: 1,
        kind: 'structure',
        pages: [
          {
            id: 910,
            name: '迁移目录项',
            node: {
              category: group.name,
              configuration: configuration.name,
              item: null,
            },
          },
        ],
      },
    ];
    seed[machineSectionRowsKey(910, MACHINE_TAB_PAGE_OWNER)] = [
      { id: 1, role: '旧页内容', sensorIds: [] },
    ];
    let persisted = JSON.stringify(seed);
    const repository = createSelectionRepository({
      crudDefaults: CRUD_DEFAULTS,
      demoData: true,
      sensorData: SENSOR_DATA,
      storage: {
        getItem: () => persisted,
        setItem: (_key, value) => {
          persisted = value;
        },
      },
    });

    const migratedGroups = repository.getEntityGroups('machine');
    expect(
      migratedGroups
        .find((item) => item.name === group.name)
        ?.configurations?.find((item) => item.name === configuration.name)
        ?.items,
    ).toContain('迁移目录项');
    expect(repository.getMachineTabs()[0]!.pages[0]).toMatchObject({
      id: 910,
      direct: true,
      node: { item: '迁移目录项' },
    });
    expect(
      repository.getMachineSectionRows(910, MACHINE_TAB_PAGE_OWNER)[0]?.role,
    ).toBe('旧页内容');
  });

  it('keeps directory order and first-level-tab content linked through rename and delete', async () => {
    const wrapper = await mountPage(true, true);
    await flushPromises();
    const store = useSelectionStore();
    const group = store
      .entityGroups('machine')
      .find((item) => item.configurations?.length)!;
    const configuration = group.configurations![0]!;
    expect(
      store.saveEntityItem('machine', {
        category: group.name,
        configuration: configuration.name,
        name: '目录项甲',
      }).ok,
    ).toBe(true);
    expect(
      store.saveEntityItem('machine', {
        category: group.name,
        configuration: configuration.name,
        name: '目录项乙',
      }).ok,
    ).toBe(true);
    const items = store
      .entityGroups('machine')
      .find((item) => item.name === group.name)!
      .configurations!.find((item) => item.name === configuration.name)!.items;
    const from = items.indexOf('目录项乙');
    const to = items.indexOf('目录项甲');
    expect(
      store.reorderEntityItems(
        'machine',
        group.name,
        from,
        to,
        configuration.name,
      ).ok,
    ).toBe(true);
    const reorderedItems = store
      .entityGroups('machine')
      .find((item) => item.name === group.name)!
      .configurations!.find((item) => item.name === configuration.name)!.items;
    expect(reorderedItems.indexOf('目录项乙')).toBeLessThan(
      reorderedItems.indexOf('目录项甲'),
    );
    const node: MachineNodeRef = {
      category: group.name,
      configuration: configuration.name,
      item: '目录项甲',
    };
    const page = store.ensureMachineDirectPage(store.machineTabs[0]!.id, node);
    if (!page.ok) throw new Error('direct page fixture failed');
    expect(
      store.saveEntityItem(
        'machine',
        {
          category: group.name,
          configuration: configuration.name,
          name: '目录项甲（改）',
          previousCategory: group.name,
          previousConfiguration: configuration.name,
        },
        '目录项甲',
      ).ok,
    ).toBe(true);
    expect(store.machineTabs[0]!.pages).toContainEqual(
      expect.objectContaining({
        id: page.item.id,
        node: expect.objectContaining({ item: '目录项甲（改）' }),
      }),
    );
    expect(
      store.deleteEntityItem(
        'machine',
        '目录项甲（改）',
        group.name,
        configuration.name,
      ).ok,
    ).toBe(true);
    expect(
      store.machineTabs[0]!.pages.some((item) => item.id === page.item.id),
    ).toBe(false);
    wrapper.unmount();
  });

  it('deletes a tab together with all machine directory-item content', async () => {
    const wrapper = await mountPage(true, true);
    await flushPromises();
    const confirm = vi.spyOn(dialogs, 'confirm').mockResolvedValueOnce(true);

    // Tab 上没有「×」：删除放在「编辑 Tab」对话框里
    expect(wrapper.find('.ant-tabs-tab-remove').exists()).toBe(false);
    await wrapper.get('button[aria-label="编辑 Tab"]').trigger('click');
    await flushPromises();
    [...document.querySelectorAll<HTMLButtonElement>('.ant-modal button')]
      .find((button) => button.textContent?.trim() === '删除 Tab')
      ?.click();
    await flushPromises();

    expect(JSON.stringify(confirm.mock.calls[0])).toContain('1 个机型目录项');
    expect(useSelectionStore().machineTabs).toEqual([]);
    expect(wrapper.text()).toContain('还没有 Tab');
    expect(findButton(wrapper, '新建Tab')).toBeDefined();
    wrapper.unmount();
  });

  it('shows directory-item content without maintenance actions to read-only users', async () => {
    const wrapper = await mountPage(true, false);
    await flushPromises();
    expect(wrapper.getComponent(EntityTree).props('editable')).toBe(false);
    expect(wrapper.getComponent(EntityTree).props('sortable')).toBe(false);
    expect(wrapper.find('.entity-tree__more').exists()).toBe(false);
    expect(wrapper.find('.ant-tabs-nav-add').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="编辑 Tab"]').exists()).toBe(false);
    expect(wrapper.findComponent(MachineSectionPanel).exists()).toBe(true);
    expect(wrapper.find('button[aria-label="新增选型"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
