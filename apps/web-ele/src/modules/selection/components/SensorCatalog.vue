<script lang="ts" setup>
import type { SensorItem } from '../data.js';

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
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTooltip,
} from 'element-plus';
import { Pencil, Plus, Save, Search, Trash2 } from 'lucide-vue-next';

import { SENSOR_DATA } from '../data.js';
import { useSelectionStore } from '../store';
import AppToolbar from './AppToolbar.vue';

const route = useRoute();
const router = useRouter();
const store = useSelectionStore();
const status = ref<'全部' | '备选' | '现用'>('现用');
const query = ref('');
const dialogOpen = ref(false);
const editId = ref<number>();
const form = reactive({
  brand: '',
  feature: '',
  model: '',
  scene: '',
  sensorType: Object.keys(SENSOR_DATA)[0] || '',
  spec: '',
  status: '现用' as SensorItem['status'],
});

const items = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  return store.sensors.filter((item) => {
    const matchesStatus =
      status.value === '全部' || item.status === status.value;
    const haystack = [
      item.sensorType,
      item.brand,
      item.model,
      item.spec,
      item.feature,
      item.scene,
    ]
      .join(' ')
      .toLocaleLowerCase('zh-CN');
    return matchesStatus && (!value || haystack.includes(value));
  });
});

const currentCount = computed(
  () => store.sensors.filter((item) => item.status === '现用').length,
);
const alternativeCount = computed(
  () => store.sensors.filter((item) => item.status === '备选').length,
);

const page = ref(1);
const pageSize = ref(20);
const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return items.value.slice(start, start + pageSize.value);
});

watch(
  () => route.query.model,
  (model) => {
    const value = String(model || '');
    if (!value) return;
    status.value = '全部';
    query.value = value;
  },
  { immediate: true },
);

watch([status, query], () => {
  if (route.query.model && query.value !== route.query.model) {
    const nextQuery = { ...route.query };
    delete nextQuery.model;
    router.replace({ query: nextQuery });
  }
});

// 筛选条件变化时回到第一页
watch([status, query], () => {
  page.value = 1;
});

// 数据量或每页条数变化时，防止当前页码越界
watch(
  () => [items.value.length, pageSize.value],
  () => {
    const maxPage = Math.max(1, Math.ceil(items.value.length / pageSize.value));
    if (page.value > maxPage) page.value = maxPage;
  },
);

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    brand: '',
    feature: '',
    model: '',
    scene: '',
    sensorType: Object.keys(SENSOR_DATA)[0] || '',
    spec: '',
    status: '现用',
  });
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: SensorItem) {
  editId.value = item.id;
  Object.assign(form, item);
  dialogOpen.value = true;
}

function saveItem() {
  const result = store.saveSensor({ ...form }, editId.value);
  if (!result.ok) {
    const messages = {
      duplicate: '该型号已存在，请使用不同的型号名称',
      stale: '该型号已被其他页面删除',
      storage: '浏览器本地存储不可用，本次修改未保存',
      validation: '请填写型号并选择感应器类型',
    };
    ElMessage.error(messages[result.reason]);
    return;
  }
  dialogOpen.value = false;
  ElMessage.success(editId.value ? '型号已更新' : '型号已新增');
}

async function deleteItem(item: SensorItem) {
  try {
    await ElMessageBox.confirm(`确认删除“${item.model}”吗？`, '删除型号', {
      cancelButtonText: '取消',
      confirmButtonText: '删除',
      type: 'warning',
    });
  } catch {
    return;
  }
  const result = store.deleteSensor(item.id);
  if (!result.ok) {
    ElMessage.error('该型号已不存在或存储不可用');
    return;
  }
  ElMessage.success('型号已删除');
}
</script>

