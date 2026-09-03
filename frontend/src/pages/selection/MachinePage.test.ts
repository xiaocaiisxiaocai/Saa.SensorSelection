import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { ASearchField, ASelect, ATokenField } from '@/ui';
import { toast, useToastState } from '@/ui/toast';
import EntitySource from './EntitySource.vue';
import MachineGlobalSearch from './machine/MachineGlobalSearch.vue';
import MachineSectionPanel from './machine/MachineSectionPanel.vue';
import MachinePage from './MachinePage.vue';

const selectionPageCss = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'shared',
    'selection-page.css',
  ),
  'utf8',
);
const machinePageSource = readFileSync(
  fileURLToPath(import.meta.url).replace(/\.test\.ts$/, '.vue'),
  'utf8',
);
const machineSourceListSource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    'machine',
    'MachineSourceList.vue',
  ),
  'utf8',
);
const machineGlobalSearchSource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    'machine',
    'MachineGlobalSearch.vue',
  ),
  'utf8',
);
const machineSectionPanelSource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    'machine',
    'MachineSectionPanel.vue',
  ),
  'utf8',
);
const entitySource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'EntitySource.vue'),
  'utf8',
);
const sharedSourceListSource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'ui',
    'ASourceList.vue',
  ),
  'utf8',
);
const globalCss = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'styles',
    'global.css',
  ),
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
  expect(
    selectionStore.saveExtraMachineSection('01 单段输送段（搭配）', {
      kind: 'structure',
      name: '输送机构',
      sort: 1,
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

describe('MachinePage', () => {
  afterEach(() => {
    toast.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('separates mechanism and project machines under every process', async () => {
    const wrapper = await mountPage(true, true);
    expect(wrapper.get('h1.visually-hidden').text()).toBe('机型结构');
    const catalogTabs = wrapper.get('.machine-catalog-tabs');
    const tabLabels = catalogTabs
      .findAll('[role="tab"]')
      .map((tab) => tab.text());

    expect(tabLabels).toEqual(['结构', '专案机型']);
    expect(wrapper.text()).toContain('标准输送段配置');
    expect(wrapper.text()).not.toContain('CSL(U)R-802（插框机）');

    await catalogTabs
      .findAll('[role="tab"]')
      .find((tab) => tab.text() === '专案机型')
      ?.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('CSL(U)R-802（插框机）');
    expect(wrapper.text()).not.toContain('标准输送段配置');
    expect(wrapper.find('[aria-label="新建配置"]').exists()).toBe(false);
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
      wrapper.get('.machine-catalog-tabs [aria-selected="true"]').text(),
    ).toBe('专案机型');
    expect(wrapper.text()).toContain('CSL(U)R-802（插框机）');
    expect(wrapper.vm.$route.query.catalog).toBe('project');
    wrapper.unmount();
  });

  it('shows a user-defined process selector while keeping the machine tree shared', async () => {
    const wrapper = await mountPage(true, true);
    const selectionStore = useSelectionStore();
    const second = selectionStore.saveMachineProcess({
      name: '制程2',
      sort: 2,
    });
    if (!second.ok) throw new Error(second.reason);
    expect(
      selectionStore.saveExtraMachineSection(
        '01 单段输送段（搭配）',
        { kind: 'notes', name: '制程2注意事项', sort: 1 },
        undefined,
        second.item.id,
      ).ok,
    ).toBe(true);
    await flushPromises();

    const processSelect = wrapper
      .findAllComponents(ASelect)
      .find((component) => component.props('placeholder') === '选择制程');
    expect(processSelect).toBeDefined();
    expect(processSelect?.props('size')).toBe('small');
    expect(processSelect?.props('options')).toEqual([
      { label: '制程1', value: 1 },
      { label: '制程2', value: 2 },
    ]);
    expect(document.querySelector('#toolbar-context')?.textContent).toBe('');
    expect(
      wrapper.get('.machine-source-stack > .machine-process-context'),
    ).toBeDefined();
    expect(wrapper.find('.machine-process-context__label').exists()).toBe(
      false,
    );
    expect(processSelect?.props('ariaLabel')).toBe('当前浏览制程');
    expect(wrapper.text()).toContain('管理制程');
    expect(wrapper.get('.machine-process-context__manage').classes()).toContain(
      'a-button--small',
    );
    expect(wrapper.text()).toContain('标准输送段配置');

    await wrapper.get('.machine-process-context__manage').trigger('click');
    await flushPromises();
    expect(document.body.textContent).not.toContain('默认制程 · 兼容现有数据');

    processSelect?.vm.$emit('update:modelValue', second.item.id);
    await flushPromises();

    expect(wrapper.getComponent(MachineSectionPanel).props('processId')).toBe(
      second.item.id,
    );
    expect(wrapper.text()).toContain('制程2注意事项');
    expect(wrapper.text()).toContain('标准输送段配置');

    wrapper.unmount();
  });

  it('keeps the current browsing process while global structure search defaults to every process', async () => {
    const wrapper = await mountPage(true, true);

    const browsingProcess = wrapper
      .findAllComponents(ASelect)
      .find((component) => component.props('ariaLabel') === '当前浏览制程');
    expect(browsingProcess).toBeDefined();
    expect(wrapper.text()).toContain('目录浏览');
    expect(wrapper.text()).toContain('条件查找');
    expect(wrapper.get('.selection-split').attributes('style')).toContain(
      '--machine-source-width: 240px',
    );

    wrapper.getComponent(EntitySource).vm.$emit('resize', 300);
    await flushPromises();
    expect(wrapper.get('.selection-split').attributes('style')).toContain(
      '--machine-source-width: 300px',
    );

    await wrapper
      .findAll('button')
      .find((button) => button.text() === '条件查找')
      ?.trigger('click');
    await flushPromises();

    expect(wrapper.text()).not.toContain('全局查找不受当前浏览制程限制');
    expect(wrapper.text()).toContain('全部制程');
    expect(wrapper.text()).not.toContain('默认覆盖所有上层制程');
    expect(wrapper.get('.selection-split').attributes('style')).toContain(
      '--machine-source-width: 300px',
    );
    expect(wrapper.getComponent(ASelect).props('modelValue')).toBe(1);
    wrapper.unmount();
  });

  it('finds matching structures across processes and opens the selected process and row', async () => {
    const wrapper = await mountPage(true, true);
    const selectionStore = useSelectionStore();
    const panel = wrapper.getComponent(MachineSectionPanel);
    const machineName = panel.props('machineName') as string;
    const section = panel.props('section') as { id: number; kind: string };
    const sensor = selectionStore.sensors[0];
    const machineModel = selectionStore.dictionaryItems('machine-model')[0];
    const second = selectionStore.saveMachineProcess({
      name: '制程2',
      sort: 2,
    });
    if (!sensor || !machineModel || !second.ok) {
      throw new Error('global search fixture failed');
    }
    const secondSection = selectionStore.saveExtraMachineSection(
      machineName,
      { kind: 'structure', name: '输送机构', sort: 1 },
      undefined,
      second.item.id,
    );
    if (!secondSection.ok) {
      throw new Error('global search section fixture failed');
    }
    const firstRow = selectionStore.saveMachineSectionRow(
      section.id,
      machineName,
      {
        machineModelId: machineModel.id,
        role: '制程1入料确认',
        sensorIds: [sensor.id],
      },
      undefined,
      1,
    );
    const secondRow = selectionStore.saveMachineSectionRow(
      secondSection.item.id,
      machineName,
      {
        machineModelId: machineModel.id,
        role: '制程2出料确认',
        sensorIds: [sensor.id],
      },
      undefined,
      second.item.id,
    );
    if (!firstRow.ok || !secondRow.ok) {
      throw new Error('global search row fixture failed');
    }
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((button) => button.text() === '条件查找')
      ?.trigger('click');
    await flushPromises();

    const globalSearch = wrapper.getComponent(MachineGlobalSearch);
    expect(
      globalSearch
        .findAllComponents(ATokenField)
        .every((field) => field.props('maxVisibleTokens') === 3),
    ).toBe(true);
    const machineField = globalSearch
      .findAllComponents(ATokenField)
      .find((component) => component.props('placeholder') === '选择适用机型');
    machineField?.vm.$emit('update:modelValue', [machineModel.id]);
    await flushPromises();
    await globalSearch
      .findAll('button')
      .find((button) => button.text() === '查找')
      ?.trigger('click');
    await flushPromises();

    expect(globalSearch.text()).toContain('制程1（1个结构）');
    expect(globalSearch.text()).toContain('制程2（1个结构）');
    const secondResult = globalSearch.findAll(
      '.machine-global-search__result',
    )[1];
    expect(secondResult).toBeDefined();
    await secondResult?.trigger('click');
    await flushPromises();

    expect(wrapper.vm.$route.query.view).toBeUndefined();
    expect(wrapper.vm.$route.query.process).toBe(String(second.item.id));
    expect(wrapper.vm.$route.query.focusRow).toBe(String(secondRow.item.id));
    expect(wrapper.getComponent(MachineSectionPanel).props('processId')).toBe(
      second.item.id,
    );
    expect(wrapper.getComponent(MachineSectionPanel).props('focusRowId')).toBe(
      secondRow.item.id,
    );
    wrapper.unmount();
  });

  it('hides every report operation when not signed in', async () => {
    const wrapper = await mountPage();
    expect(wrapper.text()).not.toContain('生成并下载报告');
    expect(wrapper.text()).not.toContain('预览 / 打印 PDF');
    expect(wrapper.text()).not.toContain('全选机型');
    expect(wrapper.find('[aria-label^="选择"]').exists()).toBe(false);
    expect(wrapper.text()).toMatch(/输送机构|分类/);
    wrapper.unmount();
  });

  it('shows report operations to an authenticated read-only user', async () => {
    const wrapper = await mountPage(true);
    expect(wrapper.text()).toContain('生成并下载报告');
    expect(wrapper.text()).toContain('预览 / 打印 PDF');
    expect(wrapper.text()).toContain('全选机型');
    expect(wrapper.find('[aria-label^="选择"]').exists()).toBe(true);
    expect(wrapper.text()).toMatch(/输送机构|分类/);
    wrapper.unmount();
  });

  it('checks only the selected tree node when machine names are duplicated', async () => {
    const wrapper = await mountPage(true);
    const duplicateCheckboxes = wrapper.findAll(
      'input[aria-label="选择 01 中心拍板"]',
    );

    expect(duplicateCheckboxes.length).toBeGreaterThan(1);
    await duplicateCheckboxes[0]?.setValue(true);
    await flushPromises();

    expect(
      wrapper
        .findAll('input[aria-label="选择 01 中心拍板"]')
        .map((checkbox) => (checkbox.element as HTMLInputElement).checked),
    ).toEqual(duplicateCheckboxes.map((_, index) => index === 0));
    expect(wrapper.text()).toMatch(/已选\s+1\s+\//);
    wrapper.unmount();
  });

  it('shows configuration management and machine sorting to writers', async () => {
    const wrapper = await mountPage(true, true);

    expect(wrapper.find('[aria-label="新建配置"]').exists()).toBe(true);
    await wrapper.get('[aria-label^="编辑机型"]').trigger('click');
    await flushPromises();

    expect(document.body.textContent).toContain('配置（可选）');
    expect(document.body.textContent).toContain('排序');

    wrapper.unmount();
  });

  it('lets writers choose between structure and machine-notes tab types', async () => {
    const wrapper = await mountPage(true, true);

    await wrapper.get('[aria-label="新增 Tab"]').trigger('click');
    await flushPromises();

    const typeSelect = wrapper
      .findAllComponents(ASelect)
      .find((component) =>
        (component.props('options') as Array<{ value: string }>).some(
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
    const checkbox = wrapper.get(
      'input[aria-label="选择 01 单段输送段（搭配）"]',
    );
    await checkbox.setValue(true);
    await flushPromises();

    const openSpy = vi.spyOn(window, 'open');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '预览 / 打印 PDF')
      ?.trigger('click');

    expect(openSpy).not.toHaveBeenCalled();
    expect(useToastState().items.value.at(-1)).toMatchObject({
      tone: 'warning',
      message: '所选机型暂无可生成的内容',
    });
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
        processId: 1,
        section: structure.item,
      },
      global: { plugins: [pinia] },
    });
    const addStructure = structurePanel
      .findAll('button')
      .find((button) => button.text() === '新增');
    await addStructure?.trigger('click');
    await flushPromises();
    const processSelect = structurePanel
      .findAllComponents(ASelect)
      .find(
        (component) =>
          component.props('placeholder') === '选择工艺制程（可选）',
      );
    expect(processSelect).toBeDefined();
    expect(processSelect?.props('clearable')).toBe(true);
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
        processId: 1,
        section: notes.item,
      },
      global: { plugins: [pinia] },
    });
    const addNotes = notesPanel
      .findAll('button')
      .find((button) => button.text() === '新增');
    await addNotes?.trigger('click');
    await flushPromises();
    expect(
      notesPanel
        .findAllComponents(ASelect)
        .some(
          (component) =>
            component.props('placeholder') === '选择工艺制程（可选）',
        ),
    ).toBe(false);
    expect(
      notesPanel
        .findAllComponents(ASelect)
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
        processId: 1,
        section: structure.item,
      },
      global: { plugins: [pinia] },
    });
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '新增')
      ?.trigger('click');
    await flushPromises();

    const machineSelect = wrapper
      .findAllComponents(ASelect)
      .find(
        (component) => component.props('placeholder') === '选择机型（可选）',
      );
    const boardSelect = wrapper
      .findAllComponents(ASelect)
      .find(
        (component) =>
          component.props('placeholder') === '选择板件特性（可选）',
      );
    expect(machineSelect?.props('filterable')).toBe(true);
    expect(machineSelect?.props('clearable')).toBe(true);
    expect(machineSelect?.props('options')).toEqual(
      selectionStore.dictionaryItems('machine-model').map((item) => ({
        label: item.name,
        value: item.id,
      })),
    );
    expect(boardSelect?.props('filterable')).toBe(true);
    expect(boardSelect?.props('clearable')).toBe(true);
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

    const search = panel.getComponent(ASearchField);
    expect(search.props('placeholder')).toBe('搜索规格、型号或功能');

    search.vm.$emit('update:modelValue', secondProcessStep.name);
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
      .findAllComponents(ASelect)
      .find((component) => component.props('placeholder') === '工艺制程');
    expect(processFilter).toBeDefined();
    expect(processFilter?.props('filterable')).toBe(true);
    expect(processFilter?.props('clearable')).toBe(true);
    expect(processFilter?.props('options')).toEqual(
      selectionStore.processSteps.map((item) => ({
        label: `${item.layer} · ${item.name}`,
        value: item.id,
      })),
    );

    processFilter?.vm.$emit('update:modelValue', secondProcessStep.id);
    await flushPromises();

    expect(panel.text()).toContain('制程下拉-匹配');
    expect(panel.text()).not.toContain('制程下拉-不匹配');

    await panel.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(processFilter?.props('modelValue')).toBeNull();
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

    const selects = panel.findAllComponents(ASelect);
    const machineModelFilter = selects.find(
      (component) => component.props('placeholder') === '机型',
    );
    const boardCharacteristicFilter = selects.find(
      (component) => component.props('placeholder') === '板件特性',
    );

    expect(machineModelFilter).toBeDefined();
    expect(machineModelFilter?.props('filterable')).toBe(true);
    expect(machineModelFilter?.props('clearable')).toBe(true);
    expect(machineModelFilter?.props('options')).toEqual(
      selectionStore.dictionaryItems('machine-model').map((item) => ({
        label: item.name,
        value: item.id,
      })),
    );
    expect(boardCharacteristicFilter).toBeDefined();
    expect(boardCharacteristicFilter?.props('filterable')).toBe(true);
    expect(boardCharacteristicFilter?.props('clearable')).toBe(true);
    expect(boardCharacteristicFilter?.props('options')).toEqual(
      selectionStore.dictionaryItems('board-characteristic').map((item) => ({
        label: item.name,
        value: item.id,
      })),
    );

    machineModelFilter?.vm.$emit('update:modelValue', secondMachineModel.id);
    await flushPromises();
    expect(panel.text()).toContain('字典筛选-第二项');
    expect(panel.text()).not.toContain('字典筛选-第一项');

    await panel.get('button[aria-label="重置筛选"]').trigger('click');
    boardCharacteristicFilter?.vm.$emit(
      'update:modelValue',
      firstBoardCharacteristic.id,
    );
    await flushPromises();
    expect(panel.text()).toContain('字典筛选-第一项');
    expect(panel.text()).not.toContain('字典筛选-第二项');

    await panel.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(machineModelFilter?.props('modelValue')).toBeNull();
    expect(boardCharacteristicFilter?.props('modelValue')).toBeNull();
    expect(panel.text()).toContain('字典筛选-第一项');
    expect(panel.text()).toContain('字典筛选-第二项');
    wrapper.unmount();
  });

  it('keeps structure labels compact and gives specifications more room', async () => {
    const wrapper = await mountPage(true, true);
    const headers = wrapper.findAll('.a-table thead th');

    expect(headers[0]?.attributes('style')).toContain('width: 90px');
    expect(headers[1]?.attributes('style')).toContain('width: 100px');
    expect(headers[2]?.attributes('style')).toContain('width: 110px');
    expect(headers[3]?.attributes('style')).toContain('width: 120px');
    expect(headers[4]?.attributes('style')).toContain('width: 100px');
    expect(headers[5]?.attributes('style')).toContain('width: 220px');
    expect(headers[6]?.attributes('style')).toContain('width: 120px');
    expect(headers[7]?.attributes('style')).toContain('width: 96px');
    expect(headers[8]?.attributes('style')).toContain('width: 72px');

    wrapper.unmount();
  });

  it('uses the compact caption scale for source controls and trees', () => {
    expect(machinePageSource).toMatch(
      /\.machine-source-stack\s*\{[^}]*gap:\s*var\(--space-2\);/s,
    );
    expect(machinePageSource).toMatch(
      /\.machine-catalog-tabs :deep\(\.a-tab-bar__tab\)\s*\{[^}]*height:\s*var\(--control-height-md\);[^}]*font:\s*var\(--text-caption\);/s,
    );
    expect(machineSourceListSource).toMatch(
      /\.machine-tree-row\s*\{[^}]*font:\s*var\(--text-caption\);/s,
    );
    expect(machineSourceListSource).toMatch(
      /\.machine-source__search\s*\{[^}]*height:\s*var\(--control-height-md\);[^}]*font:\s*var\(--text-caption\);/s,
    );
    expect(machineSourceListSource).toMatch(
      /\.machine-source__action\s*\{[^}]*height:\s*var\(--control-height-sm\);[^}]*font:\s*var\(--text-caption\);/s,
    );
    expect(sharedSourceListSource).toMatch(
      /\.a-source-list__toggle,\s*\.a-source-list__item\s*\{[^}]*font:\s*var\(--text-caption\);/s,
    );
    expect(sharedSourceListSource).toMatch(
      /\.a-source-list__count\s*\{[^}]*font:\s*var\(--text-caption\);/s,
    );
  });

  it('does not reserve invisible action space that makes tree labels wrap early', () => {
    expect(machineSourceListSource).toMatch(
      /\.machine-tree-row\s*\{[^}]*position:\s*relative;/s,
    );
    expect(machineSourceListSource).toMatch(
      /\.machine-tree-row__tools\s*\{[^}]*position:\s*absolute;[^}]*right:\s*var\(--space-1\);/s,
    );
    expect(machineSourceListSource).not.toMatch(
      /\.machine-tree-row__tools\s*\{[^}]*margin-left:\s*auto;/s,
    );
    expect(machineSourceListSource).toMatch(
      /\.machine-source__tree\s*\{[^}]*overflow:\s*hidden auto;/s,
    );
    expect(machineSourceListSource).toMatch(
      /\.machine-tree-row__toggle span,\s*\.machine-tree-row__name\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    );
    expect(entitySource).toMatch(
      /<MachineSourceList[\s\S]*?:storage-key="`selection:source-list-width:\$\{kind\}:v5`"/,
    );
  });

  it('left-aligns custom badge and action content inside table cells', async () => {
    window.localStorage.clear();
    const wrapper = await mountPage(true, true);
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
        role: '对齐测试',
        sensorIds: [sensor.id],
      }).ok,
    ).toBe(true);
    await flushPromises();

    expect(wrapper.find('.badge-wrap').exists()).toBe(true);
    expect(wrapper.find('.table-actions').exists()).toBe(true);
    expect(selectionPageCss).toMatch(
      /\.badge-wrap\s*\{[^}]*justify-content:\s*flex-start;/s,
    );
    expect(selectionPageCss).toMatch(
      /\.table-actions\s*\{[^}]*justify-content:\s*flex-start;/s,
    );

    wrapper.unmount();
  });

  it('widens uploaded schematic previews without changing the upload control', () => {
    expect(selectionPageCss).toMatch(
      /\.machine-images:not\(\.machine-images--collapsed\)\s*\{[^}]*padding-left:\s*var\(--space-3\);[^}]*border-left:\s*1px solid var\(--separator\);/s,
    );
    expect(selectionPageCss).toMatch(
      /\.machine-images \.image-card\s*\{[^}]*justify-self:\s*end;[^}]*width:\s*calc\(100% \+ var\(--space-4\)\);/s,
    );
    expect(selectionPageCss).toMatch(
      /\.machine-images \.a-file-drop\s*\{[^}]*min-height:/s,
    );
    expect(selectionPageCss).not.toMatch(
      /\.machine-images \.a-file-drop\s*\{[^}]*width:\s*calc\(100% \+[^}]*\}/s,
    );
    expect(machineSectionPanelSource).toContain('class="image-card__preview"');
    expect(machineSectionPanelSource).toContain('class="image-card__footer"');
    expect(machineSectionPanelSource).toContain('class="image-card__name"');
    expect(machineSectionPanelSource).toContain('class="image-card__actions"');
    expect(machineSectionPanelSource).toContain(':icon="Maximize2"');
    expect(selectionPageCss).toMatch(
      /\.image-card__footer\s*\{[^}]*border-top:\s*1px solid var\(--separator\);/s,
    );
    expect(machineSectionPanelSource).not.toMatch(
      /<button[^>]*class="image-card"/,
    );
  });

  it('uses aligned separators for sensor entries inside a compound row', () => {
    expect(machineSectionPanelSource).toContain(
      "'machine-sensor-entry--continued': !row.groupEnd",
    );
    expect(machineSectionPanelSource).toContain(
      'class="machine-spec-cell machine-sensor-entry"',
    );
    expect(machineSectionPanelSource).toMatch(
      /\.machine-sensor-entry--continued\s*\{[^}]*border-bottom:\s*1px solid var\(--separator\);/s,
    );
  });

  it('uses a slim overlay scrollbar throughout the app', () => {
    expect(globalCss).toMatch(
      /\*::-webkit-scrollbar\s*\{[^}]*width:\s*6px;[^}]*height:\s*6px;/s,
    );
    expect(globalCss).toMatch(
      /\*::-webkit-scrollbar-thumb\s*\{[^}]*background-color:\s*transparent;/s,
    );
    expect(globalCss).toMatch(
      /\*:hover::-webkit-scrollbar-thumb\s*\{[^}]*background-color:\s*var\(--scrollbar-thumb\);/s,
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

  it('keeps medium widths side by side and stacks only on narrow screens', () => {
    expect(selectionPageCss).toMatch(
      /@media \(width <= 60rem\)[\s\S]*\.selection-split\s*\{[^}]*grid-template-rows:\s*minmax\(12rem,\s*42vh\)\s+minmax\(0,\s*1fr\);/s,
    );
    expect(selectionPageCss).toMatch(
      /@media \(width <= 60rem\)[\s\S]*\.entity-source\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s,
    );
    expect(machinePageSource).toMatch(
      /@media \(width <= 60rem\)[\s\S]*\.machine-source-stack\s*\{[^}]*width:\s*100%;/s,
    );
    expect(machinePageSource).toMatch(
      /@media \(width <= 60rem\)[\s\S]*\.machine-report\s*\{[^}]*grid-template-columns:\s*auto auto minmax\(9rem,\s*1fr\) minmax\(8rem,\s*1fr\);/s,
    );
    expect(machinePageSource).toMatch(
      /@media \(width <= 40rem\)[\s\S]*\.machine-report\s*\{[^}]*grid-template-columns:\s*1fr 1fr;/s,
    );
    expect(machinePageSource).toMatch(
      /@media \(48rem < width <= 60rem\)[\s\S]*\.selection-split--machine\s*\{[^}]*grid-template-columns:/s,
    );
    expect(machineGlobalSearchSource).toMatch(
      /@media \(48rem < width <= 60rem\)[\s\S]*\.machine-global-search\s*\{[^}]*grid-template-columns:/s,
    );
    expect(machineGlobalSearchSource).toMatch(
      /@media \(width <= 48rem\)[\s\S]*\.machine-global-search\s*\{[^}]*grid-template-columns:\s*1fr;/s,
    );
    expect(selectionPageCss).toMatch(
      /@media \(width <= 48rem\)[\s\S]*\.selection-split--machine > \.selection-panel\s*\{[^}]*overflow:\s*hidden auto;/s,
    );
    expect(selectionPageCss).toMatch(
      /@media \(width <= 48rem\)[\s\S]*\.selection-split--machine > \.selection-panel > \.machine-body\s*\{[^}]*min-height:\s*36rem;/s,
    );
  });

  it('combines the active section and report actions into one desktop context bar', async () => {
    const wrapper = await mountPage(true, true);
    const header = wrapper.get('.machine-panel-header');

    expect(header.find('.machine-section-tabs').exists()).toBe(true);
    expect(header.find('.machine-report').exists()).toBe(true);
    expect(machinePageSource).toMatch(
      /\.machine-panel-header\s*\{[^}]*display:\s*flex;[^}]*border-bottom:\s*1px solid var\(--separator\);/s,
    );
    expect(machinePageSource).toMatch(
      /@media \(width <= 70rem\)[\s\S]*\.machine-panel-header\s*\{[^}]*align-items:\s*stretch;[^}]*flex-direction:\s*column;/s,
    );

    wrapper.unmount();
  });

  it('keeps the structure filters and actions in a deterministic compact grid', () => {
    expect(machineSectionPanelSource).toMatch(
      /\.machine-structure-toolbar\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(7rem,\s*1\.2fr\)\s+repeat\(3,\s*minmax\(6\.25rem,\s*1fr\)\)\s+minmax\(7\.5rem,\s*2\.6fr\)\s+auto\s+auto;/s,
    );
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

    expect(panel.find('.a-file-drop').exists()).toBe(false);
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

    expect(panel.find('.a-file-drop').exists()).toBe(true);
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

    const typeFilter = panel.getComponent(ATokenField);
    expect(typeFilter.props('placeholder')).toBe('传感器类型');
    typeFilter.vm.$emit(
      'update:modelValue',
      sensors.slice(0, 2).map((sensor) => sensor.sensorType),
    );
    await flushPromises();

    expect(wrapper.text()).toContain('机型类型多选-1');
    expect(wrapper.text()).toContain('机型类型多选-2');
    expect(wrapper.text()).not.toContain('机型类型多选-3');

    await panel.get('button[aria-label="重置筛选"]').trigger('click');
    await flushPromises();
    expect(typeFilter.props('modelValue')).toEqual([]);
    expect(wrapper.text()).toContain('机型类型多选-3');
    wrapper.unmount();
  });
});
