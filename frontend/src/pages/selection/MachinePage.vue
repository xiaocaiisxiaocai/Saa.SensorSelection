<script setup lang="ts">
import { Pencil } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  filterMachineGroups,
  MACHINE_TAB_PAGE_OWNER,
  type MachineCatalogKind,
  type MachineNodeRef,
  type MachineSectionItem,
  type MachineTabPage,
} from '@/domain';
import EntitySource from '@/pages/selection/EntitySource.vue';
import SourcePane from '@/pages/selection/SourcePane.vue';
import MachineCatalogSwitch from '@/pages/selection/machine/MachineCatalogSwitch.vue';
import MachineGlobalSearchFilters from '@/pages/selection/machine/MachineGlobalSearchFilters.vue';
import MachineGlobalSearchResults from '@/pages/selection/machine/MachineGlobalSearchResults.vue';
import MachineReportBar from '@/pages/selection/machine/MachineReportBar.vue';
import MachineSectionPanel from '@/pages/selection/machine/MachineSectionPanel.vue';
import MachineTabDialog from '@/pages/selection/machine/MachineTabDialog.vue';
import MachineTabPageDialog from '@/pages/selection/machine/MachineTabPageDialog.vue';
import MachineTabPages from '@/pages/selection/machine/MachineTabPages.vue';
import {
  lockedBranchKeys,
  nodeFromQuery,
  nodeHasChildren,
  nodeLabel,
  nodeTreeKey,
  machineTreeSelection,
  pagesOf,
  selectedLeafCount,
  treeCheckState,
} from '@/pages/selection/machine/machine-nodes';
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
 * 当前目录（结构 / 专案机型）共用的一级 Tab，以及这个节点在该 Tab 下的二级 Tab。
 * 条件查找时，左侧换成筛选表单，右侧列出结构（不设条件就是全部，改条件立即过滤）。
 * 选单节点的下一层只能二选一：有子选单就没有二级 Tab，有二级 Tab 就不能再加子选单。
 * 地址栏：?catalog=&view=&category=&configuration=&item=&tab=&page=&focusRow=。
 */
const route = useRoute();
const router = useRouter();
const store = useSelectionStore();
const auth = useAuthStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const tabDialog = ref<InstanceType<typeof MachineTabDialog>>();
const pageDialog = ref<InstanceType<typeof MachineTabPageDialog>>();
const checkedPageIds = ref<number[]>([]);
/** 勾选的、还没有二级 Tab 的末级节点 key（有二级 Tab 的节点勾的是它的二级 Tab） */
const checkedLeafKeys = ref<string[]>([]);

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

/** 选中的选单节点：地址栏指定的，没有就退回第一个机型；目录为空时为 null */
const node = computed<MachineNodeRef | null>(() => {
  const requested = nodeFromQuery(catalogGroups.value, route.query);
  if (requested) return requested;
  const fallback = resolveMachineSelection(catalogGroups.value, {});
  return fallback.item
    ? {
        category: fallback.category,
        configuration: fallback.configuration || null,
        item: fallback.item,
      }
    : null;
});
const nodeIsBranch = computed(() =>
  node.value
    ? nodeHasChildren(catalogGroups.value, node.value) === true
    : false,
);
const nodeName = computed(() => (node.value ? nodeLabel(node.value) : ''));

const tabs = computed(() =>
  store.machineTabs.filter((tab) => tab.catalog === activeMachineType.value),
);
const lockedBranches = computed(() => lockedBranchKeys(tabs.value));
const availablePageIds = computed(() =>
  tabs.value.flatMap((tab) => tab.pages.map((page) => page.id)),
);
const checkedPages = computed(() => new Set(checkedPageIds.value));
// 目录树勾选：每个节点都能勾。勾一个节点 = 勾它下面的全部末级节点（机型）：
// 有二级 Tab 的勾它的二级 Tab，没有的单独记一个勾（报告里是空的）；部分勾选时显示半选
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
const nodePages = computed(() =>
  activeTab.value && node.value ? pagesOf(activeTab.value, node.value) : [],
);
/**
 * 机型（最末一层）没有二级 Tab：一级 Tab 下直接是它的直属表格。
 * 分类 / 配置只有在没有子选单时才能建二级 Tab（nodeIsBranch 时整块不显示）。
 */
