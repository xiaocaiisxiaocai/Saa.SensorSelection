<script lang="ts" setup>
import type { MachineSectionItem } from '../data.js';
import type { MachineReportSection } from '../schematic-report';

import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElTabPane,
  ElTabs,
  ElTooltip,
} from 'element-plus';
import { Pencil, Plus, Save, Trash2 } from 'lucide-vue-next';

import { api, ApiError } from '../api';
import { GENERAL_STRUCTURE_CATEGORY } from '../data.js';
import { openMachineSchematicReport } from '../schematic-report';
import { useSelectionStore } from '../store';
import EntitySidebar from './EntitySidebar.vue';
import MachineSectionTable from './MachineSectionTable.vue';

defineOptions({ name: 'MachineWorkspace' });

const route = useRoute();
const router = useRouter();
const store = useSelectionStore();

const dialogOpen = ref(false);
const editId = ref<number>();
const form = reactive({ name: '' });
const activeSection = ref('');
const selectedMachineNames = ref<Set<string>>(new Set());
const reportGenerating = ref(false);

const groups = computed(() => store.entityGroups('machine'));

const availableMachineNames = computed(() =>
  groups.value.flatMap((group) => group.items),
);

const selectedMachineNamesList = computed(() =>
  availableMachineNames.value.filter((name) =>
    selectedMachineNames.value.has(name),
  ),
);

const selectedMachineCount = computed(
  () => selectedMachineNamesList.value.length,
);

const selection = computed(() => {
  const requested = String(route.query.item || '');
  for (const group of groups.value) {
    const item = group.items.includes(requested) ? requested : undefined;
    if (item) return { category: group.name, item };
  }
  return {
    category: groups.value[0]?.name || '',
    item: groups.value[0]?.items[0] || '',
  };
});

const isGeneralStructure = computed(
  () => selection.value.category === GENERAL_STRUCTURE_CATEGORY,
);

const generalItems = computed(() => {
  const group = groups.value.find(
    (item) => item.name === GENERAL_STRUCTURE_CATEGORY,
  );
  return group?.items || [];
});

const labelMap = computed(() => store.generalStructureLabelMap);

const sections = computed(() => {
  if (!selection.value.item) return [];
  const resolved = store.resolvedMachineSections(selection.value.item);
  if (!isGeneralStructure.value) return resolved;

  const notes = resolved.filter((item) => item.kind === 'notes');
  const structureTabs = generalItems.value
    .map((itemName) => {
      const byLabel = Object.entries(labelMap.value).find(
        ([, label]) => label === itemName,
      );
      const section = byLabel
        ? resolved.find((item) => String(item.id) === byLabel[0])
        : resolved.find(
            (item) => item.kind === 'structure' && item.name === itemName,
          );
      if (!section) return null;
      return { ...section, displayName: itemName };
    })
    .filter(Boolean) as Array<{ displayName: string } & MachineSectionItem>;

  return [
    ...structureTabs,
    ...notes.map((item) => ({ ...item, displayName: item.name })),
  ];
});

/** 非通用结构：字典原名；通用结构：侧栏同名 */
const displaySections = computed(() =>
  isGeneralStructure.value
    ? (sections.value as Array<{ displayName: string } & MachineSectionItem>)
    : sections.value.map((section) => ({
        ...section,
        displayName: section.name,
      })),
);

watch(
  () => availableMachineNames.value.join(','),
  () => {
    const available = new Set(availableMachineNames.value);
    selectedMachineNames.value = new Set(
      [...selectedMachineNames.value].filter((name) => available.has(name)),
    );
  },
  { immediate: true },
);

const reportSections = computed<MachineReportSection[]>(() => {
  const machineNames = selectedMachineNamesList.value;
  const resolvedByMachine = new Map(
    machineNames.map((machineName) => [
      machineName,
      store.resolvedMachineSections(machineName),
    ]),
  );
  const sectionMap = new Map<number, MachineReportSection>();

  for (const sectionsForMachine of resolvedByMachine.values()) {
    for (const section of sectionsForMachine) {
      if (!sectionMap.has(section.id)) {
        sectionMap.set(section.id, {
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
          ?.find((candidate) => candidate.id === section.id);
        if (!machineSection) return [];
        return [
          {
            machineName,
            rows: store.machineSectionRows(section.id, machineName),
          },
        ];
      }),
    }));
});

