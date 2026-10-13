<script setup lang="ts">
import { Pencil } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  entityTreeItemKey,
  filterMachineGroups,
  listEntityTreeItems,
  MACHINE_CONTENT_SECTION_ID,
  MACHINE_TAB_PAGE_OWNER,
  type MachineCatalogKind,
  type MachineSectionItem,
  type MachineTabPage,
} from '@/domain';
import EntitySource from '@/pages/selection/EntitySource.vue';
import MachineCatalogSwitch from '@/pages/selection/machine/MachineCatalogSwitch.vue';
import MachineGlobalSearch from '@/pages/selection/machine/MachineGlobalSearch.vue';
import MachineReportBar from '@/pages/selection/machine/MachineReportBar.vue';
import MachineSectionPanel from '@/pages/selection/machine/MachineSectionPanel.vue';
import MachineTabDialog from '@/pages/selection/machine/MachineTabDialog.vue';
import MachineTabPageDialog from '@/pages/selection/machine/MachineTabPageDialog.vue';
import MachineTabPages from '@/pages/selection/machine/MachineTabPages.vue';
import {
  machineCatalogFromQuery,
  resolveMachineSelection,
  resolveTabSelection,
  tabOfPage,
} from '@/pages/selection/machine/machine-selection';
import { buildMachineSearchDocuments } from '@/pages/selection/machine/machine-search-documents';
import type { MachineStructureSearchResult } from '@/pages/selection/machine/machine-structure-search';
import { TAB_COUNT_STYLE } from '@/pages/shared/tabs';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import { useAccess, useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import '../shared/selection-page.css';

/*
 * 机型结构页。顶部 Tab 是当前目录（结构 / 专案机型）共用的容器，Tab 下直接新建
 * 二级 Tab，每个二级 Tab 有自己的选型表和示意图。左侧目录和 Tab 互不相干：
 * 点目录里的机型看它自己的内容。
 * 地址栏：?catalog=&view=&tab=&page=&focusRow=；看目录机型时是 ?category=&configuration=&item=。
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
const catalogMachineNames = computed(
  () =>
    new Set(listEntityTreeItems(catalogGroups.value).map((item) => item.name)),
);

const tabs = computed(() =>
  store.machineTabs.filter((tab) => tab.catalog === activeMachineType.value),
);
const availablePageIds = computed(() =>
  tabs.value.flatMap((tab) => tab.pages.map((page) => page.id)),
);
const checkedPages = computed(() => new Set(checkedPageIds.value));
const current = computed(() =>
  resolveTabSelection(tabs.value, catalogMachineNames.value, route.query),
);
const activeTab = computed(() => current.value.tab);
const activePage = computed(() => current.value.page);
const treeSelection = computed(() =>
  current.value.treeMachine
    ? resolveMachineSelection(catalogGroups.value, route.query)
    : null,
);
const selectedTreeKey = computed(() =>
  treeSelection.value
    ? entityTreeItemKey({
        category: treeSelection.value.category,
        configuration: treeSelection.value.configuration || null,
        name: treeSelection.value.item,
      })
    : undefined,
);
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
/** 目录机型自己的内容：结构选型表 */
const TREE_SECTION: MachineSectionItem = {
  id: MACHINE_CONTENT_SECTION_ID,
  name: '机型内容',
  sort: 0,
  kind: 'structure',
  scope: 'machine',
};

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

function canonicalQuery(): Record<string, string> {
  const query = contextQuery();
  const { tab, page, treeMachine } = current.value;
  if (treeMachine && treeSelection.value) {
    query.category = treeSelection.value.category;
    if (treeSelection.value.configuration) {
      query.configuration = treeSelection.value.configuration;
    }
    query.item = treeMachine;
  } else {
    if (tab) query.tab = String(tab.id);
    if (page) query.page = String(page.id);
  }
  const focusRow = String(route.query.focusRow || '');
  if ((page || treeMachine) && focusRow) query.focusRow = focusRow;
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

watch(
  () => auth.isAuthenticated,
  (isAuthenticated) => {
    if (!isAuthenticated) checkedPageIds.value = [];
  },
);

function showTab(tabId: number | string, pageId?: number) {
  go({
    ...contextQuery(),
    tab: String(tabId),
    ...(pageId === undefined ? {} : { page: String(pageId) }),
  });
}

function selectEntity(payload: {
  category: string;
  configuration?: string | null;
  item: string;
}) {
  go({
    ...contextQuery(),
    category: payload.category,
    ...(payload.configuration ? { configuration: payload.configuration } : {}),
    item: payload.item,
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
  const tab = tabOfPage(store.machineTabs, result.sectionId);
  if (!tab) return;
  const focusRow = String(result.rowIds[0] ?? '');
  go({
    tab: String(tab.id),
    page: String(result.sectionId),
    ...(focusRow ? { focusRow } : {}),
  });
}

// ── 报告勾选 ────────────────────────────────────────────────────

function setChecked(pageId: number, checked: boolean) {
  if (!auth.isAuthenticated) return;
  const next = new Set(checkedPageIds.value);
  if (checked) next.add(pageId);
  else next.delete(pageId);
  checkedPageIds.value = [...next];
}

// ── 二级 Tab ────────────────────────────────────────────────────

function onPageSaved(pageId: number) {
  const tab = tabOfPage(store.machineTabs, pageId);
  if (tab) showTab(tab.id, pageId);
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
  const ok = await confirmDelete(
    '删除 Tab',
    tab.pages.length
      ? `确认删除“${tab.name}”吗？其下 ${tab.pages.length} 个二级 Tab 和它们的内容会一起删除。`
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
        'selection-split--global-search': activeMachineView === 'find',
      }"
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
          :selected="current.treeMachine"
          :selected-key="selectedTreeKey"
          @select="selectEntity"
        />
      </div>
      <MachineGlobalSearch
        v-if="activeMachineView === 'find'"
        class="machine-global-search"
        :documents="globalSearchDocuments"
        :machine-model-options="machineModelOptions"
        :process-step-options="processStepOptions"
        :board-characteristic-options="boardCharacteristicOptions"
        @select="openGlobalSearchResult"
      />
      <div v-else class="selection-panel machine-workspace">
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
                  :count="tab.pages.length"
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
              :available-count="availablePageIds.length"
              @select-all="checkedPageIds = [...availablePageIds]"
              @clear="checkedPageIds = []"
            />
          </template>
        </a-tabs>

        <!-- 看目录里的机型：它自己的内容，和 Tab 无关 -->
        <template v-if="current.treeMachine">
          <div class="machine-tree-content__title">
            {{ current.treeMachine }}
          </div>
          <MachineSectionPanel
            :machine-name="current.treeMachine"
            :section="TREE_SECTION"
            :focus-row-id="Number(route.query.focusRow) || undefined"
          />
        </template>
        <a-empty v-else-if="tabs.length === 0">
          <template #description>
            <div>还没有 Tab</div>
            <div class="empty-hint">
              新建 Tab（如「输送机构」），再在 Tab 下新建二级 Tab
            </div>
          </template>
          <template v-if="writable" #default>
            <a-button type="primary" @click="tabDialog?.openAdd(1)">
              新建 Tab
            </a-button>
          </template>
        </a-empty>
        <template v-else-if="activeTab">
          <MachineTabPages
            :tab="activeTab"
            :active-page-id="activePage?.id ?? null"
            :writable="writable"
            :checkable="auth.isAuthenticated"
            :checked="checkedPages"
            @select="showTab(activeTab.id, $event)"
            @check="setChecked"
            @add="pageDialog?.openAdd(activeTab)"
            @action="onPageAction"
          />
          <MachineSectionPanel
            v-if="pageSection"
            :machine-name="MACHINE_TAB_PAGE_OWNER"
            :section="pageSection"
            :focus-row-id="Number(route.query.focusRow) || undefined"
          />
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
