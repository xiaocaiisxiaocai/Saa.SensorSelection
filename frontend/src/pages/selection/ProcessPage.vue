<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { Pencil, RotateCcw, Search, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import type { ProcessStepItem } from '@/domain';
import ProcessIntroPanel from '@/pages/selection/process/ProcessIntroPanel.vue';
import { fieldError } from '@/pages/shared/form';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import { useSyncedQuery } from '@/pages/shared/use-synced-query';
import {
  cellText,
  PAGE_SIZE_OPTIONS,
  rowClick,
  scrollX,
  sortFromChange,
  sortOrderOf,
  sortRows,
  type TableSortState,
} from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import '../shared/selection-page.css';

const route = useRoute();
const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

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
const layerOptions = computed(() =>
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

const stepColumns = computed<TableColumnType[]>(() => {
  const cols: TableColumnType[] = [
    {
      key: 'layer',
      dataIndex: 'layer',
      title: '制程',
      width: 88,
      fixed: 'left',
      sorter: true,
      sortOrder: sortOrderOf(sort.value, 'layer'),
    },
    // 固定宽度：工艺制程名很短（实测最长 107px），设成弹性列会按比例吃掉
    // 大量多余空间（实测占到 375px），把宽度从真正需要的「作用」列抢走。
    {
      key: 'name',
      dataIndex: 'name',
      title: '工艺制程',
      width: 160,
      sorter: true,
      sortOrder: sortOrderOf(sort.value, 'name'),
    },
    { key: 'role', dataIndex: 'role', title: '作用', width: 160 },
    { key: 'feature', dataIndex: 'feature', title: '制程特性', width: 160 },
    { key: 'note', dataIndex: 'note', title: '备注', width: 120 },
  ];
  if (writable.value) {
    cols.push({
      key: 'actions',
      title: '操作',
      width: 96,
      fixed: 'right',
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
    notifyResult(result, editId.value ? '工艺制程已更新' : '工艺制程已新增', {
      duplicate: '该工艺制程已存在',
    })
  ) {
    dialogOpen.value = false;
  }
}

async function deleteItem(item: ProcessStepItem) {
  const ok = await confirmDelete('删除工艺制程', `确认删除“${item.name}”吗？`);
  if (!ok) return;
  notifyResult(store.deleteProcessStep(item.id), '工艺制程已删除');
}
</script>

<template>
  <section class="selection-page">
    <h1 class="visually-hidden">制程管理</h1>
    <a-tabs
      v-model:active-key="activeTab"
      class="entity-tabs"
      destroy-inactive-tab-pane
    >
      <a-tab-pane key="intro" tab="制程介绍">
        <ProcessIntroPanel />
      </a-tab-pane>
      <a-tab-pane key="steps" tab="工艺制程">
        <div class="selection-panel">
          <div class="selection-toolbar">
            <a-select
              v-model:value="layerFilter"
              class="selection-toolbar__filter"
              :options="layerOptions"
              placeholder="制程分层"
              aria-label="制程分层筛选"
              allow-clear
            />
            <a-input
              v-model:value="query"
              class="selection-toolbar__filter"
              placeholder="搜索制程、工艺、作用、特性或备注"
              aria-label="搜索制程"
              allow-clear
            >
              <template #prefix><Search :size="14" /></template>
            </a-input>
            <a-button
              type="text"
              :disabled="!hasActiveFilters"
              aria-label="重置筛选"
              @click="resetFilters"
            >
              <template #icon><RotateCcw :size="14" /></template>
              重置
            </a-button>
            <a-button v-if="writable" type="primary" @click="addItem">
              新增
            </a-button>
          </div>
          <a-table
            :columns="stepColumns"
            :data-source="tableData"
            row-key="id"
            :pagination="false"
            :scroll="{ x: scrollX(stepColumns) }"
            :locale="{
              emptyText:
                query.trim() || layerFilter
                  ? '没有匹配的工艺制程'
                  : '暂无工艺制程',
            }"
            :custom-row="writable ? rowClick(editItem) : undefined"
            @change="
              (_p: unknown, _f: unknown, sorter: unknown) =>
                (sort = sortFromChange(sorter))
            "
          >
            <template #bodyCell="{ column, record: row, text: value }">
              <template v-if="column.key === 'actions'">
                <a-space :size="4">
                  <a-tooltip title="编辑">
                    <a-button
                      type="text"
                      size="small"
                      aria-label="编辑"
                      @click="editItem(row)"
                    >
                      <template #icon><Pencil :size="14" /></template>
                    </a-button>
                  </a-tooltip>
                  <a-tooltip title="删除">
                    <a-button
                      type="text"
                      size="small"
                      danger
                      aria-label="删除"
                      @click="deleteItem(row)"
                    >
                      <template #icon><Trash2 :size="14" /></template>
                    </a-button>
                  </a-tooltip>
                </a-space>
              </template>
              <template v-else>{{ cellText(value) }}</template>
            </template>
          </a-table>
          <a-pagination
            v-model:current="page"
            v-model:page-size="pageSize"
            class="table-pagination"
            :total="filteredItems.length"
            :page-size-options="PAGE_SIZE_OPTIONS"
            show-size-changer
            hide-on-single-page
            :show-total="(count: number) => `共 ${count} 条`"
          />
        </div>
      </a-tab-pane>
    </a-tabs>

    <a-modal
      :open="dialogOpen"
      :title="editId ? '编辑工艺制程' : '新增工艺制程'"
      :width="640"
      destroy-on-close
      @cancel="cancelDialog"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item
              html-for="process-layer"
              label="制程"
              required
              v-bind="
                fieldError(
                  validationAttempted && !form.layer ? '请选择制程' : undefined,
                )
              "
            >
              <a-select
                id="process-layer"
                v-model:value="form.layer"
                :options="layerOptions"
                placeholder="选择制程分层"
              />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item
              html-for="process-name"
              label="工艺制程"
              required
              v-bind="
                fieldError(
                  validationAttempted && !form.name.trim()
                    ? '请输入工艺制程'
                    : undefined,
                )
              "
            >
              <a-input
                id="process-name"
                v-model:value="form.name"
                :maxlength="40"
                allow-clear
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item html-for="process-role" label="作用">
              <a-textarea
                id="process-role"
                v-model:value="form.role"
                :rows="2"
                :maxlength="500"
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item html-for="process-feature" label="制程特性">
              <a-textarea
                id="process-feature"
                v-model:value="form.feature"
                :rows="2"
                :maxlength="500"
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item html-for="process-note" label="备注">
              <a-input
                id="process-note"
                v-model:value="form.note"
                :maxlength="300"
                allow-clear
                show-count
              />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <template #footer>
        <a-button @click="cancelDialog">取消</a-button>
        <a-button type="primary" @click="saveItem">保存</a-button>
      </template>
    </a-modal>
  </section>
</template>
