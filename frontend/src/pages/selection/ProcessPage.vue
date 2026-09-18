<script setup lang="ts">
import { Pencil, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import type { ProcessStepItem } from '@/domain';
import ProcessIntroPanel from '@/pages/selection/process/ProcessIntroPanel.vue';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useSyncedQuery } from '@/pages/shared/use-synced-query';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import {
  AButton,
  AField,
  AFilterResetButton,
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
  sortRows,
  type TableColumn,
  type TableSortState,
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
const validationAttempted = ref(false);
const page = ref(1);
const pageSize = ref(20);
const sort = ref<TableSortState | null>(null);
const form = reactive({
  feature: '',
  layer: '',
  name: '',
  note: '',
  role: '',
});
const dirtyGuard = useDirtyGuard(form);

const layerNames = computed(() => store.dictionaryNames('process-layer'));
const layerOptions = computed<SelectOption[]>(() =>
  layerNames.value.map((name) => ({ label: name, value: name })),
);
const defaultLayer = computed(() => layerNames.value[0] || '内层');
const hasActiveFilters = computed(
  () => Boolean(query.value.trim()) || Boolean(layerFilter.value),
);

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

// 排序必须发生在分页切片之前，否则只会把当前这一页重排。
const sortedItems = computed(() => sortRows(filteredItems.value, sort.value));

const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedItems.value.slice(start, start + pageSize.value);
});

const stepColumns = computed<TableColumn[]>(() => {
  const cols: TableColumn[] = [
    { key: 'layer', label: '制程', width: 64, fixed: 'start', sortable: true },
    // 固定宽度：工艺制程名很短（实测最长 107px），设成弹性列会按比例吃掉
    // 大量多余空间（实测占到 375px），把宽度从真正需要的「作用」列抢走。
    { key: 'name', label: '工艺制程', width: 160, sortable: true },
    { key: 'role', label: '作用', minWidth: 160 },
    { key: 'feature', label: '制程特性', minWidth: 160 },
    { key: 'note', label: '备注', minWidth: 120 },
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

watch([query, layerFilter, pageSize, sort], () => {
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
  validationAttempted.value = false;
  editId.value = undefined;
  Object.assign(form, {
    feature: '',
    layer: defaultLayer.value,
    name: '',
    note: '',
    role: '',
  });
}

function resetFilters() {
  query.value = '';
  layerFilter.value = null;
  page.value = 1;
}

function addItem() {
  resetForm();
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

function editItem(item: ProcessStepItem) {
  validationAttempted.value = false;
  editId.value = item.id;
  Object.assign(form, {
    feature: item.feature,
    layer: item.layer,
    name: item.name,
    note: item.note,
    role: item.role,
  });
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

async function cancelDialog() {
  if (await dirtyGuard.confirmClose()) {
    dialogOpen.value = false;
  }
}

function saveItem() {
  validationAttempted.value = true;
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
    })
  ) {
    dialogOpen.value = false;
  }
}

async function deleteItem(item: ProcessStepItem) {
  const ok = await confirmDelete('删除工艺制程', `确认删除“${item.name}”吗？`);
  if (!ok) return;
  toastResult(store.deleteProcessStep(item.id), '工艺制程已删除');
}
</script>

<template>
  <section class="selection-page">
    <h1 class="visually-hidden">制程管理</h1>
    <ASegmentedControl
      id="process-tabs"
      v-model="activeTab"
      aria-label="制程资料分类"
      :segments="tabs"
    />

    <ProcessIntroPanel
      v-if="activeTab === 'intro'"
      id="process-tabs-panel-intro"
      role="tabpanel"
      aria-labelledby="process-tabs-tab-intro"
      tabindex="0"
    />

    <div
      v-else
      id="process-tabs-panel-steps"
      role="tabpanel"
      aria-labelledby="process-tabs-tab-steps"
      tabindex="0"
      class="selection-panel"
    >
      <div class="selection-toolbar">
        <ASelect
          v-model="layerFilter"
          class="selection-toolbar__filter"
          :options="layerOptions"
          placeholder="制程分层"
          aria-label="制程分层筛选"
          clearable
        />
        <ASearchField
          v-model="query"
          class="selection-toolbar__filter"
          placeholder="搜索制程、工艺、作用、特性或备注"
          aria-label="搜索制程"
        />
        <AFilterResetButton :active="hasActiveFilters" @reset="resetFilters" />
        <AButton v-if="writable" variant="filled" @click="addItem">
          新增
        </AButton>
      </div>
      <ATable
        v-model:sort="sort"
        storage-key="process-steps"
        :columns="stepColumns"
        :rows="tableData"
        row-key="id"
        :empty-text="
          query.trim() || layerFilter ? '没有匹配的工艺制程' : '暂无工艺制程'
        "
        @activate="writable && editItem($event)"
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

    <ASheet
      v-model:open="dialogOpen"
      :title="editId ? '编辑工艺制程' : '新增工艺制程'"
      :width="640"
      :confirm-close="dirtyGuard.confirmClose"
    >
      <AFormGrid :columns="1">
        <AFormRow
          label="制程"
          required
          :error="validationAttempted && !form.layer ? '请选择制程' : undefined"
        >
          <ASelect
            v-model="form.layer"
            :options="layerOptions"
            placeholder="选择制程分层"
          />
        </AFormRow>
        <AFormRow
          label="工艺制程"
          required
          :error="
            validationAttempted && !form.name.trim()
              ? '请输入工艺制程'
              : undefined
          "
        >
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
        <AButton @click="cancelDialog">取消</AButton>
        <AButton variant="filled" @click="saveItem">保存</AButton>
      </template>
    </ASheet>
  </section>
</template>
