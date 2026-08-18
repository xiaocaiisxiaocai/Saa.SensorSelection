<script lang="ts" setup>
import type { MachineSectionItem } from '../data.js';

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

import { GENERAL_STRUCTURE_CATEGORY } from '../data.js';
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

const groups = computed(() => store.entityGroups('machine'));

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
        :selected="selection.item"
        kind="machine"
        label="机型"
        @select="selectEntity"
      />

      <section
        v-if="selection.item"
        :aria-label="selection.item"
        class="entity-detail"
      >
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
</style>