<template>
  <main class="selection-page sensor-page">
    <AppToolbar
      subtitle="受控类型字典、规格参数和适用场景"
      title="Sensor 型号字典"
    />

    <section aria-label="型号统计" class="sensor-summary">
      <div>
        <span>现用型号</span>
        <strong>{{ currentCount }}</strong>
      </div>
      <div>
        <span>备选型号</span>
        <strong>{{ alternativeCount }}</strong>
      </div>
      <div>
        <span>类型字典</span>
        <strong>{{ Object.keys(SENSOR_DATA).length }}</strong>
      </div>
    </section>

    <section class="sensor-catalog">
      <div class="sensor-catalog__toolbar">
        <ElRadioGroup v-model="status" aria-label="型号状态筛选">
          <ElRadioButton value="现用">现用型号</ElRadioButton>
          <ElRadioButton value="备选">备选型号</ElRadioButton>
          <ElRadioButton value="全部">全部</ElRadioButton>
        </ElRadioGroup>
        <div class="sensor-catalog__actions">
          <label class="catalog-search">
            <Search :size="16" aria-hidden="true" />
            <input
              v-model="query"
              aria-label="搜索 Sensor 型号"
              placeholder="搜索类型、品牌、型号或场景"
              type="search"
            />
          </label>
          <ElButton type="primary" @click="addItem">
            <Plus :size="15" aria-hidden="true" />
            新增型号
          </ElButton>
        </div>
      </div>

      <ElTable
        :data="tableData"
        empty-text="没有符合当前条件的型号"
        row-key="id"
      >
        <ElTableColumn label="状态" width="86">
          <template #default="scope">
            <ElTag :type="scope.row.status === '现用' ? 'success' : 'info'">
              {{ scope.row.status }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="感应器类型" min-width="112" prop="sensorType" />
        <ElTableColumn label="品牌" min-width="100" prop="brand" />
        <ElTableColumn label="型号" min-width="150" prop="model" />
        <ElTableColumn
          label="规格参数"
          min-width="250"
          prop="spec"
          show-overflow-tooltip
        />
        <ElTableColumn
          label="特性与注意"
          min-width="260"
          prop="feature"
          show-overflow-tooltip
        />
        <ElTableColumn
          label="适用场景"
          min-width="220"
          prop="scene"
          show-overflow-tooltip
        />
        <ElTableColumn fixed="right" label="操作" width="104">
          <template #default="scope">
            <div class="table-actions">
              <ElTooltip content="编辑" placement="top">
                <ElButton
                  aria-label="编辑型号"
                  circle
                  @click="editItem(scope.row)"
                >
                  <Pencil :size="15" aria-hidden="true" />
                </ElButton>
              </ElTooltip>
              <ElTooltip content="删除" placement="top">
                <ElButton
                  aria-label="删除型号"
                  circle
                  type="danger"
                  @click="deleteItem(scope.row)"
                >
                  <Trash2 :size="15" aria-hidden="true" />
                </ElButton>
              </ElTooltip>
            </div>
          </template>
        </ElTableColumn>
      </ElTable>
      <div v-if="items.length > pageSize" class="table-pagination">
        <ElPagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="items.length"
          background
          layout="total, sizes, prev, pager, next"
        />
      </div>
      <footer class="sensor-catalog__footer">
        当前显示 {{ tableData.length }} 条，共 {{ store.sensors.length }} 条
      </footer>
    </section>

    <ElDialog
      v-model="dialogOpen"
      :title="editId ? '编辑 Sensor 型号' : '新增 Sensor 型号'"
      width="680px"
      @closed="resetForm"
    >
      <ElForm label-position="top">
        <div class="form-grid form-grid--three">
          <ElFormItem label="状态" required>
            <ElSelect v-model="form.status" class="w-full">
              <ElOption label="现用" value="现用" />
              <ElOption label="备选" value="备选" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="感应器类型" required>
            <ElSelect v-model="form.sensorType" class="w-full">
              <ElOption
                v-for="sensorType in Object.keys(SENSOR_DATA)"
                :key="sensorType"
                :label="sensorType"
                :value="sensorType"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="品牌">
            <ElInput v-model="form.brand" maxlength="60" />
          </ElFormItem>
        </div>
        <ElFormItem label="型号" required>
          <ElInput v-model="form.model" maxlength="100" />
        </ElFormItem>
        <ElFormItem label="规格参数">
          <ElInput
            v-model="form.spec"
            :rows="2"
            maxlength="500"
            type="textarea"
          />
        </ElFormItem>
        <ElFormItem label="特性与注意">
          <ElInput
            v-model="form.feature"
            :rows="2"
            maxlength="500"
            type="textarea"
          />
        </ElFormItem>
        <ElFormItem label="适用场景">
          <ElInput v-model="form.scene" maxlength="300" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogOpen = false">取消</ElButton>
        <ElButton type="primary" @click="saveItem">
          <Save :size="15" aria-hidden="true" />
          保存
        </ElButton>
      </template>
    </ElDialog>
  </main>
</template>
