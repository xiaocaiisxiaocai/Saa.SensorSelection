<script lang="ts" setup>
import type { SensorItem } from '../data.js';
import type { SaveFailure } from '../domain.js';

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
  ElTag,
  ElTooltip,
} from 'element-plus';
import {
  ExternalLink,
  Pencil,
  Plus,
  Replace,
  Save,
  Search,
  Trash2,
} from 'lucide-vue-next';

import { useSelectionStore } from '../store';
import SensorSopPanel from './SensorSopPanel.vue';

const STATUS_TAB_ORDER = ['现用', '备选', '停用'];

const route = useRoute();
const router = useRouter();
const store = useSelectionStore();
const mainTab = ref('现用');
const status = ref('');
const query = ref('');
const sensorTypeFilter = ref('');
const dialogOpen = ref(false);
const editId = ref<number>();
const focusSopId = ref<null | number>(null);
const replaceOpen = ref(false);
const replaceSource = ref<null | SensorItem>(null);
const replaceTargetId = ref<number>();
const replaceNote = ref('');

const statusNames = computed(() => {
  const names = store.dictionaryNames('sensor-status');
  return [...names].sort((a, b) => {
    const ia = STATUS_TAB_ORDER.indexOf(a);
    const ib = STATUS_TAB_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
});
const typeNames = computed(() => store.dictionaryNames('sensor-type'));
const statusFilterOptions = computed(() => ['全部', ...statusNames.value]);
const defaultStatus = computed(() => statusNames.value[0] || '现用');
const defaultType = computed(() => typeNames.value[0] || '');

const sensorById = computed(() => {
  const map = new Map<number, SensorItem>();
  for (const item of store.sensors) map.set(item.id, item);
  return map;
});

watch(
  statusNames,
  (names) => {
    if (
      mainTab.value !== 'sop' &&
      mainTab.value !== '全部' &&
      !names.includes(mainTab.value)
    ) {
      mainTab.value = names[0] || '全部';
    }
    if (
      !status.value ||
      (status.value !== '全部' && !names.includes(status.value))
    ) {
      status.value = names[0] || '全部';
    }
  },
  { immediate: true },
);

watch(mainTab, (tab) => {
  if (tab === 'sop') return;
  status.value = tab;
});

function onStatusFilterChange(value: string) {
  mainTab.value = value === '全部' ? '全部' : value;
}

const form = reactive({
  brand: '',
  feature: '',
  model: '',
  partNumber: '',
  scene: '',
  sensorType: '',
  sopId: undefined as number | undefined,
  spec: '',
  status: '',
});

const showCatalog = computed(() => mainTab.value !== 'sop');
const showProblemColumn = computed(() => mainTab.value === '停用');

const items = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  const statusFilter = mainTab.value === '全部' ? '全部' : mainTab.value;
  return store.sensors.filter((item) => {
    const matchesStatus =
      statusFilter === '全部' || item.status === statusFilter;
    const matchesSensorType =
      !sensorTypeFilter.value || item.sensorType === sensorTypeFilter.value;
    const related = relatedSensor(item);
    const haystack = [
      item.status,
      item.partNumber,
      item.sensorType,
      item.brand,
      item.model,
      item.spec,
      item.feature,
      item.scene,
      item.problemNote,
      related?.model,
      related?.brand,
      related?.partNumber,
      sopTitle(item.sopId),
    ]
      .join(' ')
      .toLocaleLowerCase('zh-CN');
    return (
      matchesStatus && matchesSensorType && (!value || haystack.includes(value))
    );
  });
});

const hasFilters = computed(() =>
  Boolean(query.value.trim() || sensorTypeFilter.value),
);

const page = ref(1);
const pageSize = ref(20);
const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return items.value.slice(start, start + pageSize.value);
});

