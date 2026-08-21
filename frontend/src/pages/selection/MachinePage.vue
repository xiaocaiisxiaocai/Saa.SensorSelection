<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { api, ApiError } from '@/api';
import {
  GENERAL_STRUCTURE_CATEGORY,
  openMachineSchematicReport,
  type MachineReportSection,
  type MachineSectionItem,
} from '@/domain';
import EntitySource from '@/pages/selection/EntitySource.vue';
import MachineSectionPanel from '@/pages/selection/machine/MachineSectionPanel.vue';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { toast } from '@/ui/toast';
import {
  AButton,
  AEmptyState,
  AField,
  AFormRow,
  ASheet,
  ATabBar,
  type TabItem,
} from '@/ui';

import '../shared/selection-page.css';

const route = useRoute();
const router = useRouter();
const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const dialogOpen = ref(false);
const editId = ref<number>();
const form = reactive({ name: '' });
const activeSection = ref('');
const checkedNames = ref<string[]>([]);
const reportGenerating = ref(false);

const groups = computed(() => store.entityGroups('machine'));
const availableMachineNames = computed(() =>
  groups.value.flatMap((group) => group.items),
);
const selectedMachineNames = computed(() =>
  availableMachineNames.value.filter((name) => checkedNames.value.includes(name)),
);
const selection = computed(() => {
  const requested = String(route.query.item || '');
  for (const group of groups.value) {
    if (group.items.includes(requested)) {
      return { category: group.name, item: requested };
    }
  }
  return {
    category: groups.value[0]?.name || '',
    item: groups.value[0]?.items[0] || '',
  };
});
const isGeneralStructure = computed(
  () => selection.value.category === GENERAL_STRUCTURE_CATEGORY,
);
const generalItems = computed(
  () =>
    groups.value.find((group) => group.name === GENERAL_STRUCTURE_CATEGORY)
      ?.items ?? [],
);
const labelMap = computed(() => store.generalStructureLabelMap);
const displaySections = computed(() => {
  if (!selection.value.item) return [];
  const resolved = store.resolvedMachineSections(selection.value.item);
  if (!isGeneralStructure.value) {
    return resolved.map((section) => ({ ...section, displayName: section.name }));
  }
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
      return section ? { ...section, displayName: itemName } : null;
    })
    .filter((item): item is MachineSectionItem & { displayName: string } =>
      Boolean(item),
    );
  return [
    ...structureTabs,
    ...notes.map((item) => ({ ...item, displayName: item.name })),
  ];
});
const tabs = computed<TabItem[]>(() =>
  displaySections.value.map((section) => ({
    label: section.displayName,
    value: String(section.id),
    closable:
      writable.value &&
      !isGeneralStructure.value &&
      section.scope === 'machine',
    renamable:
      writable.value &&
      !isGeneralStructure.value &&
      section.scope === 'machine',
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
            images:
              section.kind === 'structure'
                ? store.machineSectionImages(section.id, machineName)
                : [],
          },
        ];
      }),
    }));
});

watch(
  () => availableMachineNames.value.join(','),
  () => {
    const available = new Set(availableMachineNames.value);
    checkedNames.value = checkedNames.value.filter((name) => available.has(name));
  },
  { immediate: true },
);