function sectionIdForGeneralItem(itemName: string) {
  const byLabel = Object.entries(labelMap.value).find(
    ([, label]) => label === itemName,
  );
  if (byLabel) return byLabel[0];
  const section = store.globalMachineSections.find(
    (item) => item.kind === 'structure' && item.name === itemName,
  );
  return section ? String(section.id) : '';
}

function generalItemForSectionId(sectionId: string) {
  const id = Number(sectionId);
  if (labelMap.value[id]) return labelMap.value[id];
  const section = store.globalMachineSections.find((item) => item.id === id);
  return section?.kind === 'structure' ? section.name : '';
}

watch(
  () => [route.query.item, route.query.category, groups.value] as const,
  () => {
    const { category, item } = selection.value;
    if (!item) return;
    if (route.query.item === item && route.query.category === category) return;
    const query: Record<string, string> = { category, item };
    const section = String(route.query.section || '');
    if (section) query.section = section;
    router.replace({ path: route.path, query });
  },
  { immediate: true },
);

watch(
  () =>
    [
      selection.value.item,
      selection.value.category,
      route.query.section,
      sections.value.map((item) => item.id).join(','),
    ] as const,
  () => {
    if (!selection.value.item || sections.value.length === 0) {
      activeSection.value = '';
      return;
    }
    const requested = String(route.query.section || '');
    const match = sections.value.find((item) => String(item.id) === requested);
    const mappedId =
      selection.value.category === GENERAL_STRUCTURE_CATEGORY
        ? sectionIdForGeneralItem(selection.value.item)
        : '';
    const mappedSection = mappedId
      ? sections.value.find((item) => String(item.id) === mappedId)
      : undefined;

    let next = String((match || sections.value[0]!).id);
    if (
      mappedSection &&
      selection.value.category === GENERAL_STRUCTURE_CATEGORY
    ) {
      const requestedIsPaired = Boolean(
        requested && generalItemForSectionId(requested),
      );
      // 结构类 Tab 与侧栏机型对齐；注意事项保持用户选择
      next = String(
        !requested || requestedIsPaired
          ? mappedSection.id
          : (match || mappedSection).id,
      );
    }

    activeSection.value = next;
    if (
      route.query.item === selection.value.item &&
      route.query.category === selection.value.category &&
      route.query.section === next
    ) {
      return;
    }
    router.replace({
      path: route.path,
      query: {
        category: selection.value.category,
        item: selection.value.item,
        section: next,
      },
    });
  },
  { immediate: true },
);

function selectEntity(payload: { category: string; item: string }) {
  const query: Record<string, string> = {
    category: payload.category,
    item: payload.item,
  };
  // 仅通用结构：点侧栏机型 → 切到对应结构 Tab
  if (payload.category === GENERAL_STRUCTURE_CATEGORY) {
    const sectionId = sectionIdForGeneralItem(payload.item);
    if (sectionId) query.section = sectionId;
  }
  router.replace({ path: route.path, query });
}

function onTabChange(name: number | string) {
  const sectionId = String(name);
  activeSection.value = sectionId;
  const query: Record<string, string> = {
    category: selection.value.category,
    item: selection.value.item,
    section: sectionId,
  };

  // 仅通用结构：点 Tab → 同步选中同名侧栏机型
  if (selection.value.category === GENERAL_STRUCTURE_CATEGORY) {
    const itemName = generalItemForSectionId(sectionId);
    const group = groups.value.find(
      (entry) => entry.name === GENERAL_STRUCTURE_CATEGORY,
    );
    if (itemName && group?.items.includes(itemName)) {
      query.item = itemName;
    }
  }

  router.replace({ path: route.path, query });
}

function onMachineSelectionChange(payload: { checked: boolean; item: string }) {
  const next = new Set(selectedMachineNames.value);
  if (payload.checked) next.add(payload.item);
  else next.delete(payload.item);
  selectedMachineNames.value = next;
}

