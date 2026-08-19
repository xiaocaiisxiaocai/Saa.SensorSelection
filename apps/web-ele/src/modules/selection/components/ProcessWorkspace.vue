<script lang="ts" setup>
import type { ProcessStepItem } from '../data.js';

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
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTabPane,
  ElTabs,
  ElTooltip,
} from 'element-plus';
import { Pencil, Plus, Save, Search, Trash2, X } from 'lucide-vue-next';

import { PROCESS_DETAILS } from '../data.js';
import { useSelectionStore } from '../store';
import DocumentsPanel from './DocumentsPanel.vue';

defineOptions({ name: 'ProcessWorkspace' });

const route = useRoute();
const router = useRouter();
const store = useSelectionStore();
const activeTab = ref(
  String(route.query.tab || '') === 'steps' ? 'steps' : 'intro',
);
const query = ref(String(route.query.q || ''));
const layerFilter = ref('');
const dialogOpen = ref(false);
const editId = ref<number>();
const page = ref(1);
const pageSize = ref(20);

const layerNames = computed(() => store.dictionaryNames('process-layer'));
const defaultLayer = computed(() => layerNames.value[0] || '内层');

const form = reactive({
  feature: '',
  layer: '',
  name: '',
  note: '',
  role: '',
});

const introFiles = computed(() => PROCESS_DETAILS['制程报告']?.files || []);

const filteredItems = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  const items = store.processSteps;
  return items.filter(
    (item) =>
      (!layerFilter.value || item.layer === layerFilter.value) &&
      (!value ||
        [item.layer, item.name, item.role, item.feature, item.note]
          .join(' ')
          .toLocaleLowerCase('zh-CN')
          .includes(value)),
  );
});

const hasFilters = computed(() =>
  Boolean(query.value.trim() || layerFilter.value),
);

const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredItems.value.slice(start, start + pageSize.value);
});

watch(
  () => [route.query.tab, route.query.q] as const,
  ([tab, q]) => {
    if (String(tab || '') === 'steps') activeTab.value = 'steps';
    if (q !== undefined) query.value = String(q || '');
  },
);

watch(activeTab, () => {
  if (activeTab.value !== 'steps') layerFilter.value = '';
});

watch([query, activeTab], () => {
  page.value = 1;
  const nextQuery = { ...route.query };
  if (activeTab.value === 'steps') nextQuery.tab = 'steps';
  else delete nextQuery.tab;
  if (query.value.trim()) nextQuery.q = query.value.trim();
  else delete nextQuery.q;
  const same =
    String(route.query.tab || '') === String(nextQuery.tab || '') &&
    String(route.query.q || '') === String(nextQuery.q || '');
  if (!same) router.replace({ path: route.path, query: nextQuery });
});

watch(
  () => [filteredItems.value.length, pageSize.value],
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

function failureMessage(reason: string) {
  if (reason === 'duplicate') return '该工艺制程已存在';
  if (reason === 'storage') return '数据保存失败，本次修改未保存';
  if (reason === 'stale') return '该记录已被删除';
  if (reason === 'validation') return '请填写工艺制程并选择制程分层';
  return '保存失败，请重试';
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
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }
  dialogOpen.value = false;
  ElMessage.success(editId.value ? '工艺制程已更新' : '工艺制程已新增');
}

async function deleteItem(item: ProcessStepItem) {
  try {
    await ElMessageBox.confirm(`确认删除“${item.name}”吗？`, '删除工艺制程', {
      cancelButtonText: '取消',
      confirmButtonText: '删除',
      type: 'warning',
    });
  } catch {
    return;
  }
  const result = store.deleteProcessStep(item.id);
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }
  ElMessage.success('工艺制程已删除');
}
</script>