const nodeIsMachine = computed(() => Boolean(node.value?.item));
/** 一级 Tab 的徽标：机型显示直属表格的记录数，其它节点显示二级 Tab 数 */
const pageCount = (tabId: number) => {
  const tab = tabs.value.find((item) => item.id === tabId);
  if (!tab || !node.value) return 0;
  const pages = pagesOf(tab, node.value);
  if (!nodeIsMachine.value) return pages.length;
  return pages[0]
    ? store.machineSectionRows(pages[0].id, MACHINE_TAB_PAGE_OWNER).length
    : 0;
};
/** 二级 Tab 的内容按页 id 存放，格式跟着所在 Tab 的类型 */
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

function ensureDirectSection(): number | null {
  if (!activeTab.value || !node.value) return null;
  const result = store.ensureMachineDirectPage(activeTab.value.id, node.value);
  if (!result.ok) {
    notifyResult(result, '');
    return null;
  }
  return result.item.id;
}

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
  // 遍历「Tab × 二级 Tab」时，每次取行都会重新归一化 Sensor/工序/字典；
  // batchRead 让这些归一化结果在本次构建里只算一次。
  store.batchRead(() => buildMachineSearchDocuments(store)),
);
const searchMachineModelIds = ref<Array<string | number>>([]);
const searchProcessStepIds = ref<Array<string | number>>([]);
const searchBoardCharacteristicIds = ref<Array<string | number>>([]);
const searchQuery = ref('');
/** 不设条件时就是全部结构；任一条件变化都会重算并让结果列表回到第一页 */
const globalSearchResults = computed(() =>
  searchMachineStructures(globalSearchDocuments.value, {
    boardCharacteristicIds: searchBoardCharacteristicIds.value.map(Number),
    machineModelIds: searchMachineModelIds.value.map(Number),
    processStepIds: searchProcessStepIds.value.map(Number),
    query: searchQuery.value,
  }),
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

// 节点被删 / 改名、换目录，或节点有了二级 Tab 之后，单独的勾不再有效
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
    if (!isAuthenticated) clearChecks();
  },
);

function showTab(tabId: number | string, pageId?: number) {
  go({
    ...contextQuery(),
    ...nodeQuery(node.value),
    tab: String(tabId),
    ...(pageId === undefined ? {} : { page: String(pageId) }),
  });
}