function selectAllMachines() {
  selectedMachineNames.value = new Set(availableMachineNames.value);
}

function clearSelectedMachines() {
  selectedMachineNames.value = new Set();
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function previewSchematicReport() {
  if (selectedMachineNamesList.value.length === 0) {
    ElMessage.warning('请先在左侧勾选至少一个机型');
    return;
  }
  const opened = openMachineSchematicReport(
    selectedMachineNamesList.value,
    reportSections.value,
  );
  if (!opened) {
    ElMessage.warning('报告窗口被浏览器拦截，请允许弹窗后重试');
  }
}

async function generateSchematicReport() {
  if (selectedMachineNamesList.value.length === 0) {
    ElMessage.warning('请先在左侧勾选至少一个机型');
    return;
  }

  reportGenerating.value = true;
  try {
    const blob = await api.downloadMachineSchematicReport({
      machineNames: selectedMachineNamesList.value,
      sections: reportSections.value,
    });
    downloadBlob(
      blob,
      `机型结构示意图报告-${new Date().toISOString().slice(0, 10)}.html`,
    );
    ElMessage.success('后端报告已生成并下载，可打开后打印为 PDF');
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : '报告生成失败，请稍后重试';
    ElMessage.error(message);
  } finally {
    reportGenerating.value = false;
  }
}

function failureMessage(reason: string) {
  if (reason === 'duplicate') return '该 Tab 名称已存在';
  if (reason === 'not-empty') return '请先清空该 Tab 下的全部数据后再删除';
  if (reason === 'storage') return '数据保存失败，本次修改未保存';
  if (reason === 'stale') return '该 Tab 已被删除，请刷新后重试';
  if (reason === 'validation') return '请填写 Tab 名称';
  return '操作失败，请重试';
}

function resetForm() {
  editId.value = undefined;
  form.name = '';
}

function openAddTab() {
  resetForm();
  dialogOpen.value = true;
}

function openRenameTab(section: MachineSectionItem, event: Event) {
  event.stopPropagation();
  editId.value = section.id;
  form.name = section.name;
  dialogOpen.value = true;
}

function saveTab() {
  const machineName = selection.value.item;
  if (!machineName) return;

  const payload: Partial<MachineSectionItem> = {
    name: form.name.trim(),
  };
  if (!editId.value) {
    payload.sort =
      Math.max(0, ...sections.value.map((item) => item.sort), 0) + 1;
  }

  const result = store.saveExtraMachineSection(
    machineName,
    payload,
    editId.value,
  );
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }

  dialogOpen.value = false;
  ElMessage.success(editId.value ? '本机 Tab 已更新' : '本机 Tab 已新增');

  if (!editId.value && result.item) {
    const section = String(result.item.id);
    activeSection.value = section;
    router.replace({
      path: route.path,
      query: {
        category: selection.value.category,
        item: selection.value.item,
        section,
      },
    });
  }
}

