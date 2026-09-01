<script setup lang="ts">
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
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useAccess, useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { toast } from '@/ui/toast';
import {
  AButton,
  AEmptyState,
  AField,
  AFormGrid,
  AFormRow,
  AIconButton,
  ASelect,
  ASheet,
  AStepper,
  ATabBar,
  type TabItem,
} from '@/ui';

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
const form = reactive({
  kind: 'structure' as MachineSectionKind,
  name: '',
  sort: 1,
});
const processForm = reactive({
  name: '',
  sort: 1,
});
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
const machineCatalogTabs: TabItem[] = [
  { label: '结构', value: 'mechanism' },
  { label: '专案机型', value: 'project' },
];
const machineViewTabs: TabItem[] = [
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
  const found = catalogGroups.value
    .flatMap((group) => [
      ...group.items.map((name) => ({
        category: group.name,
        configuration: '',
        name,
      })),
      ...(group.configurations ?? []).flatMap((configuration) =>
        configuration.items.map((name) => ({
          category: group.name,
          configuration: configuration.name,
          name,
        })),
      ),
    ])
    .find(
      (item) =>
        item.name === requested &&
        (!requestedCategory || item.category === requestedCategory) &&
        (!requestedConfiguration ||
          item.configuration === requestedConfiguration),
    );
  if (found) {
    return {
      category: found.category,
      configuration: found.configuration,
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
const globalSearchDocuments = computed<MachineStructureSearchDocument[]>(() => {
  const documents: MachineStructureSearchDocument[] = [];
  const mechanismGroups = filterMachineGroups(groups.value, 'mechanism');
  for (const process of processes.value) {
    for (const group of mechanismGroups) {
      const treeItems = [
        ...group.items.map((machineName) => ({
          configuration: '',
          machineName,
        })),
        ...(group.configurations ?? []).flatMap((configuration) =>
          configuration.items.map((machineName) => ({
            configuration: configuration.name,
            machineName,
          })),
        ),
      ];
      for (const treeItem of treeItems) {
        const sections = store
          .resolvedMachineSections(treeItem.machineName, process.id)
          .filter((section) => section.kind === 'structure');
        for (const section of sections) {
          for (const row of store.machineSectionRows(
            section.id,
            treeItem.machineName,
            process.id,
          )) {
            const machineModel = machineModelItems.value.find(
              (item) => item.id === row.machineModelId,
            );
            const processStep = store.processSteps.find(
              (item) => item.id === row.processStepId,
            );
            const boardCharacteristic = boardCharacteristicItems.value.find(
              (item) => item.id === row.boardCharacteristicId,
            );
            const sensors = row.sensorIds
              .map((id) => store.sensors.find((sensor) => sensor.id === id))
              .filter((sensor) => Boolean(sensor));
            documents.push({
              boardCharacteristicId: row.boardCharacteristicId,
              boardCharacteristicName: boardCharacteristic?.name ?? '',
              category: group.name,
              configuration: treeItem.configuration,
              machineModelId: row.machineModelId,
              machineModelName: machineModel?.name ?? '',
              machineName: treeItem.machineName,
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
  }
  return documents;
});
const displaySections = computed(() => {
  if (!selection.value.item) return [];
  return store
    .resolvedMachineSections(selection.value.item, activeProcessId.value)
    .map((section) => ({ ...section, displayName: section.name }));
});
const tabs = computed<TabItem[]>(() =>
  displaySections.value.map((section) => ({
    label: section.displayName,
    value: String(section.id),
    closable: writable.value,
    renamable: writable.value,
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
      query: addMachineContextQuery({
        category: selection.value.category,
        item: selection.value.item,
        section: next,
        ...(selection.value.configuration
          ? { configuration: selection.value.configuration }
          : {}),
      }),
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

function onTabChange(sectionId: string) {
  activeSection.value = sectionId;
  const query: Record<string, string> = addMachineContextQuery({
    category: selection.value.category,
    item: selection.value.item,
    section: sectionId,
  });
  if (selection.value.configuration) {
    query.configuration = selection.value.configuration;
  }
  void router.replace({ path: route.path, query });
}

function selectProcess(processId: number) {
  if (
    !Number.isSafeInteger(processId) ||
    !processes.value.some((item) => item.id === processId) ||
    processId === activeProcessId.value
  ) {
    return;
  }
  const query: Record<string, string> = addMachineContextQuery(
    {
      category: selection.value.category,
      item: selection.value.item,
      ...(selection.value.configuration
        ? { configuration: selection.value.configuration }
        : {}),
    },
    processId,
  );
  void router.replace({ path: route.path, query });
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
    {
      category: selection.value.category,
      item: selection.value.item,
      ...(selection.value.configuration
        ? { configuration: selection.value.configuration }
        : {}),
      ...(activeSection.value ? { section: activeSection.value } : {}),
    },
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
  processEditId.value = undefined;
  Object.assign(processForm, {
    name: '',
    sort: processes.value.length + 1,
  });
}

function openProcessManager() {
  resetProcessForm();
  processDialogOpen.value = true;
}

function editProcess(item: MachineProcessItem) {
  processEditId.value = item.id;
  Object.assign(processForm, { name: item.name, sort: item.sort });
}

function saveProcess() {
  const result = store.saveMachineProcess(
    { name: processForm.name.trim(), sort: processForm.sort },
    processEditId.value,
  );
  if (
    toastResult(result, processEditId.value ? '制程已更新' : '制程已新增', {
      duplicate: '该制程名称已存在',
      validation: '请填写制程名称',
      stale: '该制程已被删除，请刷新后重试',
    })
  ) {
    resetProcessForm();
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
  if (
    toastResult(result, '制程已删除', {
      validation: '默认制程不能删除',
      'not-empty': '请先清空该制程下全部机型的 Tab、内容和示意图',
      stale: '该制程已被删除，请刷新后重试',
    }) &&
    wasActive
  ) {
    void router.replace({
      path: route.path,
      query: addMachineContextQuery({
        category: selection.value.category,
        item: selection.value.item,
        ...(selection.value.configuration
          ? { configuration: selection.value.configuration }
          : {}),
      }),
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
  toast.warning('请先在左侧勾选至少一个机型');
  return false;
}

function ensureReportContent() {
  if (hasReportContent.value) return true;
  toast.warning('所选机型暂无可生成的内容');
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
    toast.warning('报告窗口被浏览器拦截，请允许弹窗后重试');
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
    toast.success('后端报告已生成并下载，可打开后打印为 PDF');
  } catch (error) {
    toast.error(
      error instanceof ApiError ? error.message : '报告生成失败，请稍后重试',
    );
  } finally {
    reportGenerating.value = false;
  }
}

function openAddTab() {
  editId.value = undefined;
  Object.assign(form, {
    kind: 'structure' as MachineSectionKind,
    name: '',
    sort: displaySections.value.length + 1,
  });
  dialogOpen.value = true;
}

function openRenameTab(value: string) {
  const section = displaySections.value.find(
    (item) => String(item.id) === value,
  );
  if (!section) return;
  editId.value = section.id;
  Object.assign(form, {
    kind: section.kind,
    name: section.name,
    sort: section.sort,
  });
  dialogOpen.value = true;
}

function saveTab() {
  const machineName = selection.value.item;
  if (!machineName) return;
  const result = store.saveExtraMachineSection(
    machineName,
    { kind: form.kind, name: form.name.trim(), sort: form.sort },
    editId.value,
    activeProcessId.value,
  );
  if (
    toastResult(result, editId.value ? 'Tab 已更新' : 'Tab 已新增', {
      duplicate: '该 Tab 名称已存在',
      validation: '请填写 Tab 名称',
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
  toastResult(
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
        'selection-split--global-search': activeMachineView === 'find',
      }"
    >
      <div class="machine-source-stack">
        <div class="machine-process-context" aria-label="当前浏览制程">
          <ASelect
            v-model="processSelection"
            class="machine-process-context__select"
            :options="processOptions"
            placeholder="选择制程"
            aria-label="当前浏览制程"
            size="small"
          />
          <AButton
            v-if="writable"
            class="machine-process-context__manage"
            variant="borderless"
            size="small"
            @click="openProcessManager"
          >
            管理制程
          </AButton>
        </div>
        <ATabBar
          class="machine-catalog-tabs"
          :model-value="activeMachineType"
          :tabs="machineCatalogTabs"
          @update:model-value="selectMachineCatalog"
        />
        <div
          v-if="activeMachineType === 'mechanism'"
          class="machine-view-context"
        >
          <ATabBar
            class="machine-view-tabs"
            :model-value="activeMachineView"
            :tabs="machineViewTabs"
            @update:model-value="selectMachineView"
          />
          <span
            v-if="activeMachineView === 'find'"
            class="machine-view-context__hint"
          >
            全局查找不受当前浏览制程限制
          </span>
        </div>
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
        <div v-if="auth.isAuthenticated" class="machine-report">
          <span class="selection-toolbar__count">
            已选 {{ selectedMachineItems.length }} /
            {{ availableMachineItems.length }} 个机型
          </span>
          <AButton
            variant="borderless"
            @click="checkedMachineKeys = [...availableMachineKeys]"
          >
            全选机型
          </AButton>
          <AButton
            variant="borderless"
            :disabled="selectedMachineItems.length === 0"
            @click="checkedMachineKeys = []"
          >
            清空
          </AButton>
          <AButton
            variant="filled"
            :disabled="selectedMachineItems.length === 0"
            :loading="reportGenerating"
            @click="generateReport"
          >
            生成并下载报告
          </AButton>
          <AButton
            variant="borderless"
            :disabled="selectedMachineItems.length === 0"
            @click="previewReport"
          >
            预览 / 打印 PDF
          </AButton>
        </div>
        <ATabBar
          :model-value="activeSection"
          :tabs="tabs"
          :addable="writable"
          add-label="新增 Tab"
          @update:model-value="onTabChange"
          @add="openAddTab"
          @rename="openRenameTab"
          @close="closeTab"
        />
        <MachineSectionPanel
          v-if="activeSectionItem"
          :machine-name="selection.item"
          :process-id="activeProcessId"
          :section="activeSectionItem"
          :focus-row-id="Number(route.query.focusRow) || undefined"
        />
        <AEmptyState
          v-else
          title="暂无 Tab"
          description="请新增“结构”或“机型注意事项”Tab"
        >
          <template v-if="writable" #action>
            <AButton variant="filled" @click="openAddTab">新增 Tab</AButton>
          </template>
        </AEmptyState>
      </div>
      <AEmptyState v-else title="暂无机型，请在左侧新建分类和机型" />
    </div>
    <ASheet v-model:open="processDialogOpen" title="管理制程" :width="520">
      <div class="machine-process-list">
        <div
          v-for="item in processes"
          :key="item.id"
          class="machine-process-list__item"
        >
          <div class="machine-process-list__name">
            <strong>{{ item.name }}</strong>
            <span v-if="!item.locked">排序 {{ item.sort }}</span>
          </div>
          <div class="machine-process-list__actions">
            <AIconButton
              :icon="Pencil"
              label="编辑制程"
              size="small"
              @click="editProcess(item)"
            />
            <AIconButton
              v-if="!item.locked"
              :icon="Trash2"
              label="删除制程"
              size="small"
              tone="danger"
              @click="removeProcess(item)"
            />
          </div>
        </div>
      </div>
      <div class="machine-process-form">
        <h3>{{ processEditId ? '编辑制程' : '新增制程' }}</h3>
        <AFormGrid :columns="2">
          <AFormRow label="制程名称" required>
            <AField
              v-model="processForm.name"
              :maxlength="40"
              placeholder="例如：制程2"
            />
          </AFormRow>
          <AFormRow label="排序">
            <AStepper v-model="processForm.sort" :min="1" />
          </AFormRow>
        </AFormGrid>
        <div class="machine-process-form__actions">
          <AButton v-if="processEditId" @click="resetProcessForm">
            取消编辑
          </AButton>
          <AButton variant="filled" @click="saveProcess">
            {{ processEditId ? '保存修改' : '新增制程' }}
          </AButton>
        </div>
      </div>
      <template #footer>
        <AButton @click="processDialogOpen = false">完成</AButton>
      </template>
    </ASheet>
    <ASheet
      v-model:open="dialogOpen"
      :title="editId ? '编辑 Tab' : '新增 Tab'"
      :width="420"
    >
      <AFormGrid :columns="1">
        <AFormRow label="Tab 名称" required>
          <AField v-model="form.name" :maxlength="40" />
        </AFormRow>
        <AFormRow label="Tab 类型" required>
          <ASelect
            v-model="form.kind"
            :options="[
              { label: '结构', value: 'structure' },
              { label: '机型注意事项', value: 'notes' },
            ]"
          />
        </AFormRow>
        <AFormRow label="排序">
          <AStepper v-model="form.sort" :min="1" />
        </AFormRow>
      </AFormGrid>
      <template #footer>
        <AButton @click="dialogOpen = false">取消</AButton>
        <AButton variant="filled" @click="saveTab">保存</AButton>
      </template>
    </ASheet>
  </section>
</template>

<style scoped>
.machine-source-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: max-content;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
}

.machine-source-stack > .entity-source {
  flex: 1;
  height: auto;
}

.selection-split--global-search {
  grid-template-rows: auto minmax(0, 1fr);
}

.selection-split--global-search > .machine-source-stack {
  height: auto;
}

.machine-global-search {
  grid-column: 1 / -1;
  min-width: 0;
  min-height: 0;
}

.machine-process-context {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  width: 100%;
  padding: 0 var(--space-1);
  white-space: nowrap;
}

.machine-process-context__select {
  flex: 1;
  width: 150px;
  min-width: 120px;
}

.machine-process-context__manage {
  flex: none;
}

.machine-catalog-tabs {
  width: 100%;
  padding: 0 var(--space-1);
}

.machine-catalog-tabs :deep(.a-tab-bar__tab) {
  flex: 1;
  justify-content: center;
  height: var(--control-height-md);
  font: var(--text-caption);
}

.machine-catalog-tabs :deep(.a-tab-bar__tab--selected) {
  font-weight: 600;
}

.machine-view-context {
  display: grid;
  gap: var(--space-1);
  width: 100%;
  padding: 0 var(--space-1);
}

.machine-view-tabs {
  width: 100%;
  padding: 2px;
  border: 1px solid var(--separator);
  border-radius: 8px;
  background: var(--fill-4);
}

.machine-view-tabs :deep(.a-tab-bar__tab) {
  flex: 1;
  justify-content: center;
  min-height: var(--control-height-sm);
  border-radius: 6px;
  font: var(--text-caption);
}

.machine-view-tabs :deep(.a-tab-bar__tab--selected) {
  background: var(--surface-1);
  box-shadow: var(--shadow-1);
  font-weight: 600;
}

.machine-view-context__hint {
  color: var(--label-2);
  font: var(--text-caption);
  text-align: center;
}

.machine-process-list {
  display: grid;
  gap: var(--space-3);
}

.machine-process-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: var(--row-height-loose);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--separator);
  border-radius: 10px;
  background: var(--fill-4);
}

.machine-process-list__name {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.machine-process-list__name strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.machine-process-list__name span {
  color: var(--label-2);
  font: var(--text-caption);
}

.machine-process-list__actions,
.machine-process-form__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
}

.machine-process-form {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--separator);
}

.machine-process-form h3 {
  margin: 0;
  font: var(--text-control-em);
}

@media (width < 60rem) {
  .machine-source-stack {
    width: 100%;
    height: 100%;
  }

  .machine-process-context {
    gap: var(--space-1);
    padding: 0;
  }

  .machine-process-context__select {
    width: auto;
    min-width: 0;
  }

  .machine-process-context__manage {
    padding-inline: var(--space-2);
  }

  .selection-split--global-search {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .machine-report {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }

  .machine-report .selection-toolbar__count {
    grid-column: 1 / -1;
    margin-right: 0;
  }

  .machine-report :deep(.a-button) {
    width: 100%;
  }
}
</style>