const replaceCandidates = computed(() => {
  const source = replaceSource.value;
  if (!source) return [] as SensorItem[];
  const currents = store.sensors.filter(
    (item) => item.status === '现用' && item.id !== source.id,
  );
  const sameType = currents.filter(
    (item) => item.sensorType === source.sensorType,
  );
  const otherType = currents.filter(
    (item) => item.sensorType !== source.sensorType,
  );
  return [...sameType, ...otherType];
});

watch(
  () => route.query.model,
  (model) => {
    if (route.name !== 'SelectionSensor') return;
    const value = String(model || '');
    if (!value) return;
    mainTab.value = '全部';
    status.value = '全部';
    query.value = value;
  },
  { immediate: true },
);

watch(
  () => [route.query.tab, route.query.sopId] as const,
  ([tab, sopId]) => {
    if (route.name !== 'SelectionSensor') return;
    if (String(tab || '') === 'sop') {
      mainTab.value = 'sop';
      const id = Number(sopId);
      focusSopId.value = Number.isSafeInteger(id) && id > 0 ? id : null;
    }
  },
  { immediate: true },
);

watch([mainTab, query], () => {
  if (route.name !== 'SelectionSensor') return;
  if (route.query.model && query.value !== route.query.model) {
    const nextQuery = { ...route.query };
    delete nextQuery.model;
    router.replace({ path: route.path, query: nextQuery });
  }
});

watch([mainTab, query], () => {
  page.value = 1;
});

watch(
  () => [items.value.length, pageSize.value],
  () => {
    const maxPage = Math.max(1, Math.ceil(items.value.length / pageSize.value));
    if (page.value > maxPage) page.value = maxPage;
  },
);

function sopTitle(sopId: null | number | undefined) {
  if (!sopId) return '';
  return store.sensorSops.find((item) => item.id === sopId)?.title || '';
}

function relatedSensor(item: SensorItem) {
  const id = item.replacesId || item.replacedById;
  if (!id) return null;
  return sensorById.value.get(id) || null;
}

function relationText(item: SensorItem) {
  const related = relatedSensor(item);
  const relatedLabel = related
    ? [related.brand, related.model].filter(Boolean).join(' ')
    : '';
  if (item.replacesId) {
    const target = relatedLabel || `型号#${item.replacesId}`;
    return item.problemNote
      ? `替换了 ${target} · ${item.problemNote}`
      : `替换了 ${target}`;
  }
  if (item.replacedById) {
    const target = relatedLabel || `型号#${item.replacedById}`;
    return item.problemNote
      ? `被 ${target} 替换 · ${item.problemNote}`
      : `被 ${target} 替换`;
  }
  return '';
}

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    brand: '',
    feature: '',
    model: '',
    partNumber: '',
    scene: '',
    sensorType: defaultType.value,
    sopId: undefined,
    spec: '',
    status: defaultStatus.value,
  });
}

function statusTagType(value: string) {
  if (value.includes('停')) return 'warning' as const;
  if (value.includes('现')) return 'success' as const;
  if (value.includes('备')) return 'info' as const;
  return 'info' as const;
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: SensorItem) {
  editId.value = item.id;
  Object.assign(form, {
    brand: item.brand,
    feature: item.feature,
    model: item.model,
    partNumber: item.partNumber || '',
    scene: item.scene,
    sensorType: item.sensorType,
    sopId: item.sopId ?? undefined,
    spec: item.spec,
    status: item.status,
  });
  dialogOpen.value = true;
}

function openLinkedSop(sopId: null | number) {
  if (!sopId) return;
  focusSopId.value = sopId;
  mainTab.value = 'sop';
  router.replace({
    path: route.path,
    query: { ...route.query, tab: 'sop', sopId: String(sopId) },
  });
}

function openRelatedSensor(item: SensorItem) {
  const related = relatedSensor(item);
  if (!related) return;
  mainTab.value = '全部';
  status.value = '全部';
  query.value = related.model;
}

function onSopPreviewed(id: number) {
  focusSopId.value = id;
}