// 换选单节点时留在当前一级 Tab
function selectEntity(payload: {
  category: string;
  configuration?: string | null;
  item: string;
}) {
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

function setChecked(pageId: number, checked: boolean) {
  if (!auth.isAuthenticated) return;
  const next = new Set(checkedPageIds.value);
  if (checked) next.add(pageId);
  else next.delete(pageId);
  checkedPageIds.value = [...next];
}

// ── 二级 Tab ────────────────────────────────────────────────────

function onPageSaved(pageId: number) {
  if (activeTab.value) showTab(activeTab.value.id, pageId);
}

async function onPageAction(
  key: 'delete' | 'left' | 'rename' | 'right',
  page: MachineTabPage,
) {
  const tab = activeTab.value;
  if (!tab) return;
  if (key === 'rename') {
    pageDialog.value?.openEdit(tab, page);
    return;
  }
  if (key === 'left' || key === 'right') {
    notifyResult(
      store.moveMachineTabPage(tab.id, page.id, key === 'left' ? -1 : 1),
      '',
      { stale: '该二级 Tab 已被删除，请刷新后重试' },
    );
    return;
  }
  const ok = await confirmDelete(
    '删除二级 Tab',
    `确认删除“${page.name}”吗？它的选型记录和示意图会一起删除。`,
  );
  if (!ok) return;
  const deleted = notifyResult(
    store.deleteMachineTabPage(tab.id, page.id),
    '已删除',
    { stale: '该二级 Tab 已被删除，请刷新后重试' },
  );
  if (deleted && activePage.value?.id === page.id) showTab(tab.id);
}

// ── Tab 增删改 ──────────────────────────────────────────────────

function onTabEdit(target: unknown, action: 'add' | 'remove') {
  if (action === 'add') tabDialog.value?.openAdd(tabs.value.length + 1);
  else void removeTab(Number(target));
}

function onTabSaved(tabId: number) {
  // 新建的 Tab 还是空的，切过去好接着新建二级 Tab；编辑已有 Tab 不跳
  if (tabs.value.some((tab) => tab.id === tabId && tab.pages.length === 0)) {
    showTab(tabId);
  }
}

async function removeTab(tabId: number) {
  const tab = tabs.value.find((item) => item.id === tabId);
  if (!tab) return;
  // 机型的直属表格和分类 / 配置的二级 Tab 分开说
  const tables = tab.pages.filter((page) => page.direct).length;
  const subTabs = tab.pages.length - tables;
  const parts = [
    subTabs ? `${subTabs} 个二级 Tab` : '',
    tables ? `${tables} 个机型的选型表` : '',
  ].filter(Boolean);
  const ok = await confirmDelete(
    '删除 Tab',
    parts.length
      ? `确认删除“${tab.name}”吗？它下面的${parts.join('和')}及内容会一起删除。`
      : `确认删除“${tab.name}”吗？`,
  );
  if (!ok) return;
  notifyResult(store.deleteMachineTab(tabId), 'Tab 已删除', {
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
            @select="selectEntity"
            @check-node="onTreeCheck"
          />
          <MachineGlobalSearchFilters
            v-else
            v-model:machine-model-ids="searchMachineModelIds"
            v-model:process-step-ids="searchProcessStepIds"
            v-model:board-characteristic-ids="searchBoardCharacteristicIds"
            v-model:query="searchQuery"
            :machine-model-options="machineModelOptions"
            :process-step-options="processStepOptions"
            :board-characteristic-options="boardCharacteristicOptions"
          />
        </div>
      </SourcePane>
      <MachineGlobalSearchResults
        v-if="activeMachineView === 'find'"
        :results="globalSearchResults"
        @select="openGlobalSearchResult"
      />
      <div v-else class="selection-panel machine-workspace">
        <a-empty v-if="!node" description="暂无机型，请在左侧新建分类和机型" />
        <!-- 有子选单的节点没有二级 Tab -->
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
              :closable="writable"
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
                    : '新建 Tab（如「输送机构」），再在 Tab 下新建二级 Tab'
                }}
              </div>
            </template>
            <template v-if="writable" #default>
              <a-button type="primary" @click="tabDialog?.openAdd(1)">
                新建 Tab
              </a-button>
            </template>
          </a-empty>
          <!-- 机型：一级 Tab 下直接是表格，没有二级 Tab -->
          <MachineSectionPanel
            v-else-if="activeTab && nodeIsMachine && placeholderSection"
            :key="`${activeTab.id}:${nodeName}`"
            :machine-name="MACHINE_TAB_PAGE_OWNER"
            :section="pageSection ?? placeholderSection"
            :ensure-section="pageSection ? undefined : ensureDirectSection"
            :focus-row-id="Number(route.query.focusRow) || undefined"
          />
          <template v-else-if="activeTab">
            <MachineTabPages
              :tab="activeTab"
              :pages="nodePages"
              :node-name="nodeName"
              :active-page-id="activePage?.id ?? null"
              :writable="writable"
              :checkable="auth.isAuthenticated"
              :checked="checkedPages"
              @select="showTab(activeTab.id, $event)"
              @check="setChecked"
              @add="pageDialog?.openAdd(activeTab, node)"
              @action="onPageAction"
            />
            <MachineSectionPanel
              v-if="pageSection"
              :machine-name="MACHINE_TAB_PAGE_OWNER"
              :section="pageSection"
              :focus-row-id="Number(route.query.focusRow) || undefined"
            />
          </template>
        </template>
      </div>
    </div>
    <MachineTabDialog
      ref="tabDialog"
      :catalog="activeMachineType"
      @saved="onTabSaved"
    />
    <MachineTabPageDialog ref="pageDialog" @saved="onPageSaved" />
  </section>
</template>

<style scoped src="./MachinePage.css"></style>
