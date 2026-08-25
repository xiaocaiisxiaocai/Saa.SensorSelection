<script setup lang="ts">
import { Pencil, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import type { ProcessStepItem } from '@/domain';
import ProcessIntroPanel from '@/pages/selection/process/ProcessIntroPanel.vue';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useSyncedQuery } from '@/pages/shared/use-synced-query';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import {
  AButton,
  AField,
  AFormGrid,
  AFormRow,
  AIconButton,
  APagination,
  ASearchField,
  ASegmentedControl,
  ASelect,
  ASheet,
  ATable,
  ATextArea,
  type SegmentOption,
  type SelectOption,
  type TableColumn,
} from '@/ui';

import '../shared/selection-page.css';

const route = useRoute();
const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const tabs: SegmentOption[] = [
  { label: '制程介绍', value: 'intro' },
  { label: '工艺制程', value: 'steps' },
];

const activeTab = ref(
  String(route.query.tab || '') === 'steps' ? 'steps' : 'intro',
);
const query = ref(String(route.query.q || ''));
const layerFilter = ref<string | null>(null);
const dialogOpen = ref(false);
const editId = ref<number>();
const page = ref(1);
const pageSize = ref(20);
const form = reactive({
  feature: '',
  layer: '',
  name: '',
  note: '',
  role: '',
});

const layerNames = computed(() => store.dictionaryNames('process-layer'));
const layerOptions = computed<SelectOption[]>(() =>
  layerNames.value.map((name) => ({ label: name, value: name })),
);
const defaultLayer = computed(() => layerNames.value[0] || '内层');

const filteredItems = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  return store.processSteps.filter(
    (item) =>
      (!layerFilter.value || item.layer === layerFilter.value) &&
      (!value ||
        [item.layer, item.name, item.role, item.feature, item.note]
          .join(' ')
          .toLocaleLowerCase('zh-CN')
          .includes(value)),
  );
});

const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredItems.value.slice(start, start + pageSize.value);
});

const stepColumns = computed<TableColumn[]>(() => {
  const cols: TableColumn[] = [
    { key: 'layer', label: '制程', width: 64 },
    { key: 'name', label: '工艺制程', minWidth: 140 },
    { key: 'role', label: '作用', minWidth: 160, ellipsis: true },
    { key: 'feature', label: '制程特性', minWidth: 160, ellipsis: true },
    { key: 'note', label: '备注', minWidth: 120, ellipsis: true },
  ];
  if (writable.value) {
    cols.push({
      key: 'actions',
      label: '操作',
      width: 96,
      fixed: 'end',
    });
  }
  return cols;
});

useSyncedQuery(() => ({
  tab: activeTab.value === 'steps' ? 'steps' : undefined,
  q: query.value.trim() || undefined,
}));

watch(activeTab, (tab) => {
  if (tab !== 'steps') layerFilter.value = null;
});

watch([query, layerFilter, pageSize], () => {
  page.value = 1;
});

watch(
  () => [filteredItems.value.length, pageSize.value] as const,
  () => {
    const maxPage = Math.max(
      1,
      Math.ceil(filteredItems.value.length / pageSize.value),
    );
    if (page.value > maxPage) page.value = maxPage;
  },
);

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    feature: '',
    layer: defaultLayer.value,
    name: '',
    note: '',
    role: '',
  });
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: ProcessStepItem) {
  editId.value = item.id;
  Object.assign(form, {
    feature: item.feature,
    layer: item.layer,
    name: item.name,
    note: item.note,
    role: item.role,
  });
  dialogOpen.value = true;
}

function saveItem() {
  const result = store.saveProcessStep(
    {
      feature: form.feature.trim(),
      layer: form.layer,
      name: form.name.trim(),
      note: form.note.trim(),
      role: form.role.trim(),
    },
    editId.value,
  );
  if (
    toastResult(result, editId.value ? '工艺制程已更新' : '工艺制程已新增', {
      duplicate: '该工艺制程已存在',
      validation: '请填写工艺制程并选择制程分层',
    })
  ) {
    dialogOpen.value = false;
  }
}

async function deleteItem(item: ProcessStepItem) {
  const ok = await confirmDelete(
    '删除工艺制程',
    `确认删除“${item.name}”吗？`,
  );
  if (!ok) return;
  toastResult(store.deleteProcessStep(item.id), '工艺制程已删除');
}
</script>

<template>
  <section class="selection-page">
    <ASegmentedControl v-model="activeTab" :segments="tabs" />

    <ProcessIntroPanel v-if="activeTab === 'intro'" />

    <div v-else class="selection-panel">
      <div class="selection-toolbar">
        <ASelect
          v-model="layerFilter"
          class="selection-toolbar__filter"
          :options="layerOptions"
          placeholder="制程分层"
          clearable
        />
        <ASearchField
          v-model="query"
          class="selection-toolbar__filter"
          placeholder="搜索制程、工艺、作用、特性或备注"
        />
        <AButton v-if="writable" variant="filled" @click="addItem">新增</AButton>
      </div>
      <ATable
        :columns="stepColumns"
        :rows="tableData"
        row-key="id"
        :empty-text="
          query.trim() || layerFilter ? '没有匹配的工艺制程' : '暂无工艺制程'
        "
        striped
      >
        <template #cell-actions="{ row }">
          <div class="table-actions">
            <AIconButton
              :icon="Pencil"
              label="编辑"
              size="small"
              @click="editItem(row)"
            />
            <AIconButton
              :icon="Trash2"
              label="删除"
              size="small"
              variant="destructive"
              @click="deleteItem(row)"
            />
          </div>
        </template>
      </ATable>
      <APagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="filteredItems.length"
      />
    </div>

    <ASheet v-model:open="dialogOpen" :title="editId ? '编辑工艺制程' : '新增工艺制程'" :width="640">
      <AFormGrid :columns="1">
        <AFormRow label="制程" required>
          <ASelect v-model="form.layer" :options="layerOptions" placeholder="选择制程分层" />
        </AFormRow>
        <AFormRow label="工艺制程" required>
          <AField v-model="form.name" :maxlength="40" />
        </AFormRow>
        <AFormRow label="作用">
          <ATextArea v-model="form.role" :rows="2" :maxlength="500" />
        </AFormRow>
        <AFormRow label="制程特性">
          <ATextArea v-model="form.feature" :rows="2" :maxlength="500" />
        </AFormRow>
        <AFormRow label="备注">
          <AField v-model="form.note" :maxlength="300" />
        </AFormRow>
      </AFormGrid>
      <template #footer>
        <AButton @click="dialogOpen = false">取消</AButton>
        <AButton variant="filled" @click="saveItem">保存</AButton>
      </template>
    </ASheet>
  </section>
</template>
