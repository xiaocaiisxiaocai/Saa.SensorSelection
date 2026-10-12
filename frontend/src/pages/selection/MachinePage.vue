<script setup lang="ts">
import { Pencil } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  entityTreeItemKey,
  filterMachineGroups,
  listEntityTreeItems,
  type MachineCatalogKind,
} from '@/domain';
import EntitySource from '@/pages/selection/EntitySource.vue';
import MachineCatalogSwitch from '@/pages/selection/machine/MachineCatalogSwitch.vue';
import MachineGlobalSearch from '@/pages/selection/machine/MachineGlobalSearch.vue';
import MachineProcessDialog from '@/pages/selection/machine/MachineProcessDialog.vue';
import MachineReportBar from '@/pages/selection/machine/MachineReportBar.vue';
import MachineSectionPanel from '@/pages/selection/machine/MachineSectionPanel.vue';
import MachineTabDialog from '@/pages/selection/machine/MachineTabDialog.vue';
import {
  machineCatalogFromQuery,
  resolveMachineSelection,
} from '@/pages/selection/machine/machine-selection';
import { buildMachineSearchDocuments } from '@/pages/selection/machine/machine-search-documents';
import type { MachineStructureSearchResult } from '@/pages/selection/machine/machine-structure-search';
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

const processDialog = ref<InstanceType<typeof MachineProcessDialog>>();
const tabDialog = ref<InstanceType<typeof MachineTabDialog>>();
const activeSection = ref('');
const checkedMachineKeys = ref<string[]>([]);

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
const activeMachineType = computed<MachineCatalogKind>(() =>
  machineCatalogFromQuery(groups.value, route.query),
);
const activeMachineView = computed<'browse' | 'find'>(() =>
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
const selection = computed(() =>
  resolveMachineSelection(catalogGroups.value, route.query),
);
const selectedMachineKey = computed(() =>
  entityTreeItemKey({
    category: selection.value.category,
    configuration: selection.value.configuration || null,
    name: selection.value.item,
  }),
);
const machineModelOptions = computed(() =>
  store
    .dictionaryItems('machine-model')
    .map((item) => ({ label: item.name, value: item.id })),
);
const processStepOptions = computed(() =>
  store.processSteps.map((item) => ({
    label: `${item.layer} · ${item.name}`,
    value: item.id,
  })),
);
const boardCharacteristicOptions = computed(() =>
  store
    .dictionaryItems('board-characteristic')
    .map((item) => ({ label: item.name, value: item.id })),
);
const globalSearchDocuments = computed(() =>
  // 遍历「制程 × 机型 × 分区」时，每次取行都会重新归一化 Sensor/工序/字典；
  // batchRead 让这些归一化结果在本次构建里只算一次。
  store.batchRead(() =>
    buildMachineSearchDocuments(store, groups.value, processes.value),
  ),
);
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

// 删掉的正是当前浏览的制程：地址栏退回默认制程。
// 删除后 activeProcessId 已经回落，所以按地址栏里的制程判断（默认制程不能删，
// 被删的制程只要正在浏览就一定写在 ?process= 里）。
function onProcessDeleted(processId: number) {
  if (Number(route.query.process) !== processId) return;
  void router.replace({
    path: route.path,
    query: addMachineContextQuery(currentSelectionQuery()),
  });
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

function openAddTab() {
  tabDialog.value?.openAdd(displaySections.value.length + 1);
}

function openRenameTab(value: string) {
  const section = displaySections.value.find(
    (item) => String(item.id) === value,
  );
  if (section) tabDialog.value?.openEdit(section);
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
        <MachineCatalogSwitch
          :process-id="activeProcessId"
          :process-options="processOptions"
          :catalog="activeMachineType"
          :view="activeMachineView"
          :writable="writable"
          @process="selectProcess"
          @catalog="selectMachineCatalog"
          @view="selectMachineView"
          @manage-processes="processDialog?.open()"
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
            <MachineReportBar
              :machine-names="selectedMachineNames"
              :available-count="availableMachineItems.length"
              :process-id="activeProcessId"
              @select-all="checkedMachineKeys = [...availableMachineKeys]"
              @clear="checkedMachineKeys = []"
            />
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
    <MachineProcessDialog ref="processDialog" @deleted="onProcessDeleted" />
    <MachineTabDialog
      ref="tabDialog"
      :machine-name="selection.item"
      :process-id="activeProcessId"
    />
  </section>
</template>

<style scoped src="./MachinePage.css"></style>
