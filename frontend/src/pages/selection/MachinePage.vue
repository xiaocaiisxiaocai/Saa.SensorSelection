<script setup lang="ts">
import { message } from 'ant-design-vue';
import { Pencil, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { api, ApiError } from '@/api';
import {
  entityTreeItemKey,
  filterMachineGroups,
  findEntityTreeItem,
  listEntityGroupItems,
  listEntityTreeItems,
  machineCatalogKind,
  type MachineCatalogKind,
  openMachineSchematicReport,
  type MachineProcessItem,
  type MachineReportSection,
  type MachineSectionKind,
} from '@/domain';
import EntitySource from '@/pages/selection/EntitySource.vue';
import MachineGlobalSearch from '@/pages/selection/machine/MachineGlobalSearch.vue';
import MachineSectionPanel from '@/pages/selection/machine/MachineSectionPanel.vue';
import type {
  MachineStructureSearchDocument,
  MachineStructureSearchResult,
} from '@/pages/selection/machine/machine-structure-search';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import { useAccess, useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import '../shared/selection-page.css';

const route = useRoute();
const router = useRouter();
const store = useSelectionStore();
const auth = useAuthStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const dialogOpen = ref(false);
const processDialogOpen = ref(false);
const editId = ref<number>();
const processEditId = ref<number>();
const tabValidationAttempted = ref(false);
const processValidationAttempted = ref(false);
const form = reactive({
  kind: 'structure' as MachineSectionKind,
  name: '',
  sort: 1,
});
const processForm = reactive({
  name: '',
  sort: 1,
});
const dirtyGuard = useDirtyGuard(form);
const processDirtyGuard = useDirtyGuard(processForm);
const activeSection = ref('');
const checkedMachineKeys = ref<string[]>([]);
const reportGenerating = ref(false);

const groups = computed(() => store.entityGroups('machine'));
const processes = computed(() => store.machineProcesses);
const activeProcessId = computed(() => {
  const requested = Number(route.query.process);
  return processes.value.some((item) => item.id === requested)
    ? requested
    : (processes.value[0]?.id ?? 1);
});
const processOptions = computed(() =>
  processes.value.map((item) => ({ label: item.name, value: item.id })),
);
const processSelection = computed({
  get: () => activeProcessId.value,
  set: (value: string | number | null) => selectProcess(Number(value)),
});
const activeMachineType = computed<MachineCatalogKind>(() => {
  if (route.query.catalog === 'project') return 'project';
  if (route.query.catalog === 'mechanism') return 'mechanism';
  const requestedCategory = String(route.query.category || '');
  const requestedItem = String(route.query.item || '');
  const legacyGroup = groups.value.find(
    (group) =>
      group.name === requestedCategory ||
      listEntityGroupItems(group).includes(requestedItem),
  );
  return legacyGroup ? machineCatalogKind(legacyGroup) : 'mechanism';
});
const machineCatalogTabs = [
  { label: '结构', value: 'mechanism' },
  { label: '专案机型', value: 'project' },
];
const machineViewTabs = [
  { label: '目录浏览', value: 'browse' },
  { label: '条件查找', value: 'find' },
];
const activeMachineView = computed(() =>
  activeMachineType.value === 'mechanism' && route.query.view === 'find'
    ? 'find'
    : 'browse',
);
const catalogGroups = computed(() =>
  filterMachineGroups(groups.value, activeMachineType.value),
);
const availableMachineItems = computed(() =>
  listEntityTreeItems(catalogGroups.value),
);
const availableMachineKeys = computed(() =>
  availableMachineItems.value.map(entityTreeItemKey),
);
const selectedMachineItems = computed(() =>
  availableMachineItems.value.filter((item) =>
    checkedMachineKeys.value.includes(entityTreeItemKey(item)),
  ),
);
const selectedMachineNames = computed(() =>
  selectedMachineItems.value.map((item) => item.name),
);
const selection = computed(() => {
  const requested = String(route.query.item || '');
  const requestedCategory = String(route.query.category || '');
  const requestedConfiguration = String(route.query.configuration || '');
  const found = listEntityTreeItems(catalogGroups.value).find(
    (item) =>
      item.name === requested &&
      (!requestedCategory || item.category === requestedCategory) &&
      (!requestedConfiguration ||
        (item.configuration ?? '') === requestedConfiguration),
  );
  if (found) {
    return {
      category: found.category,
      configuration: found.configuration ?? '',
      item: found.name,
    };
  }
  const first = findEntityTreeItem(
    catalogGroups.value,
    catalogGroups.value.flatMap((group) => listEntityGroupItems(group))[0] ??
      '',
  );
  return {
    category: first?.category || catalogGroups.value[0]?.name || '',
    configuration: first?.configuration || '',
    item: first?.name || '',
  };
});
const selectedMachineKey = computed(() =>
  entityTreeItemKey({
    category: selection.value.category,
    configuration: selection.value.configuration || null,
    name: selection.value.item,
  }),
);
const machineModelItems = computed(() =>
  store.dictionaryItems('machine-model'),
);
const boardCharacteristicItems = computed(() =>
  store.dictionaryItems('board-characteristic'),
);
const machineModelOptions = computed(() =>
  machineModelItems.value.map((item) => ({ label: item.name, value: item.id })),
);
const processStepOptions = computed(() =>
  store.processSteps.map((item) => ({
    label: `${item.layer} · ${item.name}`,
    value: item.id,
  })),
);
const boardCharacteristicOptions = computed(() =>
  boardCharacteristicItems.value.map((item) => ({
    label: item.name,
    value: item.id,
  })),
);
const globalSearchDocuments = computed<MachineStructureSearchDocument[]>(() =>
  // 遍历「制程 × 机型 × 分区」时，每次取行都会重新归一化 Sensor/工序/字典；
  // batchRead 让这些归一化结果在本次构建里只算一次。
  store.batchRead(buildGlobalSearchDocuments),
);

function buildGlobalSearchDocuments(): MachineStructureSearchDocument[] {
  const documents: MachineStructureSearchDocument[] = [];
  const machineModelById = new Map(
    machineModelItems.value.map((item) => [item.id, item]),
  );
  const processStepById = new Map(
    store.processSteps.map((item) => [item.id, item]),
  );
  const boardCharacteristicById = new Map(
    boardCharacteristicItems.value.map((item) => [item.id, item]),
  );
  const sensorById = new Map(
    store.sensors.map((sensor) => [sensor.id, sensor]),
  );
  const treeItems = listEntityTreeItems(
    filterMachineGroups(groups.value, 'mechanism'),
  );
  for (const process of processes.value) {
    for (const treeItem of treeItems) {
      const sections = store
        .resolvedMachineSections(treeItem.name, process.id)
        .filter((section) => section.kind === 'structure');
      for (const section of sections) {
        for (const row of store.machineSectionRows(
          section.id,
          treeItem.name,
          process.id,
        )) {
          const machineModel =
            row.machineModelId == null
              ? undefined
              : machineModelById.get(row.machineModelId);
          const processStep =
            row.processStepId == null
              ? undefined
              : processStepById.get(row.processStepId);
          const boardCharacteristic =
            row.boardCharacteristicId == null
              ? undefined
              : boardCharacteristicById.get(row.boardCharacteristicId);
          const sensors = row.sensorIds
            .map((id) => sensorById.get(id))
            .filter((sensor) => Boolean(sensor));
          documents.push({
            boardCharacteristicId: row.boardCharacteristicId,
            boardCharacteristicName: boardCharacteristic?.name ?? '',
            category: treeItem.category,
            configuration: treeItem.configuration ?? '',
            machineModelId: row.machineModelId,
            machineModelName: machineModel?.name ?? '',
            machineName: treeItem.name,
            processId: process.id,
            processName: process.name,
            processStepId: row.processStepId,
            processStepName: processStep
              ? `${processStep.layer} · ${processStep.name}`
              : '',
            rowId: row.id,
            searchableText: [
              row.role,
              row.purpose,
              row.note,
              ...sensors.flatMap((sensor) => [
                sensor?.sensorType,
                sensor?.brand,
                sensor?.model,
                sensor?.spec,
              ]),
            ]
              .filter(Boolean)
              .join(' '),
            sectionId: section.id,
            sectionName: section.name,
          });
        }
      }
    }
  }
  return documents;
}
const displaySections = computed(() => {
  if (!selection.value.item) return [];
  return store
    .resolvedMachineSections(selection.value.item, activeProcessId.value)
    .map((section) => ({ ...section, displayName: section.name }));
});
const tabs = computed(() =>
  displaySections.value.map((section) => ({
    label: section.displayName,
    value: String(section.id),
  })),
);
const activeSectionItem = computed(() =>
  displaySections.value.find((item) => String(item.id) === activeSection.value),
);
const reportSections = computed<MachineReportSection[]>(() => {
  const machineNames = selectedMachineNames.value;
  const resolvedByMachine = new Map(
    machineNames.map((machineName) => [
      machineName,
      store.resolvedMachineSections(machineName, activeProcessId.value),
    ]),
  );
  const sectionMap = new Map<string, MachineReportSection>();
  for (const sectionsForMachine of resolvedByMachine.values()) {
    for (const section of sectionsForMachine) {
      const key = `${section.kind}:${section.name.toLocaleLowerCase('zh-CN')}`;
      if (!sectionMap.has(key)) {
        sectionMap.set(key, {
          ...section,
          displayName: section.name,
          blocks: [],
        });
      }
    }
  }
  return [...sectionMap.values()]
    .sort((left, right) => left.sort - right.sort)
    .map((section) => ({
      ...section,
      blocks: machineNames.flatMap((machineName) => {
        const machineSection = resolvedByMachine
          .get(machineName)
          ?.find(
            (candidate) =>
              candidate.kind === section.kind &&
              candidate.name.toLocaleLowerCase('zh-CN') ===
                section.name.toLocaleLowerCase('zh-CN'),
          );
        if (!machineSection) return [];
        const rows = store.machineSectionRows(
          machineSection.id,
          machineName,
          activeProcessId.value,
        );
        const reportRows = rows.map((row) => {
          const processStep = store.processSteps.find(
            (item) => item.id === row.processStepId,
          );
          return {
            ...row,
            processStepName: processStep
              ? `${processStep.layer} · ${processStep.name}`
              : '',
          };
        });
        return [
          {
            machineName,
            rows: reportRows,
            images:
              section.kind === 'structure'
                ? store.machineSectionImages(
                    machineSection.id,
                    machineName,
                    activeProcessId.value,
                  )
                : [],
            sensors:
              section.kind === 'structure'
                ? store.sensors.filter((sensor) =>
                    rows.some((row) => row.sensorIds.includes(sensor.id)),
                  )
                : [],
          },
        ];
      }),
    }));
});
const hasReportContent = computed(() =>
  reportSections.value.some((section) =>
    section.blocks.some(
      (block) => block.rows.length > 0 || (block.images?.length ?? 0) > 0,
    ),
  ),
);

// 当前选中机型（分类 + 机型 + 可选机型配置）对应的查询参数。
function currentSelectionQuery(
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    category: selection.value.category,
    item: selection.value.item,
    ...(selection.value.configuration
      ? { configuration: selection.value.configuration }
      : {}),
    ...extra,
  };
}

function addMachineContextQuery(
  query: Record<string, string>,
  processId = activeProcessId.value,
  catalog = activeMachineType.value,
  view = activeMachineView.value,
) {
  if (processId !== 1) query.process = String(processId);
  if (catalog === 'project') query.catalog = catalog;
  if (catalog === 'mechanism' && view === 'find') query.view = 'find';
  return query;
}

watch(
  () => availableMachineKeys.value.join('\u0001'),
  () => {
    const available = new Set(availableMachineKeys.value);
    checkedMachineKeys.value = checkedMachineKeys.value.filter((key) =>
      available.has(key),
    );
  },
  { immediate: true },
);

watch(
  () => auth.isAuthenticated,
  (isAuthenticated) => {
    if (!isAuthenticated) checkedMachineKeys.value = [];
  },
);

watch(
  () =>
    [
      route.query.item,
      route.query.category,
      route.query.configuration,
      route.query.process,
      route.query.catalog,
      groups.value,
      processes.value,
    ] as const,
  () => {
    const { category, configuration, item } = selection.value;
    if (!item) return;
    const requestedProcess = String(route.query.process || '');
    const canonicalProcess =
      activeProcessId.value === 1 ? '' : String(activeProcessId.value);
    const canonicalCatalog =
      activeMachineType.value === 'project' ? 'project' : '';
    if (
      route.query.item === item &&
      route.query.category === category &&
      String(route.query.configuration || '') === configuration &&
      requestedProcess === canonicalProcess &&
      String(route.query.catalog || '') === canonicalCatalog
    ) {
      return;
    }
    const query: Record<string, string> = addMachineContextQuery({
      category,
      item,
    });
    if (configuration) query.configuration = configuration;
    const section = String(route.query.section || '');
    if (section) query.section = section;
    void router.replace({ path: route.path, query });
  },
  { immediate: true },
);

watch(
  () =>
    [
      selection.value.item,
      selection.value.category,
      selection.value.configuration,
      activeProcessId.value,
      route.query.section,
      displaySections.value.map((item) => item.id).join(','),
    ] as const,
  () => {
    if (!selection.value.item || displaySections.value.length === 0) {
      activeSection.value = '';
      return;
    }
    const requested = String(route.query.section || '');
    const match = displaySections.value.find(
      (item) => String(item.id) === requested,
    );
    const next = String((match || displaySections.value[0])?.id ?? '');
    activeSection.value = next;
    if (
      route.query.item === selection.value.item &&
      route.query.category === selection.value.category &&
      String(route.query.configuration || '') ===
        selection.value.configuration &&
      String(route.query.process || '') ===
        (activeProcessId.value === 1 ? '' : String(activeProcessId.value)) &&
      String(route.query.catalog || '') ===
        (activeMachineType.value === 'project' ? 'project' : '') &&
      route.query.section === next
    ) {
      return;
    }
    void router.replace({
      path: route.path,
      query: addMachineContextQuery(currentSelectionQuery({ section: next })),
    });
  },
  { immediate: true },
);

function selectEntity(payload: {
  category: string;
  configuration?: string | null;
  item: string;
}) {
  const query: Record<string, string> = addMachineContextQuery({
    category: payload.category,
    item: payload.item,
  });
  if (payload.configuration) query.configuration = payload.configuration;
  void router.replace({ path: route.path, query });
}

function onTabEdit(target: unknown, action: 'add' | 'remove') {
  if (action === 'add') openAddTab();
  else void closeTab(String(target));
}

function onTabChange(sectionId: string) {
  activeSection.value = sectionId;
  void router.replace({
    path: route.path,
    query: addMachineContextQuery(
      currentSelectionQuery({ section: sectionId }),
    ),
  });
}

function selectProcess(processId: number) {
  if (
    !Number.isSafeInteger(processId) ||
    !processes.value.some((item) => item.id === processId) ||
    processId === activeProcessId.value
  ) {
    return;
  }
  void router.replace({
    path: route.path,
    query: addMachineContextQuery(currentSelectionQuery(), processId),
  });
}

function selectMachineCatalog(value: string) {
  if (
    (value !== 'mechanism' && value !== 'project') ||
    value === activeMachineType.value
  ) {
    return;
  }
  void router.replace({
    path: route.path,
    query: addMachineContextQuery({}, activeProcessId.value, value, 'browse'),
  });
}

function selectMachineView(value: string) {
  if (
    activeMachineType.value !== 'mechanism' ||
    (value !== 'browse' && value !== 'find') ||
    value === activeMachineView.value
  ) {
    return;
  }
  const query: Record<string, string> = addMachineContextQuery(
    currentSelectionQuery(
      activeSection.value ? { section: activeSection.value } : {},
    ),
    activeProcessId.value,
    activeMachineType.value,
    value,
  );
  void router.replace({ path: route.path, query });
}

function openGlobalSearchResult(result: MachineStructureSearchResult) {
  const query: Record<string, string> = addMachineContextQuery(
    {
      category: result.category,
      item: result.machineName,
      section: String(result.sectionId),
      focusRow: String(result.rowIds[0] ?? ''),
    },
    result.processId,
    'mechanism',
    'browse',
  );
  if (!query.focusRow) delete query.focusRow;
  if (result.configuration) query.configuration = result.configuration;
  void router.replace({ path: route.path, query });
}

function resetProcessForm() {
  processValidationAttempted.value = false;
  processEditId.value = undefined;
  Object.assign(processForm, {
    name: '',
    sort: processes.value.length + 1,
  });
}

function openProcessManager() {
  resetProcessForm();
  processDirtyGuard.markClean();
  processDialogOpen.value = true;
}

async function editProcess(item: MachineProcessItem) {
  if (processEditId.value === item.id) return;
  // 表单里有未保存的输入（新增草稿或正在编辑的另一条）时，切换前先确认，
  // 不静默覆盖。
  const ok = await processDirtyGuard.confirmDiscard(
    '切换到编辑其他制程后，本次输入的内容不会被保存。',
  );
  if (!ok) return;
  processValidationAttempted.value = false;
  processEditId.value = item.id;
  Object.assign(processForm, { name: item.name, sort: item.sort });
  processDirtyGuard.markClean();
}

async function closeProcessManager() {
  if (await processDirtyGuard.confirmClose()) {
    processDialogOpen.value = false;
  }
}

function saveProcess() {
  processValidationAttempted.value = true;
  const result = store.saveMachineProcess(
    { name: processForm.name.trim(), sort: processForm.sort },
    processEditId.value,
  );
  if (
    notifyResult(result, processEditId.value ? '制程已更新' : '制程已新增', {
      duplicate: '该制程名称已存在',
      stale: '该制程已被删除，请刷新后重试',
    })
  ) {
    resetProcessForm();
    processDirtyGuard.markClean();
  }
}

async function removeProcess(item: MachineProcessItem) {
  const ok = await confirmDelete(
    '删除制程',
    `确认删除“${item.name}”吗？请先清空该制程下全部机型的 Tab 和内容。`,
  );
  if (!ok) return;
  const wasActive = activeProcessId.value === item.id;
  const result = store.deleteMachineProcess(item.id);
  const deleted = notifyResult(result, '制程已删除', {
    validation: '默认制程不能删除',
    'not-empty': '请先清空该制程下全部机型的 Tab、内容和示意图',
    stale: '该制程已被删除，请刷新后重试',
  });
  // 删掉的正是表单里正在编辑的制程：表单退回“新增制程”，否则再保存会
  // 指向一条已不存在的记录。
  if (deleted && processEditId.value === item.id) {
    resetProcessForm();
    processDirtyGuard.markClean();
  }
  if (deleted && wasActive) {
    void router.replace({
      path: route.path,
      query: addMachineContextQuery(currentSelectionQuery()),
    });
  }
}

function onToggleCheck(payload: {
  category?: string;
  configuration?: string | null;
  item: string;
  checked: boolean;
}) {
  if (!auth.isAuthenticated) return;
  if (!payload.category) return;
  const key = entityTreeItemKey({
    category: payload.category,
    configuration: payload.configuration ?? null,
    name: payload.item,
  });
  const next = new Set(checkedMachineKeys.value);
  if (payload.checked) next.add(key);
  else next.delete(key);
  checkedMachineKeys.value = [...next];
}

function ensureSelected() {
  if (selectedMachineNames.value.length > 0) return true;
  message.warning('请先在左侧勾选至少一个机型');
  return false;
}

function ensureReportContent() {
  if (hasReportContent.value) return true;
  message.warning('所选机型暂无可生成的内容');
  return false;
}

function previewReport() {
  if (!auth.isAuthenticated) return;
  if (!ensureSelected()) return;
  if (!ensureReportContent()) return;
  const opened = openMachineSchematicReport(
    selectedMachineNames.value,
    reportSections.value,
  );
  if (!opened) {
    message.warning('报告窗口被浏览器拦截，请允许弹窗后重试');
  }
}

async function generateReport() {
  if (!auth.isAuthenticated) return;
  if (!ensureSelected()) return;
  if (!ensureReportContent()) return;
  reportGenerating.value = true;
  try {
    const blob = await api.downloadMachineSchematicReport({
      machineNames: selectedMachineNames.value,
      sections: reportSections.value,
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `机型结构示意图报告-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    message.success('后端报告已生成并下载，可打开后打印为 PDF');
  } catch (error) {
    message.error(
      error instanceof ApiError ? error.message : '报告生成失败，请稍后重试',
    );
  } finally {
    reportGenerating.value = false;
  }
}

function openAddTab() {
  tabValidationAttempted.value = false;
  editId.value = undefined;
  Object.assign(form, {
    kind: 'structure' as MachineSectionKind,
    name: '',
    sort: displaySections.value.length + 1,
  });
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

function openRenameTab(value: string) {
  const section = displaySections.value.find(
    (item) => String(item.id) === value,
  );
  if (!section) return;
  tabValidationAttempted.value = false;
  editId.value = section.id;
  Object.assign(form, {
    kind: section.kind,
    name: section.name,
    sort: section.sort,
  });
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

async function cancelTabDialog() {
  if (await dirtyGuard.confirmClose()) {
    dialogOpen.value = false;
  }
}

function saveTab() {
  const machineName = selection.value.item;
  if (!machineName) return;
  tabValidationAttempted.value = true;
  const result = store.saveExtraMachineSection(
    machineName,
    { kind: form.kind, name: form.name.trim(), sort: form.sort },
    editId.value,
    activeProcessId.value,
  );
  if (
    notifyResult(result, editId.value ? 'Tab 已更新' : 'Tab 已新增', {
      duplicate: '该 Tab 名称已存在',
      'not-empty': '请先清空该 Tab 的数据和示意图后再修改类型',
      stale: '该 Tab 已被删除，请刷新后重试',
    })
  ) {
    dialogOpen.value = false;
  }
}

async function closeTab(value: string) {
  const section = displaySections.value.find(
    (item) => String(item.id) === value,
  );
  if (!section) return;
  const ok = await confirmDelete(
    '删除 Tab',
    `确认删除“${section.name}”吗？请先清空该 Tab 下的全部数据。`,
  );
  if (!ok) return;
  notifyResult(
    store.deleteExtraMachineSection(
      selection.value.item,
      section.id,
      activeProcessId.value,
    ),
    'Tab 已删除',
    {
      'not-empty': '请先清空该 Tab 下的全部数据后再删除',
      stale: '该 Tab 已被删除，请刷新后重试',
    },
  );
}
</script>

<template>
  <section class="selection-page">
    <h1 class="visually-hidden">机型结构</h1>
    <div
      class="selection-split"
      :class="{
        'selection-split--machine': activeMachineView === 'browse',
        'selection-split--global-search': activeMachineView === 'find',
      }"
    >
      <div class="machine-source-stack">
        <div class="machine-process-context" aria-label="当前浏览制程">
          <a-select
            v-model:value="processSelection"
            class="machine-process-context__select"
            :options="processOptions"
            placeholder="选择制程"
            aria-label="当前浏览制程"
            size="small"
          />
          <a-button
            v-if="writable"
            type="text"
            class="machine-process-context__manage"
            size="small"
            @click="openProcessManager"
          >
            管理制程
          </a-button>
        </div>
        <a-segmented
          class="machine-catalog-tabs"
          block
          aria-label="机型目录"
          :value="activeMachineType"
          :options="machineCatalogTabs"
          @change="selectMachineCatalog(String($event))"
        />
        <a-segmented
          v-if="activeMachineType === 'mechanism'"
          class="machine-view-tabs"
          block
          aria-label="机型浏览方式"
          :value="activeMachineView"
          :options="machineViewTabs"
          @change="selectMachineView(String($event))"
        />
        <EntitySource
          v-if="activeMachineView === 'browse'"
          kind="machine"
          :machine-type="activeMachineType"
          :selected="selection.item"
          :selected-key="selectedMachineKey"
          :checked-items="auth.isAuthenticated ? checkedMachineKeys : undefined"
          @select="selectEntity"
          @toggle-check="onToggleCheck"
        />
      </div>
      <MachineGlobalSearch
        v-if="activeMachineView === 'find'"
        class="machine-global-search"
        :documents="globalSearchDocuments"
        :machine-model-options="machineModelOptions"
        :process-step-options="processStepOptions"
        :board-characteristic-options="boardCharacteristicOptions"
        :process-options="processOptions"
        @select="openGlobalSearchResult"
      />
      <div v-else-if="selection.item" class="selection-panel">
        <a-tabs
          v-if="tabs.length"
          class="machine-section-tabs entity-tabs"
          type="editable-card"
          size="small"
          :active-key="activeSection"
          :hide-add="!writable"
          destroy-inactive-tab-pane
          @change="onTabChange(String($event))"
          @edit="onTabEdit"
        >
          <a-tab-pane v-for="tab in tabs" :key="tab.value" :closable="writable">
            <template #tab>
              <span class="machine-section-tabs__label">
                {{ tab.label }}
                <a-tooltip
                  v-if="writable && tab.value === activeSection"
                  title="重命名 Tab"
                >
                  <a-button
                    type="text"
                    size="small"
                    aria-label="重命名 Tab"
                    @click.stop="openRenameTab(tab.value)"
                  >
                    <template #icon><Pencil :size="12" /></template>
                  </a-button>
                </a-tooltip>
              </span>
            </template>
            <MachineSectionPanel
              v-if="activeSectionItem"
              :machine-name="selection.item"
              :process-id="activeProcessId"
              :section="activeSectionItem"
              :focus-row-id="Number(route.query.focusRow) || undefined"
            />
          </a-tab-pane>
          <template v-if="auth.isAuthenticated" #rightExtra>
            <div class="machine-report">
              <span class="selection-toolbar__count">
                已选 {{ selectedMachineItems.length }} /
                {{ availableMachineItems.length }} 个机型
              </span>
              <a-button
                type="text"
                size="small"
                @click="checkedMachineKeys = [...availableMachineKeys]"
              >
                全选机型
              </a-button>
              <a-button
                type="text"
                :disabled="selectedMachineItems.length === 0"
                size="small"
                @click="checkedMachineKeys = []"
              >
                清空
              </a-button>
              <a-tooltip
                :title="
                  selectedMachineItems.length === 0
                    ? '请先在左侧勾选至少一个机型'
                    : ''
                "
              >
                <span class="inline-flex">
                  <a-button
                    type="primary"
                    :disabled="selectedMachineItems.length === 0"
                    :loading="reportGenerating"
                    size="small"
                    @click="generateReport"
                  >
                    生成并下载报告
                  </a-button>
                </span>
              </a-tooltip>
              <a-tooltip
                :title="
                  selectedMachineItems.length === 0
                    ? '请先在左侧勾选至少一个机型'
                    : ''
                "
              >
                <span class="inline-flex">
                  <a-button
                    :disabled="selectedMachineItems.length === 0"
                    size="small"
                    @click="previewReport"
                  >
                    预览 / 打印 PDF
                  </a-button>
                </span>
              </a-tooltip>
            </div>
          </template>
        </a-tabs>
        <a-empty v-else>
          <template #description>
            <div>暂无 Tab</div>
            <div class="empty-hint">请新增“结构”或“机型注意事项”Tab</div>
          </template>
          <template v-if="writable" #default>
            <a-button type="primary" @click="openAddTab">新增 Tab</a-button>
          </template>
        </a-empty>
      </div>
      <a-empty v-else description="暂无机型，请在左侧新建分类和机型" />
    </div>
    <a-modal
      :open="processDialogOpen"
      title="管理制程"
      :width="520"
      destroy-on-close
      @cancel="closeProcessManager"
    >
      <a-list
        class="machine-process-list"
        :data-source="processes"
        size="small"
        bordered
      >
        <template #renderItem="{ item }">
          <a-list-item>
            <a-list-item-meta
              :title="item.name"
              :description="item.locked ? undefined : `排序 ${item.sort}`"
            />
            <template #actions>
              <a-tooltip title="编辑制程">
                <a-button
                  type="text"
                  size="small"
                  aria-label="编辑制程"
                  @click="editProcess(item)"
                >
                  <template #icon><Pencil :size="14" /></template>
                </a-button>
              </a-tooltip>
              <a-tooltip v-if="!item.locked" title="删除制程">
                <a-button
                  type="text"
                  size="small"
                  danger
                  aria-label="删除制程"
                  @click="removeProcess(item)"
                >
                  <template #icon><Trash2 :size="14" /></template>
                </a-button>
              </a-tooltip>
            </template>
          </a-list-item>
        </template>
      </a-list>
      <div class="machine-process-form">
        <a-divider orientation="left">
          {{ processEditId ? '编辑制程' : '新增制程' }}
        </a-divider>
        <a-form layout="vertical">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item
                html-for="machine-name"
                label="制程名称"
                required
                v-bind="
                  fieldError(
                    processValidationAttempted && !processForm.name.trim()
                      ? '请输入制程名称'
                      : undefined,
                  )
                "
              >
                <a-input
                  id="machine-name"
                  v-model:value="processForm.name"
                  :maxlength="40"
                  placeholder="例如：制程2"
                  allow-clear
                  show-count
                />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item html-for="machine-sort" label="排序">
                <a-input-number
                  id="machine-sort"
                  v-model:value="processForm.sort"
                  :min="1"
                  style="width: 100%"
                />
              </a-form-item>
            </a-col>
          </a-row>
        </a-form>
        <div class="machine-process-form__actions">
          <a-button v-if="processEditId" @click="resetProcessForm">
            取消编辑
          </a-button>
          <a-button type="primary" @click="saveProcess">
            {{ processEditId ? '保存修改' : '新增制程' }}
          </a-button>
        </div>
      </div>
      <template #footer>
        <a-button @click="closeProcessManager">完成</a-button>
      </template>
    </a-modal>
    <a-modal
      :open="dialogOpen"
      :title="editId ? '编辑 Tab' : '新增 Tab'"
      :width="420"
      destroy-on-close
      @cancel="cancelTabDialog"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item
              html-for="machine-name-2"
              label="Tab 名称"
              required
              v-bind="
                fieldError(
                  tabValidationAttempted && !form.name.trim()
                    ? '请输入 Tab 名称'
                    : undefined,
                )
              "
            >
              <a-input
                id="machine-name-2"
                v-model:value="form.name"
                :maxlength="40"
                allow-clear
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item html-for="machine-kind" label="Tab 类型" required>
              <a-select
                id="machine-kind"
                v-model:value="form.kind"
                :options="[
                  { label: '结构', value: 'structure' },
                  { label: '机型注意事项', value: 'notes' },
                ]"
              />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item html-for="machine-sort-2" label="排序">
              <a-input-number
                id="machine-sort-2"
                v-model:value="form.sort"
                :min="1"
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <template #footer>
        <a-button @click="cancelTabDialog">取消</a-button>
        <a-button type="primary" @click="saveTab">保存</a-button>
      </template>
    </a-modal>
  </section>
</template>

<style scoped>
.machine-source-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 280px;
  min-height: 0;
}

.machine-source-stack > .entity-source {
  flex: 1;
}

.selection-split--global-search {
  grid-template-columns: 280px minmax(0, 1fr);
}

.machine-global-search {
  min-height: 0;
}

.machine-process-context {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.machine-process-context__select {
  flex: 1;
  min-width: 0;
}

.machine-section-tabs__label {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
}

.machine-process-list {
  margin-bottom: var(--space-5);
}

.machine-process-form__actions {
  display: flex;
  gap: var(--space-3);
  justify-content: flex-end;
}

@media (width <= 60rem) {
  .machine-source-stack,
  .selection-split--global-search {
    width: 100%;
    grid-template-columns: 1fr;
  }
}
</style>