watch(
  () => [route.query.item, route.query.category, groups.value] as const,
  () => {
    const { category, item } = selection.value;
    if (!item) return;
    if (route.query.item === item && route.query.category === category) return;
    const query: Record<string, string> = { category, item };
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
    const mappedId = isGeneralStructure.value
      ? sectionIdForGeneralItem(selection.value.item)
      : '';
    const mappedSection = mappedId
      ? displaySections.value.find((item) => String(item.id) === mappedId)
      : undefined;
    let next = String((match || displaySections.value[0])?.id ?? '');
    if (mappedSection && isGeneralStructure.value) {
      const requestedIsPaired = Boolean(
        requested && generalItemForSectionId(requested),
      );
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
    void router.replace({
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

function selectEntity(payload: { category: string; item: string }) {
  const query: Record<string, string> = {
    category: payload.category,
    item: payload.item,
  };
  if (payload.category === GENERAL_STRUCTURE_CATEGORY) {
    const sectionId = sectionIdForGeneralItem(payload.item);
    if (sectionId) query.section = sectionId;
  }
  void router.replace({ path: route.path, query });
}

function onTabChange(sectionId: string) {
  activeSection.value = sectionId;
  const query: Record<string, string> = {
    category: selection.value.category,
    item: selection.value.item,
    section: sectionId,
  };
  if (selection.value.category === GENERAL_STRUCTURE_CATEGORY) {
    const itemName = generalItemForSectionId(sectionId);
    const group = groups.value.find(
      (entry) => entry.name === GENERAL_STRUCTURE_CATEGORY,
    );
    if (itemName && group?.items.includes(itemName)) {
      query.item = itemName;
    }
  }
  void router.replace({ path: route.path, query });
}

function onToggleCheck(payload: { item: string; checked: boolean }) {
  const next = new Set(checkedNames.value);
  if (payload.checked) next.add(payload.item);
  else next.delete(payload.item);
  checkedNames.value = [...next];
}

function ensureSelected() {
  if (selectedMachineNames.value.length > 0) return true;
  toast.warning('请先在左侧勾选至少一个机型');
  return false;
}

function previewReport() {
  if (!ensureSelected()) return;
  const opened = openMachineSchematicReport(
    selectedMachineNames.value,
    reportSections.value,
  );
  if (!opened) {
    toast.warning('报告窗口被浏览器拦截，请允许弹窗后重试');
  }
}

async function generateReport() {
  if (!ensureSelected()) return;
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
  form.name = '';
  dialogOpen.value = true;
}

function openRenameTab(value: string) {
  const section = displaySections.value.find((item) => String(item.id) === value);
  if (!section) return;
  editId.value = section.id;
  form.name = section.name;
  dialogOpen.value = true;
}

function saveTab() {
  const machineName = selection.value.item;
  if (!machineName) return;
  const result = store.saveExtraMachineSection(
    machineName,
    { name: form.name.trim() },
    editId.value,
  );
  if (
    toastResult(result, editId.value ? 'Tab 已更新' : 'Tab 已新增', {
      duplicate: '该 Tab 名称已存在',
      validation: '请填写 Tab 名称',
      stale: '该 Tab 已被删除，请刷新后重试',
    })
  ) {
    dialogOpen.value = false;
  }
}

async function closeTab(value: string) {
  const section = displaySections.value.find((item) => String(item.id) === value);
  if (!section) return;
  const ok = await confirmDelete(
    '删除 Tab',
    `确认删除“${section.name}”吗？请先清空该 Tab 下的全部数据。`,
  );
  if (!ok) return;
  toastResult(
    store.deleteExtraMachineSection(selection.value.item, section.id),
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
    <div class="selection-split">
      <EntitySource
        kind="machine"
        :selected="selection.item"
        :checked-items="checkedNames"
        @select="selectEntity"
        @toggle-check="onToggleCheck"
      />
      <div v-if="selection.item" class="selection-panel">
        <div class="machine-report">
          <span class="selection-toolbar__count">
            已选 {{ selectedMachineNames.length }} /
            {{ availableMachineNames.length }} 个机型
          </span>
          <AButton variant="borderless" @click="checkedNames = [...availableMachineNames]">
            全选机型
          </AButton>
          <AButton
            variant="borderless"
            :disabled="selectedMachineNames.length === 0"
            @click="checkedNames = []"
          >
            清空
          </AButton>
          <AButton
            variant="filled"
            :disabled="selectedMachineNames.length === 0"
            :loading="reportGenerating"
            @click="generateReport"
          >
            生成并下载报告
          </AButton>
          <AButton
            variant="borderless"
            :disabled="selectedMachineNames.length === 0"
            @click="previewReport"
          >
            预览 / 打印 PDF
          </AButton>
        </div>
        <ATabBar
          :model-value="activeSection"
          :tabs="tabs"
          :addable="writable && !isGeneralStructure"
          add-label="本机 Tab"
          @update:model-value="onTabChange"
          @add="openAddTab"
          @rename="openRenameTab"
          @close="closeTab"
        />
        <MachineSectionPanel
          v-if="activeSectionItem"
          :machine-name="selection.item"
          :section="activeSectionItem"
        />
      </div>
      <AEmptyState v-else title="暂无机型，请在左侧新建分类和机型" />
    </div>
    <ASheet
      v-model:open="dialogOpen"
      :title="editId ? '重命名本机 Tab' : '新增本机 Tab'"
      :width="420"
    >
      <AFormRow label="名称" required>
        <AField v-model="form.name" :maxlength="40" />
      </AFormRow>
      <template #footer>
        <AButton @click="dialogOpen = false">取消</AButton>
        <AButton variant="filled" @click="saveTab">保存</AButton>
      </template>
    </ASheet>
  </section>
</template>
