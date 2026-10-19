<script setup lang="ts">
import { Columns2, Pencil } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  filterMachineGroups,
  listEntityTreeItems,
  MACHINE_TAB_PAGE_OWNER,
  type MachineCatalogKind,
  type MachineNodeRef,
  type MachineSectionItem,
  type MachineSectionRow,
  type SaveResult,
} from '@/domain';
import EntitySource from '@/pages/selection/EntitySource.vue';
import SourcePane from '@/pages/selection/SourcePane.vue';
import MachineCatalogSwitch from '@/pages/selection/machine/MachineCatalogSwitch.vue';
import MachineComparisonPanel from '@/pages/selection/machine/MachineComparisonPanel.vue';
import MachineGlobalSearchFilters from '@/pages/selection/machine/MachineGlobalSearchFilters.vue';
import MachineGlobalSearchResults from '@/pages/selection/machine/MachineGlobalSearchResults.vue';
import MachineReportBar from '@/pages/selection/machine/MachineReportBar.vue';
import MachineSectionPanel from '@/pages/selection/machine/MachineSectionPanel.vue';
import MachineTabDialog from '@/pages/selection/machine/MachineTabDialog.vue';
import {
  lockedBranchKeys,
  nodeFromQuery,
  nodeHasChildren,
  nodeLabel,
  nodeTreeKey,
  nodePathLabel,
  sameNode,
  machineTreeSelection,
  pagesOf,
  selectedLeafCount,
  treeCheckState,
} from '@/pages/selection/machine/machine-nodes';
import { commonMachineTabs } from '@/pages/selection/machine/machine-compare';
import {
  machineCatalogFromQuery,
  resolveMachineSelection,
  resolveTabSelection,
} from '@/pages/selection/machine/machine-selection';
import { buildMachineSearchDocuments } from '@/pages/selection/machine/machine-search-documents';
import {
  searchMachineStructures,
  type MachineStructureSearchResult,
} from '@/pages/selection/machine/machine-structure-search';
import { TAB_COUNT_STYLE } from '@/pages/shared/tabs';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import { useAccess, useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import '../shared/selection-page.css';

/*
 * 机型结构页。左侧选单（分类 → 配置 → 机型）选中一个末级节点，右侧显示
 * 当前目录（结构 / 专案机型）共用的一级 Tab，以及配置下的机型目录项。
 * 条件查找时，左侧换成筛选表单，右侧列出结构（不设条件就是全部，改条件立即过滤）。
 * 目录项在当前一级 Tab 下直接对应一张选型表。
 * 地址栏：?catalog=&view=&category=&configuration=&item=&tab=&page=&focusRow=。
 */
const route = useRoute();
const router = useRouter();
const store = useSelectionStore();
const auth = useAuthStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const tabDialog = ref<InstanceType<typeof MachineTabDialog>>();
const checkedPageIds = ref<number[]>([]);
/** 没有内容页的末级节点 key（有内容页的节点勾选其内容页） */
const checkedLeafKeys = ref<string[]>([]);
/** 挑选报告内容时才显示勾选框（平时浏览不需要），在「报告」下拉里切换 */

const groups = computed(() => store.entityGroups('machine'));
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
const tabs = computed(() =>
  store.machineTabs.filter((tab) => tab.catalog === activeMachineType.value),
);

/** 选中的选单节点：地址栏指定的，没有就退回第一个机型；目录为空时为 null */
const node = computed<MachineNodeRef | null>(() => {
  const requested = nodeFromQuery(catalogGroups.value, route.query);
  if (!requested) {
    const fallback = resolveMachineSelection(catalogGroups.value, {});
    return fallback.item
      ? {
          category: fallback.category,
          configuration: fallback.configuration || null,
          item: fallback.item,
        }
      : null;
  }
  if (requested.item || !requested.configuration) return requested;
  const pageId = Number(route.query.page);
  const legacyPage = tabs.value
    .filter(
      (tab) => !route.query.tab || String(tab.id) === String(route.query.tab),
    )
    .flatMap((tab) => tab.pages)
    .find(
      (page) =>
        page.id === pageId &&
        page.direct &&
        page.node.category === requested.category &&
        page.node.configuration === requested.configuration,
    );
  if (legacyPage) return legacyPage.node;
  return requested;
});
const nodeIsBranch = computed(() =>
  node.value
    ? nodeHasChildren(catalogGroups.value, node.value) === true
    : false,
);
const nodeName = computed(() => (node.value ? nodeLabel(node.value) : ''));

const lockedBranches = computed(() => lockedBranchKeys(tabs.value));
const availablePageIds = computed(() =>
  tabs.value.flatMap((tab) => tab.pages.map((page) => page.id)),
);
const checkedPages = computed(() => new Set(checkedPageIds.value));
// 目录树勾选：每个节点都能勾。勾一个节点 = 勾它下面的全部末级节点（机型）：
// 有内容页的节点按内容页勾选；没有内容页时单独记一个勾，部分勾选显示半选
const treeSelection = computed(() =>
  machineTreeSelection(catalogGroups.value, tabs.value),
);
const checkedLeaves = computed(() => new Set(checkedLeafKeys.value));
const emptyLeafKeys = computed(() =>
  [...treeSelection.value.leafPages]
    .filter(([, pages]) => pages.length === 0)
    .map(([key]) => key),
);
const selectedCount = computed(() =>
  selectedLeafCount(
    treeSelection.value,
    checkedPages.value,
    checkedLeaves.value,
  ),
);
const treeChecks = computed(() =>
  auth.isAuthenticated
    ? {
        ...treeCheckState(
          treeSelection.value,
          checkedPages.value,
          checkedLeaves.value,
        ),
        checkable: new Set(treeSelection.value.units.keys()),
      }
    : undefined,
);
const current = computed(() =>
  resolveTabSelection(tabs.value, node.value, route.query),
);
const activeTab = computed(() => current.value.tab);
const activePage = computed(() => current.value.page);
/**
 * 机型（最末一层）在一级 Tab 下直接显示对应表格。
 */
const nodeIsMachine = computed(() => Boolean(node.value?.item));

// 对比是临时只读视图，不改当前单条浏览的地址、Tab 或报告勾选。
const comparison = ref<{ left: MachineNodeRef; right: MachineNodeRef } | null>(
  null,
);
const comparePickerOpen = ref(false);
const compareTargetKey = ref<string>();
const compareTabKey = ref('');
const canCompare = computed(
  () =>
    activeMachineType.value === 'mechanism' &&
    activeMachineView.value === 'browse' &&
    nodeIsMachine.value &&
    !nodeIsBranch.value,
);
const compareCandidates = computed(() =>
  listEntityTreeItems(catalogGroups.value)
    .map((item) => ({
      category: item.category,
      configuration: item.configuration ?? null,
      item: item.name,
    }))
    .filter((item) => !node.value || !sameNode(item, node.value)),
);
const compareOptions = computed(() =>
  compareCandidates.value.map((item) => ({
    value: nodeTreeKey(item),
    label: nodePathLabel(item),
  })),
);
const comparisonTabs = computed(() =>
  comparison.value
    ? commonMachineTabs(
        tabs.value,
        comparison.value.left,
        comparison.value.right,
      )
    : [],
);
const comparisonTab = computed(
  () =>
    comparisonTabs.value.find((tab) => tab.key === compareTabKey.value) ??
    comparisonTabs.value[0] ??
    null,
);
const comparisonPanels = computed(() => {
  const pair = comparison.value;
  const tab = comparisonTab.value;
  if (!pair || !tab) return null;
  const panel = (side: 'left' | 'right') => ({
    name: pair[side].item ?? '',
    path: nodePathLabel(pair[side]),
    section: {
      id: tab[side].page.id,
      name: tab[side].page.name,
      sort: tab[side].tab.sort,
      kind: tab[side].tab.kind,
      scope: 'machine' as const,
    },
  });
  return { left: panel('left'), right: panel('right') };
});

function startComparison(target: MachineNodeRef) {
  if (
    !canCompare.value ||
    !node.value ||
    !target.item ||
    sameNode(node.value, target) ||
    nodeHasChildren(catalogGroups.value, target) !== false
  )
    return;
  comparison.value = { left: { ...node.value }, right: { ...target } };
  compareTabKey.value = activeTab.value?.name.trim() ?? '';
  comparePickerOpen.value = false;
}

function openComparePicker() {
  compareTargetKey.value = comparison.value
    ? nodeTreeKey(comparison.value.right)
    : undefined;
  comparePickerOpen.value = true;
}

function confirmComparison() {
  const target = compareCandidates.value.find(
    (item) => nodeTreeKey(item) === compareTargetKey.value,
  );
  if (target) startComparison(target);
}

watch(
  [
    canCompare,
    () => (node.value ? nodeTreeKey(node.value) : ''),
    catalogGroups,
  ],
  () => {
    if (
      !canCompare.value ||
      (comparison.value &&
        (!node.value ||
          !sameNode(node.value, comparison.value.left) ||
          nodeHasChildren(catalogGroups.value, comparison.value.right) !==
            false))
    ) {
      comparison.value = null;
      comparePickerOpen.value = false;
    }
  },
);
/** 一级 Tab 的徽标：机型显示选型记录数，目录分支显示所属目录项数 */
const pageCount = (tabId: number) => {
  const tab = tabs.value.find((item) => item.id === tabId);
  if (!tab || !node.value) return 0;
  const pages = pagesOf(tab, node.value);
  if (!nodeIsMachine.value) return pages.length;
  return pages[0]
    ? store.machineSectionRows(pages[0].id, MACHINE_TAB_PAGE_OWNER).length
    : 0;
};
/** 表格内容按页 id 存放，格式跟着所在 Tab 的类型 */
const pageSection = computed<MachineSectionItem | null>(() =>
  activeTab.value && activePage.value
    ? {
        id: activePage.value.id,
        name: activePage.value.name,
        sort: activeTab.value.sort,
        kind: activeTab.value.kind,
        scope: 'machine',
      }
    : null,
);

/** 右侧标题：选中节点的完整路径（分类 / 配置 / 机型），树里选中项可能不在视野内 */
const nodePath = computed(() =>
  node.value
    ? [node.value.category, node.value.configuration, node.value.item].filter(
        (part): part is string => Boolean(part),
      )
    : [],
);
const directEmptyHint = computed(() =>
  activeTab.value
    ? `「${nodeName.value}」在「${activeTab.value.name}」下还没有${
        activeTab.value.kind === 'notes' ? '注意事项' : '选型记录'
      }`
    : '',
);

/** 机型在当前 Tab 下还没有直属表格：先显示空表，第一次新增记录时再建 */
const placeholderSection = computed<MachineSectionItem | null>(() =>
  activeTab.value
    ? {
        id: 0,
        name: activeTab.value.name,
        sort: activeTab.value.sort,
        kind: activeTab.value.kind,
        scope: 'machine',
      }
    : null,
);

/** 机型在当前一级 Tab 下的第一笔记录：直属表格和记录一起保存 */
function saveDirectRow(
  payload: Partial<MachineSectionRow>,
): SaveResult<MachineSectionRow> {
  if (!activeTab.value || !node.value) return { ok: false, reason: 'stale' };
  return store.saveMachineDirectRow(activeTab.value.id, node.value, payload);
}

const boardCharacteristicOptions = computed(() =>
  store
    .dictionaryItems('board-characteristic')
    .map((item) => ({ label: item.name, value: item.id })),
);
const globalSearchDocuments = computed(() =>
  // 遍历「Tab × 目录项」时，每次取行都会重新归一化 Sensor/工序/字典；
  // batchRead 让这些归一化结果在本次构建里只算一次。
  store.batchRead(() => buildMachineSearchDocuments(store)),
);
const searchBoardCharacteristicIds = ref<Array<string | number>>([]);
const searchQuery = ref('');
/** 不设条件时就是全部结构；任一条件变化都会重算并让结果列表回到第一页 */
const globalSearchResults = computed(() =>
  searchMachineStructures(globalSearchDocuments.value, {
    boardCharacteristicIds: searchBoardCharacteristicIds.value.map(Number),
    machineModelIds: [],
    processStepIds: [],
    query: searchQuery.value,
  }),
);

const globalSearchFiltered = computed(
  () =>
    searchBoardCharacteristicIds.value.length > 0 ||
    searchQuery.value.trim() !== '',
);

// ── 地址栏 ──────────────────────────────────────────────────────

function contextQuery(
  catalog = activeMachineType.value,
  view = activeMachineView.value,
): Record<string, string> {
  const query: Record<string, string> = {};
  if (catalog === 'project') query.catalog = catalog;
  if (catalog === 'mechanism' && view === 'find') query.view = 'find';
  return query;
}

function nodeQuery(target: MachineNodeRef | null): Record<string, string> {
  if (!target) return {};
  return {
    category: target.category,
    ...(target.configuration ? { configuration: target.configuration } : {}),
    ...(target.item ? { item: target.item } : {}),
  };
}

function canonicalQuery(): Record<string, string> {
  const query = { ...contextQuery(), ...nodeQuery(node.value) };
  const { tab, page } = current.value;
  if (tab && !nodeIsBranch.value) query.tab = String(tab.id);
  if (page) query.page = String(page.id);
  const focusRow = String(route.query.focusRow || '');
  if (page && focusRow) query.focusRow = focusRow;
  return query;
}

function go(query: Record<string, string>) {
  void router.replace({ path: route.path, query });
}

const sameQuery = (left: Record<string, unknown>, right: object) =>
  JSON.stringify(Object.entries(left).sort()) ===
  JSON.stringify(Object.entries(right).sort());

// 只跟着地址栏规范化：数据变化（新建 / 删除）由各操作自己导航，
// 这里再跟着数据改地址会和那次导航抢先后。
watch(
  () => route.query,
  () => {
    const query = canonicalQuery();
    if (!sameQuery(query, route.query)) go(query);
  },
  { immediate: true },
);

watch(
  () => availablePageIds.value.join(','),
  () => {
    const available = new Set(availablePageIds.value);
    checkedPageIds.value = checkedPageIds.value.filter((id) =>
      available.has(id),
    );
  },
  { immediate: true },
);

// 节点被删 / 改名、换目录，或节点有了内容页之后，单独的勾不再有效
watch(
  () => emptyLeafKeys.value.join('\n'),
  () => {
    const empty = new Set(emptyLeafKeys.value);
    checkedLeafKeys.value = checkedLeafKeys.value.filter((key) =>
      empty.has(key),
    );
  },
  { immediate: true },
);

watch(
  () => auth.isAuthenticated,
  (isAuthenticated) => {
    if (!isAuthenticated) {
      clearChecks();
    }
  },
);

function showTab(tabId: number | string) {
  go({
    ...contextQuery(),
    ...nodeQuery(node.value),
    tab: String(tabId),
  });
}

// 换选单节点时留在当前一级 Tab
function selectEntity(payload: {
  category: string;
  configuration?: string | null;
  item: string;
}) {
  comparison.value = null;
  comparePickerOpen.value = false;
  go({
    ...contextQuery(),
    ...nodeQuery({
      category: payload.category,
      configuration: payload.configuration ?? null,
      item: payload.item || null,
    }),
    ...(activeTab.value ? { tab: String(activeTab.value.id) } : {}),
  });
}

function selectMachineCatalog(value: string) {
  if (
    (value !== 'mechanism' && value !== 'project') ||
    value === activeMachineType.value
  ) {
    return;
  }
  go(contextQuery(value, 'browse'));
}

function selectMachineView(value: string) {
  if (
    activeMachineType.value !== 'mechanism' ||
    (value !== 'browse' && value !== 'find') ||
    value === activeMachineView.value
  ) {
    return;
  }
  const query = { ...canonicalQuery(), ...contextQuery(undefined, value) };
  if (value === 'browse') delete query.view;
  go(query);
}

function openGlobalSearchResult(result: MachineStructureSearchResult) {
  for (const tab of store.machineTabs) {
    const page = tab.pages.find((item) => item.id === result.sectionId);
    if (!page) continue;
    const focusRow = String(result.rowIds[0] ?? '');
    go({
      ...nodeQuery(page.node),
      tab: String(tab.id),
      page: String(page.id),
      ...(focusRow ? { focusRow } : {}),
    });
    return;
  }
}

// ── 报告勾选 ────────────────────────────────────────────────────

function onTreeCheck({ key, checked }: { key: string; checked: boolean }) {
  if (!auth.isAuthenticated) return;
  const unit = treeSelection.value.units.get(key);
  if (!unit) return;
  const pages = new Set(checkedPageIds.value);
  const leaves = new Set(checkedLeafKeys.value);
  for (const id of unit.pageIds) {
    if (checked) pages.add(id);
    else pages.delete(id);
  }
  for (const leaf of unit.leaves) {
    if (treeSelection.value.leafPages.get(leaf)?.length) continue;
    if (checked) leaves.add(leaf);
    else leaves.delete(leaf);
  }
  checkedPageIds.value = [...pages];
  checkedLeafKeys.value = [...leaves];
}

function selectAll() {
  checkedPageIds.value = [...availablePageIds.value];
  checkedLeafKeys.value = [...emptyLeafKeys.value];
}

function clearChecks() {
  checkedPageIds.value = [];
  checkedLeafKeys.value = [];
}

// ── Tab 增删改 ──────────────────────────────────────────────────

// Tab 上不放「×」：删除 Tab 会连同所有节点在它下面的内容一起删掉，
// 只在「编辑 Tab」对话框里提供
function onTabEdit(_target: unknown, action: 'add' | 'remove') {
  if (action === 'add') tabDialog.value?.openAdd(tabs.value.length + 1);
}

async function onTabDelete(tabId: number) {
  if (await removeTab(tabId)) tabDialog.value?.close();
}

function onTabSaved(tabId: number) {
  // 新建的 Tab 还是空的，切过去好接着维护左侧目录项。
  if (tabs.value.some((tab) => tab.id === tabId && tab.pages.length === 0)) {
    showTab(tabId);
  }
}

async function removeTab(tabId: number): Promise<boolean> {
  const tab = tabs.value.find((item) => item.id === tabId);
  if (!tab) return false;
  const parts = tab.pages.length ? [`${tab.pages.length} 个机型目录项`] : [];
  const ok = await confirmDelete(
    '删除 Tab',
    parts.length
      ? `确认删除“${tab.name}”吗？它下面的${parts.join('和')}及内容会一起删除。`
      : `确认删除“${tab.name}”吗？`,
  );
  if (!ok) return false;
  return notifyResult(store.deleteMachineTab(tabId), 'Tab 已删除', {
    stale: '该 Tab 已被删除，请刷新后重试',
  });
}
</script>

<template>
  <section class="selection-page">
    <h1 class="visually-hidden">机型结构</h1>
    <div
      class="selection-split"
      :class="{
        'selection-split--machine': activeMachineView === 'browse',
      }"
    >
      <SourcePane
        storage-key="symtek:source-width:machine"
        :default-width="280"
      >
        <div class="machine-source-stack">
          <MachineCatalogSwitch
            :catalog="activeMachineType"
            :view="activeMachineView"
            @catalog="selectMachineCatalog"
            @view="selectMachineView"
          />
          <EntitySource
            v-if="activeMachineView === 'browse'"
            kind="machine"
            :machine-type="activeMachineType"
            :selected="node?.item ?? ''"
            :selected-key="node ? nodeTreeKey(node) : undefined"
            :locked-branches="lockedBranches"
            :check-state="treeChecks"
            :compare-enabled="canCompare"
            @select="selectEntity"
            @compare="startComparison"
            @choose-compare="openComparePicker"
            @check-node="onTreeCheck"
          />
          <MachineGlobalSearchFilters
            v-else
            v-model:board-characteristic-ids="searchBoardCharacteristicIds"
            v-model:query="searchQuery"
            :board-characteristic-options="boardCharacteristicOptions"
          />
        </div>
      </SourcePane>
      <MachineGlobalSearchResults
        v-if="activeMachineView === 'find'"
        :results="globalSearchResults"
        :filtered="globalSearchFiltered"
        :query="searchQuery"
        :documents="globalSearchDocuments"
        @select="openGlobalSearchResult"
      />
      <div v-else class="selection-panel machine-workspace">
        <!-- 最上方：选中节点的路径（树里的选中项可能不在视野内） -->
        <div class="machine-workspace-heading">
          <a-breadcrumb
            v-if="nodePath.length"
            class="machine-node-path"
            aria-label="当前选单节点"
          >
            <a-breadcrumb-item v-for="part in nodePath" :key="part">
              {{ part }}
            </a-breadcrumb-item>
          </a-breadcrumb>
          <a-space v-if="canCompare" :size="8" class="machine-compare-actions">
            <a-button
              :disabled="compareCandidates.length === 0"
              @click="openComparePicker"
            >
              <template #icon><Columns2 :size="14" /></template>
              选择对比项
            </a-button>
            <a-button v-if="comparison" @click="comparison = null">
              退出对比
            </a-button>
          </a-space>
        </div>
        <template v-if="comparison">
          <div class="machine-compare-summary" role="status">
            <span>{{ comparison.left.item }} / {{ comparison.right.item }}</span>
            <span>共 {{ comparisonTabs.length }} 个共同 Tab</span>
          </div>
          <a-tabs
            v-if="comparisonTabs.length"
            class="machine-section-tabs machine-compare-tabs"
            aria-label="机型对比共同机构"
            :active-key="comparisonTab?.key"
            @change="compareTabKey = String($event)"
          >
            <a-tab-pane
              v-for="tab in comparisonTabs"
              :key="tab.key"
              :tab="tab.name"
            />
          </a-tabs>
          <MachineComparisonPanel
            v-if="comparisonPanels"
            :key="`${comparisonPanels.left.section.id}:${comparisonPanels.right.section.id}`"
            :left="comparisonPanels.left"
            :right="comparisonPanels.right"
          />
          <a-empty v-else description="这两个条目暂无可对比的机构" />
        </template>
        <a-empty
          v-else-if="!node"
          description="暂无机型，请在左侧新建分类和机型"
        />
        <!-- 有子选单的节点提示用户从左侧选择下一级 -->
        <a-empty v-else-if="nodeIsBranch">
          <template #description>
            <div>「{{ nodeName }}」下有子选单</div>
            <div class="empty-hint">请在左侧选择下一级</div>
          </template>
        </a-empty>
        <template v-else>
          <a-tabs
            v-if="tabs.length"
            class="machine-section-tabs"
            type="editable-card"
            size="small"
            :active-key="activeTab ? String(activeTab.id) : ''"
            :hide-add="!writable"
            @change="showTab(String($event))"
            @edit="onTabEdit"
          >
            <a-tab-pane
              v-for="tab in tabs"
              :key="String(tab.id)"
              :closable="false"
            >
              <template #tab>
                <span class="machine-section-tabs__label">
                  {{ tab.name }}
                  <a-badge
                    :count="pageCount(tab.id)"
                    show-zero
                    :overflow-count="999"
                    :number-style="TAB_COUNT_STYLE"
                  />
                  <a-tooltip
                    v-if="writable && tab.id === activeTab?.id"
                    title="编辑 Tab"
                  >
                    <a-button
                      type="text"
                      size="small"
                      aria-label="编辑 Tab"
                      @click.stop="tabDialog?.openEdit(tab)"
                    >
                      <template #icon><Pencil :size="12" /></template>
                    </a-button>
                  </a-tooltip>
                </span>
              </template>
            </a-tab-pane>
            <template v-if="auth.isAuthenticated" #rightExtra>
              <MachineReportBar
                :page-ids="checkedPageIds"
                :selected-count="selectedCount"
                :available-count="treeSelection.leafPages.size"
                @select-all="selectAll"
                @clear="clearChecks"
              />
            </template>
          </a-tabs>

          <a-empty v-if="tabs.length === 0">
            <template #description>
              <div>还没有 Tab</div>
              <div class="empty-hint">
                {{
                  nodeIsMachine
                    ? '新建 Tab（如「输送机构」）后，就能在 Tab 下维护这个机型的选型表'
                    : '新建 Tab（如「输送机构」），再从左侧配置中选择机型目录项'
                }}
              </div>
            </template>
            <template v-if="writable" #default>
              <a-button type="primary" @click="tabDialog?.openAdd(1)">
                新建 Tab
              </a-button>
            </template>
          </a-empty>
          <!-- 机型目录项：一级 Tab 下直接是对应的选型表 -->
          <MachineSectionPanel
            v-else-if="activeTab && nodeIsMachine && placeholderSection"
            :key="`${activeTab.id}:${nodeName}`"
            :machine-name="MACHINE_TAB_PAGE_OWNER"
            :section="pageSection ?? placeholderSection"
            :save-first-row="pageSection ? undefined : saveDirectRow"
            :empty-hint="directEmptyHint"
            :focus-row-id="Number(route.query.focusRow) || undefined"
          />
          <a-empty
            v-else-if="activeTab"
            description="请从左侧配置中选择机型目录项"
          />
        </template>
      </div>
    </div>
    <a-modal
      v-model:open="comparePickerOpen"
      title="选择对比项"
      ok-text="开始对比"
      cancel-text="取消"
      :ok-button-props="{ disabled: !compareTargetKey }"
      @ok="confirmComparison"
    >
      <p>当前条目：{{ node ? nodePathLabel(node) : '' }}</p>
      <a-select
        v-model:value="compareTargetKey"
        aria-label="选择另一个机型条目"
        placeholder="搜索并选择另一个机型条目"
        class="full-width"
        :options="compareOptions"
        option-filter-prop="label"
        show-search
      />
    </a-modal>
    <MachineTabDialog
      ref="tabDialog"
      :catalog="activeMachineType"
      @saved="onTabSaved"
      @delete="onTabDelete"
    />
  </section>
</template>

<style scoped src="./MachinePage.css"></style>