function saveItem() {
  const payload = {
    ...form,
    brand: form.brand.trim(),
    feature: form.feature.trim(),
    model: form.model.trim(),
    partNumber: form.partNumber.trim(),
    scene: form.scene.trim(),
    sopId: form.sopId ?? null,
    spec: form.spec.trim(),
  };
  const result = store.saveSensor(payload, editId.value);
  if (!result.ok) {
    const messages: Record<SaveFailure, string> = {
      duplicate: '该型号已存在，请使用不同的型号名称',
      'in-use': '仍有关联数据，无法删除',
      'not-empty': '请先清空关联数据后再删除',
      stale: '该型号已被其他页面删除',
      storage: '数据保存失败，本次修改未保存',
      validation: '请填写型号并选择感应器类型',
      size: '文件大小超出限制',
      type: '文件类型不受支持',
    };
    ElMessage.error(messages[result.reason]);
    return;
  }
  dialogOpen.value = false;
  ElMessage.success(editId.value ? '型号已更新' : '型号已新增');
}

function openReplace(item: SensorItem) {
  replaceSource.value = item;
  replaceNote.value = '';
  const candidates = store.sensors.filter(
    (row) => row.status === '现用' && row.id !== item.id,
  );
  const preferred =
    candidates.find((row) => row.sensorType === item.sensorType) ||
    candidates[0];
  replaceTargetId.value = preferred?.id;
  replaceOpen.value = true;
}

function closeReplace() {
  replaceOpen.value = false;
  replaceSource.value = null;
  replaceTargetId.value = undefined;
  replaceNote.value = '';
}