async function deleteTab(section: MachineSectionItem, event: Event) {
  event.stopPropagation();
  try {
    await ElMessageBox.confirm(
      `确认删除「${section.name}」吗？`,
      '删除本机 Tab',
      {
        cancelButtonText: '取消',
        confirmButtonText: '删除',
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  const result = store.deleteExtraMachineSection(
    selection.value.item,
    section.id,
  );
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }
  ElMessage.success('本机 Tab 已删除');
}
</script>

<template>
  <main class="selection-page" style="--module-accent: #b45309">
    <div class="entity-workspace">
      <EntitySidebar
        :groups="groups"
        :selectable="true"
        :selected="selection.item"
        :selected-items="selectedMachineNamesList"
        kind="machine"
        label="机型"
        @select="selectEntity"
        @toggle-select="onMachineSelectionChange"
      />

      <section
        v-if="selection.item"
        :aria-label="selection.item"
        class="entity-detail"
      >
        <div aria-label="示意图报告" class="machine-report-toolbar">
          <span class="machine-report-toolbar__count">
            已选 {{ selectedMachineCount }} /
            {{ availableMachineNames.length }} 个机型
          </span>
          <ElButton text @click="selectAllMachines">全选机型</ElButton>
          <ElButton
            :disabled="selectedMachineCount === 0"
            text
            @click="clearSelectedMachines"
          >
            清空
          </ElButton>
          <ElButton
            :disabled="selectedMachineCount === 0"
            :loading="reportGenerating"
            type="primary"
            @click="generateSchematicReport"
          >
            生成并下载报告
          </ElButton>
          <ElButton
            :disabled="selectedMachineCount === 0"
            text
            @click="previewSchematicReport"
          >
            预览 / 打印 PDF
          </ElButton>
        </div>
        <div
          :class="{ 'machine-tabs-wrap--no-add': isGeneralStructure }"
          class="machine-tabs-wrap"
        >
          <ElTabs
            :model-value="activeSection"
            class="detail-tabs machine-detail-tabs"
            @tab-change="onTabChange"
          >
            <ElTabPane
              v-for="sec in displaySections"
              :key="sec.id"
              :name="String(sec.id)"
              lazy
            >
              <template #label>
                <span class="machine-tab-label">
                  <span>{{ sec.displayName }}</span>
                  <span
                    v-if="sec.scope === 'machine' && !isGeneralStructure"
                    class="machine-tab-actions"
                  >
                    <ElTooltip content="改名" placement="top">
                      <button
                        aria-label="改名本机 Tab"
                        class="icon-button"
                        type="button"
                        @click="openRenameTab(sec, $event)"
                        @mousedown.stop
                      >
                        <Pencil :size="13" aria-hidden="true" />
                      </button>
                    </ElTooltip>
                    <ElTooltip content="删除" placement="top">
                      <button
                        aria-label="删除本机 Tab"
                        class="icon-button"
                        type="button"
                        v-can-write="'selection:write'"
                        @click="deleteTab(sec, $event)"
                        @mousedown.stop
                      >
                        <Trash2 :size="13" aria-hidden="true" />
                      </button>
                    </ElTooltip>
                  </span>
                </span>
              </template>
              <MachineSectionTable
                :machine-name="selection.item"
                :section="sec"
              />
            </ElTabPane>
          </ElTabs>
          <ElButton
            v-if="!isGeneralStructure"
            class="machine-add-tab"
            v-can-write="'selection:write'"
            @click="openAddTab"
          >
            <Plus :size="15" aria-hidden="true" />
            本机 Tab
          </ElButton>
        </div>
      </section>
      <section v-else class="entity-detail">
        <div class="entity-empty">暂无机型，请在左侧新建分类和条目</div>
      </section>
    </div>

    <ElDialog
      v-model="dialogOpen"
      :title="editId ? '改名本机 Tab' : '新增本机 Tab'"
      width="420px"
      @closed="resetForm"
    >
      <ElForm label-position="top" @submit.prevent="saveTab">
        <ElFormItem label="名称" required>
          <ElInput v-model="form.name" maxlength="40" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogOpen = false">取消</ElButton>
        <ElButton
          type="primary"
          v-can-write="'selection:write'"
          @click="saveTab"
        >
          <Save :size="15" aria-hidden="true" />
          保存
        </ElButton>
      </template>
    </ElDialog>
  </main>
</template>

<style scoped>
.machine-tabs-wrap {
  position: relative;
}

.machine-report-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  min-height: 32px;
}

.machine-report-toolbar__count {
  margin-right: auto;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.machine-detail-tabs :deep(.el-tabs__header) {
  padding-right: 118px;
}

.machine-tabs-wrap--no-add .machine-detail-tabs:deep(.el-tabs__header) {
  padding-right: 16px;
}

.machine-add-tab {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
}

.machine-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.machine-tab-actions {
  display: inline-flex;
  align-items: center;
  opacity: 0.35;
  transition: opacity 120ms ease;
}

.machine-tab-label:hover .machine-tab-actions,
.machine-tab-actions:focus-within {
  opacity: 1;
}

.machine-tab-actions .icon-button {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
}

@media (max-width: 760px) {
  .machine-report-toolbar {
    flex-wrap: wrap;
  }

  .machine-report-toolbar__count {
    width: 100%;
    margin-right: 0;
  }
}
</style>
