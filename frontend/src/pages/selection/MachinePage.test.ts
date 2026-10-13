import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MACHINE_CONTENT_SECTION_ID } from '@/domain';
import { dialogs } from '@/pages/shared/confirm';
import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import {
  chooseSegment,
  columnWidths,
  findButton,
  runTreeAction,
  tabCount,
  toggleTreeCheck,
  treeChecks,
  treeNodes,
} from '@/test-helpers';
import EntityTree from './EntityTree.vue';
import MachineGlobalSearch from './machine/MachineGlobalSearch.vue';
import MachineSectionPanel from './machine/MachineSectionPanel.vue';
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
  // 结构目录有一个「输送机构」Tab，第一个机型已放在里面
  const conveyor = selectionStore.saveMachineTab('mechanism', {
    kind: 'structure',
    name: '输送机构',
    sort: 1,
  });
  if (!conveyor.ok) throw new Error('tab fixture failed');
  expect(
    selectionStore.placeMachineInTab('01 单段输送段（搭配）', conveyor.item.id)
      .ok,
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
    const globalSearch = wrapper.getComponent(MachineGlobalSearch);
    expect(globalSearch.text()).not.toContain('上层制程');
    expect(globalSearch.text()).not.toContain('全部制程');
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

    const globalSearch = wrapper.getComponent(MachineGlobalSearch);
    // 已选条件全部显示，不折叠成「+N」
    expect(
      globalSearch
        .findAllComponents({ name: 'ASelect' })
        .every((field) => field.props('maxTagCount') === undefined),
    ).toBe(true);
    const machineField = globalSearch
      .findAllComponents({ name: 'ASelect' })
      .find((component) => component.props('placeholder') === '选择适用机型');
    machineField?.vm.$emit('update:value', [machineModel.id]);
    await flushPromises();
    await findButton(globalSearch, '查找')?.trigger('click');
    await flushPromises();

    expect(globalSearch.text()).toContain('找到 1 个结构');
    const result = globalSearch
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

  it('enables global search when only a board characteristic is selected', async () => {
    const wrapper = await mountPage(true, true);
    await chooseSegment(
      wrapper.findAllComponents({ name: 'ASegmented' })[1]!,
      '条件查找',
    );

    const globalSearch = wrapper.getComponent(MachineGlobalSearch);
    const searchButton = () => findButton(globalSearch, '查找');
    expect(searchButton()?.attributes('disabled')).toBeDefined();
    const boardField = globalSearch
      .findAllComponents({ name: 'ASelect' })
      .find((component) => component.props('placeholder') === '选择板件特性');
    const board = useSelectionStore().dictionaryItems(
      'board-characteristic',
    )[0];
    boardField?.vm.$emit('update:value', [board?.id]);
    await flushPromises();

    expect(searchButton()?.attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('hides every report operation when not signed in', async () => {
    const wrapper = await mountPage();
    expect(wrapper.text()).not.toContain('生成并下载报告');
    expect(wrapper.text()).not.toContain('预览 / 打印 PDF');
    expect(wrapper.text()).not.toContain('全选机型');
    expect(wrapper.find('.ant-tree-checkbox').exists()).toBe(false);
    expect(wrapper.text()).toMatch(/输送机构|分类/);
    wrapper.unmount();
  });

  it('shows report operations to an authenticated read-only user', async () => {
    const wrapper = await mountPage(true);
    expect(wrapper.text()).toContain('生成并下载报告');
    expect(wrapper.text()).toContain('预览 / 打印 PDF');
    expect(wrapper.text()).toContain('全选机型');
    expect(wrapper.find('.ant-tree-checkbox').exists()).toBe(true);
    expect(wrapper.text()).toMatch(/输送机构|分类/);
    wrapper.unmount();
  });

  it('checks only the selected tree node when machine names are duplicated', async () => {
    const wrapper = await mountPage(true);
    const duplicates = treeNodes(wrapper, '01 中心拍板');
    expect(duplicates.length).toBeGreaterThan(1);
    await toggleTreeCheck(wrapper, '01 中心拍板', 0);

    expect(treeChecks(wrapper, '01 中心拍板')).toEqual(
      duplicates.map((_, index) => index === 0),
    );
    expect(wrapper.text()).toMatch(/已选\s+1\s+\//);
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

  it('explains why a selected machine with no rows or images cannot be reported', async () => {
    const wrapper = await mountPage(true);
    await toggleTreeCheck(wrapper, '02 多段输送段（搭配）');

    const openSpy = vi.spyOn(window, 'open');
    const warning = vi.spyOn(message, 'warning');
    await findButton(wrapper, '预览/打印PDF')?.trigger('click');

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

    const processFilter = panel
      .findAllComponents({ name: 'ASelect' })
      .find((component) => component.props('placeholder') === '工艺制程');
    expect(processFilter).toBeDefined();
    expect(processFilter?.props('showSearch')).toBe(true);
    expect(processFilter?.props('allowClear')).toBe(true);
    expect(processFilter?.props('options')).toEqual(
      selectionStore.processSteps.map((item) => ({
        label: `${item.layer} · ${item.name}`,
        value: item.id,
      })),
    );

    processFilter?.vm.$emit('update:value', secondProcessStep.id);
    await flushPromises();

    expect(panel.text()).toContain('制程下拉-匹配');
    expect(panel.text()).not.toContain('制程下拉-不匹配');

    await panel.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(processFilter?.props('value')).toBeNull();
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

    const selects = panel.findAllComponents({ name: 'ASelect' });
    const machineModelFilter = selects.find(
      (component) => component.props('placeholder') === '机型',
    );
    const boardCharacteristicFilter = selects.find(
      (component) => component.props('placeholder') === '板件特性',
    );

    expect(machineModelFilter).toBeDefined();
    expect(machineModelFilter?.props('showSearch')).toBe(true);
    expect(machineModelFilter?.props('allowClear')).toBe(true);
    expect(machineModelFilter?.props('options')).toEqual(
      selectionStore.dictionaryItems('machine-model').map((item) => ({
        label: item.name,
        value: item.id,
      })),
    );
    expect(boardCharacteristicFilter).toBeDefined();
    expect(boardCharacteristicFilter?.props('showSearch')).toBe(true);
    expect(boardCharacteristicFilter?.props('allowClear')).toBe(true);
    expect(boardCharacteristicFilter?.props('options')).toEqual(
      selectionStore.dictionaryItems('board-characteristic').map((item) => ({
        label: item.name,
        value: item.id,
      })),
    );

    machineModelFilter?.vm.$emit('update:value', secondMachineModel.id);
    await flushPromises();
    expect(panel.text()).toContain('字典筛选-第二项');
    expect(panel.text()).not.toContain('字典筛选-第一项');

    await panel.get('button[aria-label="重置筛选"]').trigger('click');
    boardCharacteristicFilter?.vm.$emit(
      'update:value',
      firstBoardCharacteristic.id,
    );
    await flushPromises();
    expect(panel.text()).toContain('字典筛选-第一项');
    expect(panel.text()).not.toContain('字典筛选-第二项');

    await panel.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(machineModelFilter?.props('value')).toBeNull();
    expect(boardCharacteristicFilter?.props('value')).toBeNull();
    expect(panel.text()).toContain('字典筛选-第一项');
    expect(panel.text()).toContain('字典筛选-第二项');
    wrapper.unmount();
  });

  it('keeps structure labels compact and gives specifications more room', async () => {
    const wrapper = await mountPage(true, true);
    const widths = Object.values(columnWidths(wrapper));

    expect(widths).toEqual([104, 100, 110, 120, 116, 220, 120, 96, 72]);

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

  it('auto-collapses the schematic rail on compact desktop widths and lets users reopen it', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('1439px'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => true,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    const wrapper = await mountPage(true, true);
    const panel = wrapper.getComponent(MachineSectionPanel);

    expect(panel.get('.machine-body').classes()).toContain(
      'machine-body--images-collapsed',
    );
    await panel.get('[aria-label="展开结构示意图"]').trigger('click');
    expect(panel.get('.machine-body').classes()).not.toContain(
      'machine-body--images-collapsed',
    );
    expect(panel.get('[aria-label="折叠结构示意图"]')).toBeTruthy();
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

  it('shows the schematic upload only after the current tab has content', async () => {
    const wrapper = await mountPage(true, true);
    const selectionStore = useSelectionStore();
    const panel = wrapper.getComponent(MachineSectionPanel);
    const machineName = panel.props('machineName') as string;
    const section = panel.props('section') as { id: number; kind: string };
    const sensor = selectionStore.sensors[0];

    const expandImages = panel.find('[aria-label="展开结构示意图"]');
    if (expandImages.exists()) await expandImages.trigger('click');

    expect(panel.find('.ant-upload-drag').exists()).toBe(false);
    expect(panel.text()).toContain('请先新增内容后再添加图片');
    expect(sensor).toBeDefined();
    if (!sensor) return;

    expect(
      selectionStore.saveMachineSectionRow(section.id, machineName, {
        note: '',
        purpose: '',
        role: '上传前置内容',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);
    await flushPromises();

    expect(panel.find('.ant-upload-drag').exists()).toBe(true);
    expect(panel.text()).not.toContain('请先新增内容后再添加图片');
    wrapper.unmount();
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

    const typeFilter = selectBy(panel, '传感器类型')!;
    expect(typeFilter).toBeDefined();
    typeFilter.vm.$emit(
      'update:value',
      sensors.slice(0, 2).map((sensor) => sensor.sensorType),
    );
    await flushPromises();

    expect(wrapper.text()).toContain('机型类型多选-1');
    expect(wrapper.text()).toContain('机型类型多选-2');
    expect(wrapper.text()).not.toContain('机型类型多选-3');

    await panel.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(typeFilter.props('value')).toEqual([]);
    expect(wrapper.text()).toContain('机型类型多选-3');
    wrapper.unmount();
  });
});

describe('MachinePage machine tabs', () => {
  const PLACED = '01 单段输送段（搭配）';
  const LOOSE = '02 多段输送段（搭配）';

  afterEach(() => {
    message.destroy();
    vi.restoreAllMocks();
  });

  const chipNames = (wrapper: VueWrapper) =>
    wrapper.findAll('.machine-sub-tab__name').map((chip) => chip.text().trim());

  async function runChipAction(
    wrapper: VueWrapper,
    name: string,
    action: string,
  ) {
    await wrapper
      .get(`button[aria-label="${name} 的更多操作"]`)
      .trigger('click');
    await flushPromises();
    const item = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((menuItem) => menuItem.textContent?.trim() === action);
    if (!item) throw new Error(`menu item "${action}" not found`);
    item.click();
    await flushPromises();
  }

  it('shows a placed machine only under its tab, with its own content', async () => {
    const wrapper = await mountPage(true, true);
    await flushPromises();
    const tabId = useSelectionStore().machineTabs[0]!.id;

    expect(treeNodes(wrapper, PLACED)).toHaveLength(0);
    expect(treeNodes(wrapper, LOOSE).length).toBeGreaterThan(0);
    expect(tabCount(wrapper, '输送机构')).toBe('1');
    expect(chipNames(wrapper)).toEqual([PLACED]);
    expect(wrapper.vm.$route.query).toMatchObject({
      tab: String(tabId),
      item: PLACED,
    });
    expect(
      wrapper.getComponent(MachineSectionPanel).props('section'),
    ).toMatchObject({ id: MACHINE_CONTENT_SECTION_ID, name: '输送机构' });
    wrapper.unmount();
  });

  it('moves a tree machine into a tab from its menu and back from the tag menu', async () => {
    const wrapper = await mountPage(true, true);
    await flushPromises();
    const tabId = useSelectionStore().machineTabs[0]!.id;

    await runTreeAction(wrapper, LOOSE, '移到 Tab…');
    selectBy(wrapper, '选择 Tab')?.vm.$emit('update:value', tabId);
    await flushPromises();
    [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === '移动')
      ?.click();
    await flushPromises();

    expect(treeNodes(wrapper, LOOSE)).toHaveLength(0);
    expect(chipNames(wrapper)).toEqual([PLACED, LOOSE]);
    expect(wrapper.vm.$route.query.item).toBe(LOOSE);

    await runChipAction(wrapper, LOOSE, '移回目录');
    expect(chipNames(wrapper)).toEqual([PLACED]);
    expect(treeNodes(wrapper, LOOSE).length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it('returns the machines of a deleted tab to the tree', async () => {
    const wrapper = await mountPage(true, true);
    await flushPromises();
    vi.spyOn(dialogs, 'confirm').mockResolvedValueOnce(true);

    await wrapper.get('.ant-tabs-tab-remove').trigger('click');
    await flushPromises();

    expect(useSelectionStore().machineTabs).toEqual([]);
    expect(treeNodes(wrapper, PLACED).length).toBeGreaterThan(0);
    // 一个 Tab 都没有了：先引导新建 Tab（哪怕正选着目录树里的机型）
    expect(wrapper.text()).toContain('还没有 Tab');
    expect(findButton(wrapper, '新建Tab')).toBeDefined();
    wrapper.unmount();
  });

  it('keeps tree reordering correct while some machines are hidden in tabs', async () => {
    const wrapper = await mountPage(true, true);
    await flushPromises();
    const store = useSelectionStore();
    const itemsOf = () =>
      store
        .entityGroups('machine')
        .find((group) => group.name === '输送机构')
        ?.configurations?.find((item) => item.name === '标准输送段配置')?.items;
    const before = itemsOf()!;
    expect(before[0]).toBe(PLACED);

    // 树里看到的是去掉 PLACED 后的列表：把第 1 个拖到第 2 个的位置
    wrapper.getComponent(EntityTree).vm.$emit('reorderItems', {
      category: '输送机构',
      configuration: '标准输送段配置',
      oldIndex: 0,
      newIndex: 1,
    });
    await flushPromises();

    expect(itemsOf()).toEqual([
      PLACED,
      before[2],
      before[1],
      ...before.slice(3),
    ]);
    wrapper.unmount();
  });

  it('offers no dragging or move menus to read-only users', async () => {
    const wrapper = await mountPage(true, false);
    await flushPromises();

    expect(wrapper.get('.machine-sub-tab').attributes('draggable')).toBe('false');
    expect(
      wrapper.find(`button[aria-label="${PLACED} 的更多操作"]`).exists(),
    ).toBe(false);
    expect(wrapper.getComponent(EntityTree).props('externalDrag')).toBe(false);
    wrapper.unmount();
  });
});
