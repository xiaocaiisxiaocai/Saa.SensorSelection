<script setup lang="ts">
import { Pencil } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  entityTreeItemKey,
  filterMachineGroups,
  listEntityTreeItems,
  MACHINE_CONTENT_SECTION_ID,
  type MachineCatalogKind,
  type MachineSectionItem,
  type MachineTab,
} from '@/domain';
import EntitySource from '@/pages/selection/EntitySource.vue';
import {
  dragCarries,
  dropped,
  TAB_MACHINE_DRAG,
  TREE_ITEM_DRAG,
} from '@/pages/selection/entity/entity-drag';
import type { ItemPayload } from '@/pages/selection/entity/entity-tree-data';
import MachineCatalogSwitch from '@/pages/selection/machine/MachineCatalogSwitch.vue';
import MachineGlobalSearch from '@/pages/selection/machine/MachineGlobalSearch.vue';
import MachineMoveDialog from '@/pages/selection/machine/MachineMoveDialog.vue';
import MachineReportBar from '@/pages/selection/machine/MachineReportBar.vue';
import MachineSectionPanel from '@/pages/selection/machine/MachineSectionPanel.vue';
import MachineTabDialog from '@/pages/selection/machine/MachineTabDialog.vue';
import MachineTabMembers from '@/pages/selection/machine/MachineTabMembers.vue';
import {
  machineCatalogFromQuery,
  resolveMachineSelection,
  resolveTabSelection,
} from '@/pages/selection/machine/machine-selection';
import { buildMachineSearchDocuments } from '@/pages/selection/machine/machine-search-documents';
import type { MachineStructureSearchResult } from '@/pages/selection/machine/machine-structure-search';
import { TAB_COUNT_STYLE } from '@/pages/shared/tabs';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import { useAccess, useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import '../shared/selection-page.css';

/*
 * 机型结构页。顶部 Tab 是当前目录（结构 / 专案机型）共用的容器，
 * 机型从左侧目录拖进 Tab 后只在 Tab 下显示；点 Tab 下的机型看它的选型表和示意图。
 * 地址栏：?catalog=&view=&tab=&item=&focusRow=（item 还在目录树里时另带 category / configuration）。
 */
const route = useRoute();
const router = useRouter();
const store = useSelectionStore();
const auth = useAuthStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const tabDialog = ref<InstanceType<typeof MachineTabDialog>>();
const moveDialog = ref<InstanceType<typeof MachineMoveDialog>>();
const entitySource = ref<InstanceType<typeof EntitySource>>();
const checkedMachineKeys = ref<string[]>([]);
const tabDropTarget = ref<number | null>(null);

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
const availableMachineItems = computed(() =>
  listEntityTreeItems(catalogGroups.value),
);
const availableMachineKeys = computed(() =>
  availableMachineItems.value.map(entityTreeItemKey),
);
const catalogMachineNames = computed(
  () => new Set(availableMachineItems.value.map((item) => item.name)),
);
const selectedMachineItems = computed(() =>
  availableMachineItems.value.filter((item) =>
    checkedMachineKeys.value.includes(entityTreeItemKey(item)),
  ),
);
const selectedMachineNames = computed(() =>
  selectedMachineItems.value.map((item) => item.name),
);
const checkedNames = computed(() => new Set(selectedMachineNames.value));

const tabs = computed(() =>
  store.machineTabs.filter((tab) => tab.catalog === activeMachineType.value),
);
// 放进 Tab 的机型不在目录树里显示
const placedMachines = computed(() =>
  tabs.value.flatMap((tab) => tab.machines),
);
const current = computed(() =>
  resolveTabSelection(tabs.value, catalogMachineNames.value, route.query),
);
const activeTab = computed(() => current.value.tab);
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
/** 机型内容固定存在 MACHINE_CONTENT_SECTION_ID 下，格式跟着所在 Tab 的类型 */
const contentSection = computed<MachineSectionItem | null>(() =>
  activeTab.value
    ? {
        id: MACHINE_CONTENT_SECTION_ID,
        name: activeTab.value.name,
        sort: activeTab.value.sort,
        kind: activeTab.value.kind,
        scope: 'machine',
      }
    : null,
);
const extraItemActions = computed(() =>
  writable.value && tabs.value.length > 0
    ? [{ key: 'move-to-tab', label: '移到 Tab…' }]
    : [],
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
  // 遍历「Tab × 机型」时，每次取行都会重新归一化 Sensor/工序/字典；
  // batchRead 让这些归一化结果在本次构建里只算一次。
  store.batchRead(() => buildMachineSearchDocuments(store, groups.value)),
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
  const { tab, machine, treeMachine } = current.value;
  if (treeMachine && treeSelection.value) {
    query.category = treeSelection.value.category;
    if (treeSelection.value.configuration) {
      query.configuration = treeSelection.value.configuration;
    }
    query.item = treeMachine;
    return query;
  }
  if (tab) query.tab = String(tab.id);
  if (machine) query.item = machine;
  const focusRow = String(route.query.focusRow || '');
  if (machine && focusRow) query.focusRow = focusRow;
  return query;
}

function go(query: Record<string, string>) {
  void router.replace({ path: route.path, query });
}

const sameQuery = (left: Record<string, unknown>, right: object) =>
  JSON.stringify(Object.entries(left).sort()) ===
  JSON.stringify(Object.entries(right).sort());

// 只跟着地址栏规范化：数据变化（放进 / 移出 Tab、删 Tab）由各操作自己导航，
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

function showTab(tabId: number | string, machine?: string) {
  go({
    ...contextQuery(),
    tab: String(tabId),
    ...(machine ? { item: machine } : {}),
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
  const focusRow = String(result.rowIds[0] ?? '');
  go({
    tab: String(result.sectionId),
    item: result.machineName,
    ...(focusRow ? { focusRow } : {}),
  });
}

// ── 报告勾选 ────────────────────────────────────────────────────

function setChecked(name: string, checked: boolean) {
  const item = availableMachineItems.value.find(
    (candidate) => candidate.name === name,
  );
  if (!item || !auth.isAuthenticated) return;
  const key = entityTreeItemKey(item);
  const next = new Set(checkedMachineKeys.value);
  if (checked) next.add(key);
  else next.delete(key);
  checkedMachineKeys.value = [...next];
}

function onToggleCheck(payload: { item: string; checked: boolean }) {
  setChecked(payload.item, payload.checked);
}

// ── 机型放进 / 移出 Tab ─────────────────────────────────────────

function placeMachine(name: string, tabId: number, index?: number) {
  const result = store.placeMachineInTab(name, tabId, index);
  if (
    notifyResult(result, '', {
      'not-empty': '该机型已有内容，不能放进类型不同的 Tab',
      stale: '机型或 Tab 已被删除，请刷新后重试',
      validation: '只能放进同一目录（结构 / 专案机型）的 Tab',
    })
  ) {
    showTab(tabId, name);
  }
}

// 移回后留在原来的 Tab，改看它的下一个机型。Tab 要在改数据之前记下：
// 移走正在看的机型后，按地址栏算出的当前 Tab 会变成空。
function returnToCatalog(name: string) {
  const tabId = activeTab.value?.id;
  if (notifyResult(store.removeMachineFromTab(name), '已移回目录')) {
    if (tabId !== undefined) showTab(tabId);
  }
}

/** 从 Tab 拖回目录树：落在分组 / 配置上归入它，落在机型上插到它前后，落在空白处退回原处 */
function onTreeDrop(
  name: string,
  target: {
    node: ItemPayload & { kind: 'configuration' | 'group' | 'item' };
    position: 'after' | 'before' | 'inside';
  } | null,
) {
  if (!target) {
    returnToCatalog(name);
    return;
  }
  const { node, position } = target;
  const tabId = activeTab.value?.id;
  const configuration = node.kind === 'group' ? null : node.configuration;
  let sort: number | undefined;
  if (node.kind === 'item') {
    const siblings = (
      entitySource.value?.storedSiblings(node.category, configuration) ?? []
    ).filter((item) => item !== name);
    const index = siblings.indexOf(node.item);
    if (index >= 0) sort = index + (position === 'after' ? 2 : 1);
  }
  const result = store.moveMachineToCatalog(name, {
    category: node.category,
    configuration,
    sort,
  });
  if (
    notifyResult(result, '已移回目录', {
      duplicate: '目标分类里已有同名机型',
      stale: '机型已被删除，请刷新后重试',
    })
  ) {
    if (tabId !== undefined) showTab(tabId);
  }
}

function onTreeItemAction(key: string, payload: ItemPayload) {
  if (key === 'move-to-tab') moveDialog.value?.open(payload.item, null);
}

function treePayload(name: string): ItemPayload | null {
  const item = availableMachineItems.value.find(
    (candidate) => candidate.name === name,
  );
  return item
    ? {
        category: item.category,
        configuration: item.configuration ?? null,
        item: item.name,
      }
    : null;
}

function onMemberAction(
  key: 'delete' | 'move' | 'rename' | 'return',
  name: string,
) {
  if (key === 'move') {
    moveDialog.value?.open(name, activeTab.value?.id ?? null);
  } else if (key === 'return') {
    returnToCatalog(name);
  } else {
    const payload = treePayload(name);
    if (!payload) return;
    if (key === 'rename') entitySource.value?.editItem(payload);
    else void entitySource.value?.removeItem(payload);
  }
}

// ── Tab 增删改 ──────────────────────────────────────────────────

function onTabEdit(target: unknown, action: 'add' | 'remove') {
  if (action === 'add') tabDialog.value?.openAdd(tabs.value.length + 1);
  else void removeTab(Number(target));
}

function onTabSaved(tabId: number) {
  if (!tabs.value.some((tab) => tab.id === tabId && tab.machines.length)) {
    showTab(tabId);
  }
}

async function removeTab(tabId: number) {
  const tab = tabs.value.find((item) => item.id === tabId);
  if (!tab) return;
  const ok = await confirmDelete(
    '删除 Tab',
    tab.machines.length
      ? `确认删除“${tab.name}”吗？其中的 ${tab.machines.length} 个机型会回到左侧目录，内容都保留。`
      : `确认删除“${tab.name}”吗？`,
  );
  if (!ok) return;
  notifyResult(store.deleteMachineTab(tabId), 'Tab 已删除', {
    stale: '该 Tab 已被删除，请刷新后重试',
  });
}

// Tab 标题也是落点：把机型拖到某个 Tab 上就放进它（排在最后）
function onTabDragOver(event: DragEvent, tab: MachineTab) {
  if (
    !writable.value ||
    !(
      dragCarries(event, TREE_ITEM_DRAG) || dragCarries(event, TAB_MACHINE_DRAG)
    )
  ) {
    return;
  }
  event.preventDefault();
  tabDropTarget.value = tab.id;
}

function onTabDrop(event: DragEvent, tab: MachineTab) {
  tabDropTarget.value = null;
  const name =
    dropped(event, TAB_MACHINE_DRAG) || dropped(event, TREE_ITEM_DRAG);
  if (!writable.value || !name) return;
  event.preventDefault();
  placeMachine(name, tab.id);
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
          ref="entitySource"
          kind="machine"
          :machine-type="activeMachineType"
          :selected="current.treeMachine"
          :selected-key="selectedTreeKey"
          :checked-items="auth.isAuthenticated ? checkedMachineKeys : undefined"
          :hidden-items="placedMachines"
          :external-drag="writable"
          :extra-item-actions="extraItemActions"
          @select="selectEntity"
          @toggle-check="onToggleCheck"
          @item-action="onTreeItemAction"
          @external-drop="onTreeDrop"
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
          :active-key="
            activeTab && !current.treeMachine ? String(activeTab.id) : ''
          "
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
              <span
                class="machine-section-tabs__label"
                :class="{
                  'machine-section-tabs__label--drop': tabDropTarget === tab.id,
                }"
                @dragover="onTabDragOver($event, tab)"
                @dragleave="tabDropTarget = null"
                @drop="onTabDrop($event, tab)"
              >
                {{ tab.name }}
                <a-badge
                  :count="tab.machines.length"
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
              :machine-names="selectedMachineNames"
              :available-count="availableMachineItems.length"
              @select-all="checkedMachineKeys = [...availableMachineKeys]"
              @clear="checkedMachineKeys = []"
            />
          </template>
        </a-tabs>

        <!-- 还没有 Tab 时先引导新建 Tab，否则没有地方可以放机型 -->
        <a-empty v-if="tabs.length === 0">
          <template #description>
            <div>还没有 Tab</div>
            <div class="empty-hint">
              新建 Tab（如「输送机构」），再把左侧目录里的机型拖进去
            </div>
          </template>
          <template v-if="writable" #default>
            <a-button type="primary" @click="tabDialog?.openAdd(1)">
              新建 Tab
            </a-button>
          </template>
        </a-empty>
        <a-empty v-else-if="current.treeMachine">
          <template #description>
            <div>「{{ current.treeMachine }}」还没有放进 Tab</div>
            <div v-if="writable" class="empty-hint">
              把它从左侧目录拖到上方的 Tab 上
            </div>
          </template>
          <template v-if="writable" #default>
            <a-button
              type="primary"
              @click="moveDialog?.open(current.treeMachine, null)"
            >
              移到 Tab…
            </a-button>
          </template>
        </a-empty>
        <template v-else-if="activeTab">
          <MachineTabMembers
            :tab="activeTab"
            :active="current.machine"
            :writable="writable"
            :checkable="auth.isAuthenticated"
            :checked="checkedNames"
            @select="showTab(activeTab.id, $event)"
            @check="setChecked"
            @action="onMemberAction"
            @place="(name, index) => placeMachine(name, activeTab!.id, index)"
          />
          <MachineSectionPanel
            v-if="current.machine && contentSection"
            :machine-name="current.machine"
            :section="contentSection"
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
    <MachineMoveDialog
      ref="moveDialog"
      :tabs="tabs"
      @confirm="(name, tabId) => placeMachine(name, tabId)"
    />
  </section>
</template>

<style scoped src="./MachinePage.css"></style>