<template>
  <main class="selection-page process-page" style="--module-accent: #6d28d9">
    <section class="process-workspace">
      <ElTabs v-model="activeTab" class="detail-tabs">
        <ElTabPane label="制程介绍" lazy name="intro">
          <DocumentsPanel :files="introFiles" />
        </ElTabPane>
        <ElTabPane label="工艺制程" lazy name="steps">
          <section class="data-section">
            <div class="data-section__toolbar">
              <span>
                {{
                  hasFilters
                    ? `匹配 ${filteredItems.length} / 共 ${store.processSteps.length} 条`
                    : `${filteredItems.length} 条记录`
                }}
              </span>
              <div class="data-section__actions">
                <ElSelect
                  v-model="layerFilter"
                  aria-label="按制程分层筛选"
                  class="data-filter-select"
                  clearable
                  filterable
                  placeholder="制程分层"
                >
                  <ElOption
                    v-for="option in layerNames"
                    :key="option"
                    :label="option"
                    :value="option"
                  />
                </ElSelect>
                <label class="tab-search">
                  <Search :size="16" aria-hidden="true" />
                  <input
                    v-model="query"
                    aria-label="搜索工艺制程"
                    placeholder="搜索制程、工艺、作用、特性或备注"
                    type="search"
                  />
                  <button
                    v-if="query"
                    aria-label="清除筛选"
                    class="icon-button"
                    type="button"
                    @click="query = ''"
                  >
                    <X :size="15" aria-hidden="true" />
                  </button>
                </label>
                <ElButton
                  type="primary"
                  v-can-write="'selection:write'"
                  @click="addItem"
                >
                  <Plus :size="15" aria-hidden="true" />
                  新增
                </ElButton>
              </div>
            </div>

            <div class="table-scroll">
              <ElTable
                :data="tableData"
                empty-text="暂无工艺制程"
                row-key="id"
                stripe
              >
                <ElTableColumn label="制程" min-width="100" prop="layer" />
                <ElTableColumn label="工艺制程" min-width="140" prop="name" />
                <ElTableColumn
                  label="作用"
                  min-width="240"
                  prop="role"
                  show-overflow-tooltip
                />
                <ElTableColumn
                  label="制程特性"
                  min-width="200"
                  prop="feature"
                  show-overflow-tooltip
                />
                <ElTableColumn
                  label="备注"
                  min-width="160"
                  prop="note"
                  show-overflow-tooltip
                />
                <ElTableColumn fixed="right" label="操作" width="108">
                  <template #default="{ row }: { row: ProcessStepItem }">
                    <div class="table-actions">
                      <ElTooltip content="编辑" placement="top">
                        <ElButton
                          aria-label="编辑工艺制程"
                          circle
                          v-can-write="'selection:write'"
                          @click="editItem(row)"
                        >
                          <Pencil :size="15" aria-hidden="true" />
                        </ElButton>
                      </ElTooltip>
                      <ElTooltip content="删除" placement="top">
                        <ElButton
                          aria-label="删除工艺制程"
                          circle
                          type="danger"
                          v-can-write="'selection:write'"
                          @click="deleteItem(row)"
                        >
                          <Trash2 :size="15" aria-hidden="true" />
                        </ElButton>
                      </ElTooltip>
                    </div>
                  </template>
                </ElTableColumn>
              </ElTable>
            </div>
            <div
              v-if="filteredItems.length > pageSize"
              class="table-pagination"
            >
              <ElPagination
                v-model:current-page="page"
                v-model:page-size="pageSize"
                :page-sizes="[20, 50, 100]"
                :total="filteredItems.length"
                background
                layout="total, sizes, prev, pager, next"
              />
            </div>
          </section>
        </ElTabPane>
      </ElTabs>
    </section>

    <ElDialog
      v-model="dialogOpen"
      :title="editId ? '编辑工艺制程' : '新增工艺制程'"
      width="640px"
      @closed="resetForm"
    >
      <ElForm label-position="top" @submit.prevent="saveItem">
        <div class="form-grid">
          <ElFormItem label="制程" required>
            <ElSelect v-model="form.layer" class="w-full" filterable>
              <ElOption
                v-for="option in layerNames"
                :key="option"
                :label="option"
                :value="option"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="工艺制程" required>
            <ElInput v-model="form.name" maxlength="40" />
          </ElFormItem>
        </div>
        <ElFormItem label="作用">
          <ElInput
            v-model="form.role"
            :rows="2"
            maxlength="500"
            type="textarea"
          />
        </ElFormItem>
        <ElFormItem label="制程特性">
          <ElInput
            v-model="form.feature"
            :rows="2"
            maxlength="500"
            type="textarea"
          />
        </ElFormItem>
        <ElFormItem label="备注">
          <ElInput v-model="form.note" maxlength="300" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogOpen = false">取消</ElButton>
        <ElButton
          type="primary"
          v-can-write="'selection:write'"
          @click="saveItem"
        >
          <Save :size="15" aria-hidden="true" />
          保存
        </ElButton>
      </template>
    </ElDialog>
  </main>
</template>
