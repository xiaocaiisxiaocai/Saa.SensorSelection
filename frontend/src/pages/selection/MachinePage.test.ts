import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { filterMachineGroups, MACHINE_TAB_PAGE_OWNER } from '@/domain';
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
import MachineGlobalSearchFilters from './machine/MachineGlobalSearchFilters.vue';
import MachineGlobalSearchResults from './machine/MachineGlobalSearchResults.vue';
import MachineSectionPanel from './machine/MachineSectionPanel.vue';
import { resolveMachineSelection } from './machine/machine-selection';
import MachinePage from './MachinePage.vue';

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
  // 结构目录有一个「输送机构」Tab，下面有一个二级 Tab
  const conveyor = selectionStore.saveMachineTab('mechanism', {
    kind: 'structure',
    name: '输送机构',
    sort: 1,
  });
  if (!conveyor.ok) throw new Error('tab fixture failed');
  // 打开页面时默认选中结构目录的第一个机型：机型没有二级 Tab，
  // 它在「输送机构」下有一张直属表格
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
    const machineModel = selectionStore.dictionaryItems('machine-model')[0];
    if (!sensor || !machineModel)
      throw new Error('global search fixture failed');
    const row = selectionStore.saveMachineSectionRow(section.id, machineName, {
      machineModelId: machineModel.id,
      role: '入料确认',
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
    const machineField = filters
      .findAllComponents({ name: 'ASelect' })
      .find((component) => component.props('placeholder') === '选择适用机型');
    machineField?.vm.$emit('update:value', [machineModel.id]);
    await flushPromises();

    expect(results.text()).toContain('找到 1 个结构');
    const query = inputBy(filters, '搜索结构名称、功能作用或传感器');
    query?.vm.$emit('update:value', '不会命中的关键词');
    await flushPromises();
    expect(results.text()).toContain('找到 0 个结构');
    expect(results.text()).toContain('没有找到符合条件的结构');
    query?.vm.$emit('update:value', '');
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
    // 「已选 N / M 个机型」按机型（目录树末级节点）计数，没有二级 Tab 的机型也能勾
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

  it('offers an optional process-step selector for structure records only', async () => {
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
    const processStep = selectionStore.processSteps[0];
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
    if (!processStep || !structure.ok || !notes.ok) {
      throw new Error('process-step fixture failed');
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
    const processSelect = structurePanel
      .findAllComponents({ name: 'ASelect' })
      .find(
        (component) =>
          component.props('placeholder') === '选择工艺制程（可选）',
      );
    expect(processSelect).toBeDefined();
    expect(processSelect?.props('allowClear')).toBe(true);
    expect(processSelect?.props('options')).toEqual(
      selectionStore.processSteps.map((item) => ({
        label: `${item.layer} · ${item.name}`,
        value: item.id,
      })),
    );
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
            component.props('placeholder') === '选择工艺制程（可选）',
        ),
    ).toBe(false);
    expect(
      notesPanel
        .findAllComponents({ name: 'ASelect' })
        .some(
          (component) =>
            component.props('placeholder') === '选择机型（可选）' ||
            component.props('placeholder') === '选择板件特性（可选）',
        ),
    ).toBe(false);
    notesPanel.unmount();
  });

  it('offers searchable optional machine and board dictionary bindings for structure records only', async () => {
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

    const machineSelect = wrapper
      .findAllComponents({ name: 'ASelect' })
      .find(
        (component) => component.props('placeholder') === '选择机型（可选）',
      );
    const boardSelect = wrapper
      .findAllComponents({ name: 'ASelect' })
      .find(
        (component) =>
          component.props('placeholder') === '选择板件特性（可选）',
      );
    expect(machineSelect?.props('showSearch')).toBe(true);
    expect(machineSelect?.props('allowClear')).toBe(true);
    expect(machineSelect?.props('options')).toEqual(
      selectionStore.dictionaryItems('machine-model').map((item) => ({
        label: item.name,
        value: item.id,
      })),
    );
    expect(boardSelect?.props('showSearch')).toBe(true);
    expect(boardSelect?.props('allowClear')).toBe(true);
    expect(boardSelect?.props('options')).toEqual(
      selectionStore.dictionaryItems('board-characteristic').map((item) => ({
        label: item.name,
        value: item.id,
      })),
    );
    const sensor = selectionStore.sensors[0];
    const machineModel = selectionStore.dictionaryItems('machine-model')[0];
    const boardCharacteristic = selectionStore.dictionaryItems(
      'board-characteristic',
    )[0];
    if (!sensor || !machineModel || !boardCharacteristic) {
      throw new Error('dictionary binding options missing');
    }
    expect(
      selectionStore.saveMachineSectionRow(structure.item.id, '测试机型', {
        role: '字典绑定显示',
        sensorIds: [sensor.id],
        machineModelId: machineModel.id,
        boardCharacteristicId: boardCharacteristic.id,
      }).ok,
    ).toBe(true);
    await flushPromises();
    expect(wrapper.text()).toContain(machineModel.name);
    expect(wrapper.text()).toContain(boardCharacteristic.name);
    wrapper.unmount();
  });

  it('searches structure records by their linked process step', async () => {
    window.localStorage.clear();
    const wrapper = await mountPage();
    const selectionStore = useSelectionStore();
    const panel = wrapper.getComponent(MachineSectionPanel);
    const machineName = panel.props('machineName') as string;
    const section = panel.props('section') as { id: number; kind: string };
    const [firstProcessStep, secondProcessStep] = selectionStore.processSteps;
    const sensor = selectionStore.sensors[0];

    expect(section.kind).toBe('structure');
    expect(firstProcessStep).toBeDefined();
    expect(secondProcessStep).toBeDefined();
    expect(sensor).toBeDefined();
    if (!firstProcessStep || !secondProcessStep || !sensor) return;

    expect(
      selectionStore.saveMachineSectionRow(section.id, machineName, {
        note: '',
        processStepId: firstProcessStep.id,
        purpose: '',
        role: '制程搜索-不匹配',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);
    expect(
      selectionStore.saveMachineSectionRow(section.id, machineName, {
        note: '',
        processStepId: secondProcessStep.id,
        purpose: '',
        role: '制程搜索-匹配',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);
    await flushPromises();

    const search = inputBy(panel, '搜索规格、型号或功能');
    expect(search).toBeDefined();

    search!.vm.$emit('update:value', secondProcessStep.name);
    await flushPromises();

    expect(panel.text()).toContain('制程搜索-匹配');
    expect(panel.text()).not.toContain('制程搜索-不匹配');
    wrapper.unmount();
  });

  it('filters structure records from a searchable process-step dropdown', async () => {
    window.localStorage.clear();
    const wrapper = await mountPage();
    const selectionStore = useSelectionStore();
    const panel = wrapper.getComponent(MachineSectionPanel);
    const machineName = panel.props('machineName') as string;
    const section = panel.props('section') as { id: number; kind: string };
    const [firstProcessStep, secondProcessStep] = selectionStore.processSteps;
    const sensor = selectionStore.sensors[0];

    expect(section.kind).toBe('structure');
    expect(firstProcessStep).toBeDefined();
    expect(secondProcessStep).toBeDefined();
    expect(sensor).toBeDefined();
    if (!firstProcessStep || !secondProcessStep || !sensor) return;

    expect(
      selectionStore.saveMachineSectionRow(section.id, machineName, {
        note: '',
        processStepId: firstProcessStep.id,
        purpose: '',
        role: '制程下拉-不匹配',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);
    expect(
      selectionStore.saveMachineSectionRow(section.id, machineName, {
        note: '',
        processStepId: secondProcessStep.id,
        purpose: '',
        role: '制程下拉-匹配',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);
    await flushPromises();

    const processFilter = findColumn(panel, '工艺制程').column;
    expect(processFilter.filterSearch).toBe(true);
    expect(processFilter.filterMultiple).toBe(true);
    expect(processFilter.filters).toEqual(
      selectionStore.processSteps.map((item) => ({
        text: `${item.layer} · ${item.name}`,
        value: item.id,
      })),
    );

    await chooseColumnFilter(panel, '工艺制程', [secondProcessStep.id]);

    expect(panel.text()).toContain('制程下拉-匹配');
    expect(panel.text()).not.toContain('制程下拉-不匹配');

    await panel.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(findColumn(panel, '工艺制程').column.filteredValue).toBeNull();
    expect(panel.text()).toContain('制程下拉-不匹配');
    wrapper.unmount();
  });

  it('filters structure records from searchable machine-model and board-characteristic dropdowns', async () => {
    window.localStorage.clear();
    const wrapper = await mountPage();
    const selectionStore = useSelectionStore();
    const panel = wrapper.getComponent(MachineSectionPanel);
    const machineName = panel.props('machineName') as string;
    const section = panel.props('section') as { id: number; kind: string };
    const [firstMachineModel, secondMachineModel] =
      selectionStore.dictionaryItems('machine-model');
    const [firstBoardCharacteristic, secondBoardCharacteristic] =
      selectionStore.dictionaryItems('board-characteristic');
    const sensor = selectionStore.sensors[0];

    expect(section.kind).toBe('structure');
    expect(firstMachineModel).toBeDefined();
    expect(secondMachineModel).toBeDefined();
    expect(firstBoardCharacteristic).toBeDefined();
    expect(secondBoardCharacteristic).toBeDefined();
    expect(sensor).toBeDefined();
    if (
      !firstMachineModel ||
      !secondMachineModel ||
      !firstBoardCharacteristic ||
      !secondBoardCharacteristic ||
      !sensor
    ) {
      return;
    }

    expect(
      selectionStore.saveMachineSectionRow(section.id, machineName, {
        boardCharacteristicId: firstBoardCharacteristic.id,
        machineModelId: firstMachineModel.id,
        note: '',
        purpose: '',
        role: '字典筛选-第一项',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);
    expect(
      selectionStore.saveMachineSectionRow(section.id, machineName, {
        boardCharacteristicId: secondBoardCharacteristic.id,
        machineModelId: secondMachineModel.id,
        note: '',
        purpose: '',
        role: '字典筛选-第二项',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);
    await flushPromises();

    const machineModelFilter = findColumn(panel, '机型').column;
    const boardCharacteristicFilter = findColumn(panel, '板件特性').column;

    expect(machineModelFilter.filterSearch).toBe(true);
    expect(machineModelFilter.filterMultiple).toBe(true);
    expect(machineModelFilter.filters).toEqual(
      selectionStore.dictionaryItems('machine-model').map((item) => ({
        text: item.name,
        value: item.id,
      })),
    );
    expect(boardCharacteristicFilter.filterSearch).toBe(true);
    expect(boardCharacteristicFilter.filters).toEqual(
      selectionStore.dictionaryItems('board-characteristic').map((item) => ({
        text: item.name,
        value: item.id,
      })),
    );
    expect(findColumn(panel, '传感器类型').column.filterSearch).toBe(true);
    expect(findColumn(panel, '工艺制程').column.filterSearch).toBe(true);

    await chooseColumnFilter(panel, '机型', [secondMachineModel.id]);
    expect(panel.text()).toContain('字典筛选-第二项');
    expect(panel.text()).not.toContain('字典筛选-第一项');

    await panel.get('button[aria-label="重置筛选"]').trigger('click');
    await chooseColumnFilter(panel, '板件特性', [firstBoardCharacteristic.id]);
    expect(panel.text()).toContain('字典筛选-第一项');
    expect(panel.text()).not.toContain('字典筛选-第二项');

    await panel.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(findColumn(panel, '机型').column.filteredValue).toBeNull();
    expect(findColumn(panel, '板件特性').column.filteredValue).toBeNull();
    expect(panel.text()).toContain('字典筛选-第一项');
    expect(panel.text()).toContain('字典筛选-第二项');
    wrapper.unmount();
  });

  it('keeps structure labels compact and gives specifications more room', async () => {
    const wrapper = await mountPage(true, true);
    const widths = Object.values(columnWidths(wrapper));

    expect(widths).toEqual([104, 100, 136, 144, 152, 220, 120, 96, 152, 72]);

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

describe('MachinePage machine tabs', () => {
  const OTHER_MACHINE = '02 多段输送段（搭配）';

  afterEach(() => {
    message.destroy();
    vi.restoreAllMocks();
  });

  const pageNames = (wrapper: VueWrapper) =>
    wrapper.findAll('.machine-sub-tab__name').map((page) => page.text().trim());

  async function openPageMenu(wrapper: VueWrapper, name: string) {
    await wrapper
      .get(`button[aria-label="二级 Tab ${name} 的更多操作"]`)
      .trigger('click');
    await flushPromises();
  }

  async function runPageAction(
    wrapper: VueWrapper,
    name: string,
    action: string,
  ) {
    await openPageMenu(wrapper, name);
    const item = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((menuItem) => menuItem.textContent?.trim() === action);
    if (!item) throw new Error(`menu item "${action}" not found`);
    item.click();
    await flushPromises();
  }

  async function fillPageDialog(name: string) {
    const input = document.querySelector<HTMLInputElement>(
      '#machine-tab-page-name',
    );
    if (!input) throw new Error('page dialog not open');
    input.value = name;
    input.dispatchEvent(new Event('input'));
    await flushPromises();
    [...document.querySelectorAll<HTMLButtonElement>('.ant-modal button')]
      .find((button) => button.textContent?.trim() === '保存')
      ?.click();
    await flushPromises();
  }

  async function createPage(wrapper: VueWrapper, name: string) {
    // 已有二级 Tab 时在栏右侧，还没有时是空态里的按钮
    const button = wrapper.find('button[aria-label="新建二级 Tab"]').exists()
      ? wrapper.get('button[aria-label="新建二级 Tab"]')
      : findButton(wrapper, '新建二级Tab')!;
    await button.trigger('click');
    await flushPromises();
    await fillPageDialog(name);
  }

  async function goTo(wrapper: VueWrapper, query: Record<string, string>) {
    await wrapper.vm.$router.replace({ path: '/selection/machine', query });
    await flushPromises();
  }

  /** 在第一个有配置的分类下新建一个空配置并选中它：没有子选单的配置才能建二级 Tab */
  async function openEmptyConfiguration(wrapper: VueWrapper, name = '空配置') {
    const store = useSelectionStore();
    const category = store
      .entityGroups('machine')
      .find((group) => group.configurations?.length)!.name;
    expect(store.saveMachineConfiguration(category, { name }).ok).toBe(true);
    await goTo(wrapper, { category, configuration: name });
    return { category, configuration: name, item: null };
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
    ).toContain('machine-node-path');
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

  it('lets an empty configuration own second-level tabs and then locks adding machines under it', async () => {
    const wrapper = await mountPage(true, true);
    await flushPromises();
    const store = useSelectionStore();
    const category = store
      .entityGroups('machine')
      .find((group) => group.configurations?.length)!.name;
    expect(
      store.saveMachineConfiguration(category, { name: '空配置' }).ok,
    ).toBe(true);
    await flushPromises();

    // 没有子节点的配置是末级节点，可以选中
    await wrapper
      .get('input[placeholder="搜索分类或机型…"]')
      .setValue('空配置');
    await flushPromises();
    await clickTreeNode(wrapper, '空配置');
    expect(wrapper.vm.$route.query).toMatchObject({
      category,
      configuration: '空配置',
    });
    await createPage(wrapper, '配置页');
    expect(pageNames(wrapper)).toEqual(['配置页']);

    // 有二级 Tab 了：「新建机型」禁用，原因写在菜单文字里
    await wrapper
      .get('button[aria-label="空配置 的更多操作"]')
      .trigger('click');
    await flushPromises();
    const create = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent?.includes('新建机型'));
    expect(create?.textContent?.trim()).toBe('新建机型（已有二级 Tab）');
    expect(create?.getAttribute('aria-disabled')).toBe('true');
    // 删除也一样：先禁用并写明原因，不用点了确认才被拒
    const menuItem = (label: string) =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
        (item) => item.textContent?.includes(label),
      );
    expect(menuItem('删除配置')?.textContent?.trim()).toBe(
      '删除配置（已有二级 Tab）',
    );
    expect(menuItem('删除配置')?.getAttribute('aria-disabled')).toBe('true');
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

  it('creates, reorders, renames and deletes second-level tabs on an empty configuration', async () => {
    const wrapper = await mountPage(true, true);
    await flushPromises();
    const store = useSelectionStore();
    await openEmptyConfiguration(wrapper);

    await createPage(wrapper, '入料段');
    await createPage(wrapper, '出料确认');
    expect(pageNames(wrapper)).toEqual(['入料段', '出料确认']);
    const created = store.machineTabs[0]!.pages.find(
      (page) => page.name === '出料确认',
    )!;
    expect(wrapper.vm.$route.query.page).toBe(String(created.id));

    await runPageAction(wrapper, '出料确认', '左移');
    expect(pageNames(wrapper)).toEqual(['出料确认', '入料段']);

    await runPageAction(wrapper, '出料确认', '改名');
    expect(
      document.querySelector<HTMLInputElement>('#machine-tab-page-name')!.value,
    ).toBe('出料确认');
    await fillPageDialog('出料确认（改）');
    expect(pageNames(wrapper)).toEqual(['出料确认（改）', '入料段']);

    vi.spyOn(dialogs, 'confirm').mockResolvedValueOnce(true);
    await runPageAction(wrapper, '出料确认（改）', '删除');
    expect(pageNames(wrapper)).toEqual(['入料段']);
    wrapper.unmount();
  });

  it('allows the same page name under different tabs and nodes, never on a machine', async () => {
    const wrapper = await mountPage(true, true);
    await flushPromises();
    const store = useSelectionStore();
    const node = await openEmptyConfiguration(wrapper);
    const conveyor = store.machineTabs[0]!;
    const lifter = store.saveMachineTab('mechanism', {
      kind: 'structure',
      name: '收板机构',
    });
    if (!lifter.ok) throw new Error('tab fixture failed');
    for (const tabId of [conveyor.id, lifter.item.id]) {
      expect(store.saveMachineTabPage(tabId, { name: '入料段', node }).ok).toBe(
        true,
      );
    }
    expect(
      store.saveMachineTabPage(lifter.item.id, { name: '入料段', node }),
    ).toEqual({ ok: false, reason: 'duplicate' });
    // 机型没有二级 Tab
    expect(
      store.saveMachineTabPage(lifter.item.id, {
        name: '入料段',
        node: conveyor.pages[0]!.node,
      }),
    ).toEqual({ ok: false, reason: 'validation' });
    wrapper.unmount();
  });

  it('deletes a tab together with its tables and second-level tabs', async () => {
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

    expect(JSON.stringify(confirm.mock.calls[0])).toContain('1 个机型的选型表');
    expect(useSelectionStore().machineTabs).toEqual([]);
    expect(wrapper.text()).toContain('还没有 Tab');
    expect(findButton(wrapper, '新建Tab')).toBeDefined();
    wrapper.unmount();
  });

  it('offers no page menus or 新建 to read-only users', async () => {
    const wrapper = await mountPage(true, false);
    await flushPromises();
    const store = useSelectionStore();
    const node = await openEmptyConfiguration(wrapper);
    expect(
      store.saveMachineTabPage(store.machineTabs[0]!.id, {
        name: '入料段',
        node,
      }).ok,
    ).toBe(true);
    await flushPromises();

    expect(pageNames(wrapper)).toEqual(['入料段']);
    expect(
      wrapper.find('button[aria-label="二级 Tab 入料段 的更多操作"]').exists(),
    ).toBe(false);
    expect(wrapper.find('button[aria-label="新建二级 Tab"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });
});