function confirmReplace() {
  const source = replaceSource.value;
  if (!source || !replaceTargetId.value) {
    ElMessage.error('请选择要替换的现用型号');
    return;
  }
  const note = replaceNote.value.trim();
  if (!note) {
    ElMessage.error('请填写问题点');
    return;
  }
  const result = store.replaceSensorCurrent(
    source.id,
    replaceTargetId.value,
    note,
  );
  if (!result.ok) {
    const messages: Record<SaveFailure, string> = {
      duplicate: '型号冲突',
      'in-use': '仍有关联数据',
      'not-empty': '关联数据未清空',
      stale: '型号已不存在，请刷新后重试',
      storage: '数据保存失败，本次替换未保存',
      validation: '仅备选可替换现用，且必须填写问题点',
      size: '文件大小超出限制',
      type: '文件类型不受支持',
    };
    ElMessage.error(messages[result.reason]);
    return;
  }
  closeReplace();
  mainTab.value = '现用';
  ElMessage.success('已替换现用型号，原型号已停用');
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

function candidateLabel(item: SensorItem) {
  const base = [item.sensorType, item.brand, item.model, item.partNumber]
    .filter(Boolean)
    .join(' · ');
  return replaceSource.value &&
    item.sensorType === replaceSource.value.sensorType
    ? `${base}（同类型）`
    : base;
}
</script>

<template>
  <main class="selection-page sensor-page">
    <section class="sensor-catalog">
      <ElTabs v-model="mainTab" class="detail-tabs sensor-main-tabs">
        <ElTabPane label="SOP" lazy name="sop">
          <SensorSopPanel
            :focus-sop-id="focusSopId"
            @previewed="onSopPreviewed"
          />
        </ElTabPane>
        <ElTabPane
          v-for="name in statusNames"
          :key="name"
          :label="`${name}型号`"
          :name="name"
          lazy
        />
        <ElTabPane label="全部" lazy name="全部" />
      </ElTabs>

      <template v-if="showCatalog">
        <div class="sensor-catalog__toolbar">
          <span class="sensor-catalog__hint">
            {{
              hasFilters
                ? `匹配 ${items.length} / 共 ${store.sensors.length} 条`
                : `${items.length} 条记录`
            }}
          </span>
          <div class="sensor-catalog__actions">
            <ElSelect
              :model-value="status === '' ? '全部' : status"
              aria-label="按 Sensor 状态筛选"
              class="data-filter-select"
              filterable
              placeholder="状态"
              @change="onStatusFilterChange"
            >
              <ElOption
                v-for="option in statusFilterOptions"
                :key="option"
                :label="option"
                :value="option"
              />
            </ElSelect>
            <ElSelect
              v-model="sensorTypeFilter"
              aria-label="按感应器类型筛选"
              class="data-filter-select"
              clearable
              filterable
              placeholder="感应器类型"
            >
              <ElOption
                v-for="option in typeNames"
                :key="option"
                :label="option"
                :value="option"
              />
            </ElSelect>
            <label class="catalog-search">
              <Search :size="16" aria-hidden="true" />
              <input
                v-model="query"
                aria-label="搜索 Sensor 型号"
                placeholder="搜索类型、品牌、型号、料号、停用或问题点"
                type="search"
              />
            </label>
            <ElButton
              type="primary"
              v-can-write="'selection:write'"
              @click="addItem"
            >
              <Plus :size="15" aria-hidden="true" />
              新增型号
            </ElButton>
          </div>
        </div>

        <div class="table-scroll">
          <ElTable
            :data="tableData"
            empty-text="没有符合当前条件的型号"
            row-key="id"
          >
            <ElTableColumn label="状态" width="86">
              <template #default="scope">
                <ElTag :type="statusTagType(scope.row.status)">
                  {{ scope.row.status }}
                </ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn label="料号" min-width="110">
              <template #default="{ row }: { row: SensorItem }">
                {{ row.partNumber || '—' }}
              </template>
            </ElTableColumn>
            <ElTableColumn
              label="感应器类型"
              min-width="112"
              prop="sensorType"
            />
            <ElTableColumn label="品牌" min-width="100" prop="brand" />
            <ElTableColumn label="型号" min-width="150" prop="model" />
            <ElTableColumn label="关联 SOP" min-width="160">
              <template #default="{ row }: { row: SensorItem }">
                <button
                  v-if="row.sopId && sopTitle(row.sopId)"
                  class="sensor-sop-link"
                  type="button"
                  @click="openLinkedSop(row.sopId)"
                >
                  <ExternalLink :size="14" aria-hidden="true" />
                  <span>{{ sopTitle(row.sopId) }}</span>
                </button>
                <span v-else class="sensor-sop-empty">未关联</span>
              </template>
            </ElTableColumn>
            <ElTableColumn
              v-if="showProblemColumn"
              label="问题点"
              min-width="180"
              show-overflow-tooltip
            >
              <template #default="{ row }: { row: SensorItem }">
                {{ row.problemNote || '—' }}
              </template>
            </ElTableColumn>
            <ElTableColumn label="替换关系" min-width="220">
              <template #default="{ row }: { row: SensorItem }">
                <button
                  v-if="relationText(row)"
                  class="sensor-replace-link"
                  type="button"
                  @click="openRelatedSensor(row)"
                >
                  {{ relationText(row) }}
                </button>
                <span v-else class="sensor-sop-empty">—</span>
              </template>
            </ElTableColumn>
            <ElTableColumn
              label="规格参数"
              min-width="220"
              prop="spec"
              show-overflow-tooltip
            />
            <ElTableColumn
              label="特性与注意"
              min-width="220"
              prop="feature"
              show-overflow-tooltip
            />
            <ElTableColumn
              label="适用场景"
              min-width="180"
              prop="scene"
              show-overflow-tooltip
            />
            <ElTableColumn fixed="right" label="操作" width="148">
              <template #default="scope">
                <div class="table-actions sensor-table-actions">
                  <ElTooltip content="编辑" placement="top">
                    <ElButton
                      aria-label="编辑型号"
                      circle
                      v-can-write="'selection:write'"
                      @click="editItem(scope.row)"
                    >
                      <Pencil :size="15" aria-hidden="true" />
                    </ElButton>
                  </ElTooltip>
                  <ElTooltip
                    v-if="scope.row.status === '备选'"
                    content="替换现用"
                    placement="top"
                  >
                    <ElButton
                      aria-label="替换现用型号"
                      circle
                      type="primary"
                      v-can-write="'selection:write'"
                      @click="openReplace(scope.row)"
                    >
                      <Replace :size="15" aria-hidden="true" />
                    </ElButton>
                  </ElTooltip>
                  <span
                    v-else
                    aria-hidden="true"
                    class="sensor-table-actions__slot"
                  ></span>
                  <ElTooltip content="删除" placement="top">
                    <ElButton
                      aria-label="删除型号"
                      circle
                      type="danger"
                      v-can-write="'selection:write'"
                      @click="deleteItem(scope.row)"
                    >
                      <Trash2 :size="15" aria-hidden="true" />
                    </ElButton>
                  </ElTooltip>
                </div>
              </template>
            </ElTableColumn>
          </ElTable>
        </div>
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
      </template>
    </section>

    <ElDialog
      v-model="dialogOpen"
      :title="editId ? '编辑 Sensor 型号' : '新增 Sensor 型号'"
      width="680px"
      @closed="resetForm"
      @keyup.enter="saveItem"
    >
      <ElForm label-position="top">
        <div class="form-grid form-grid--three">
          <ElFormItem label="状态" required>
            <ElSelect v-model="form.status" class="w-full" filterable>
              <ElOption
                v-for="option in statusNames"
                :key="option"
                :label="option"
                :value="option"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="料号">
            <ElInput
              v-model="form.partNumber"
              maxlength="80"
              placeholder="可选"
            />
          </ElFormItem>
          <ElFormItem label="感应器类型" required>
            <ElSelect v-model="form.sensorType" class="w-full" filterable>
              <ElOption
                v-for="option in typeNames"
                :key="option"
                :label="option"
                :value="option"
              />
            </ElSelect>
          </ElFormItem>
        </div>
        <div class="form-grid">
          <ElFormItem label="品牌">
            <ElInput v-model="form.brand" maxlength="60" />
          </ElFormItem>
          <ElFormItem label="型号" required>
            <ElInput v-model="form.model" maxlength="100" />
          </ElFormItem>
        </div>
        <ElFormItem label="关联 SOP">
          <ElSelect
            v-model="form.sopId"
            class="w-full"
            clearable
            filterable
            placeholder="可选，关联一份 SOP PDF"
          >
            <ElOption
              v-for="sop in store.sensorSops"
              :key="sop.id"
              :label="sop.title"
              :value="sop.id"
            />
          </ElSelect>
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

    <ElDialog
      v-model="replaceOpen"
      title="用备选替换现用型号"
      width="560px"
      @closed="closeReplace"
    >
      <p v-if="replaceSource" class="sensor-replace-summary">
        备选：
        {{
          [replaceSource.sensorType, replaceSource.brand, replaceSource.model]
            .filter(Boolean)
            .join(' · ')
        }}
      </p>
      <ElForm label-position="top">
        <ElFormItem label="要替换的现用型号" required>
          <ElSelect
            v-model="replaceTargetId"
            class="w-full"
            filterable
            placeholder="同类型优先，也可选其他现用"
          >
            <ElOption
              v-for="item in replaceCandidates"
              :key="item.id"
              :label="candidateLabel(item)"
              :value="item.id"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="问题点" required>
          <ElInput
            v-model="replaceNote"
            :rows="3"
            maxlength="500"
            placeholder="说明因什么问题被替换"
            type="textarea"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="closeReplace">取消</ElButton>
        <ElButton type="primary" @click="confirmReplace">确认替换</ElButton>
      </template>
    </ElDialog>
  </main>
</template>
