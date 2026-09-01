<script setup lang="ts">
import { Pencil, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';

import {
  MACHINE_ROW_IMAGE_RULES,
  isSensorStatus,
  sensorStatusRank,
  type MachineRowImage,
  type MachineSectionItem,
  type MachineSectionRow,
  type SensorItem,
} from '@/domain';
import { readDataUrl } from '@/pages/shared/files';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { buildMachineTableRows, type MachineTableRow } from './table-rows';
import {
  ABadge,
  AButton,
  AField,
  AFileDrop,
  AFilterResetButton,
  AFormGrid,
  AFormRow,
  AIconButton,
  AImageViewer,
  APagination,
  ASearchField,
  ASelect,
  ASheet,
  ATable,
  ATextArea,
  ATokenField,
  type SelectOption,
  type TableColumn,
} from '@/ui';

const props = defineProps<{
  machineName: string;
  processId: number;
  section: MachineSectionItem;
}>();

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));
const dialogOpen = ref(false);
const editId = ref<number>();
const query = ref('');
const sensorTypeFilters = ref<Array<string | number>>([]);
const processStepFilter = ref<string | number | null>(null);
const preview = ref<MachineRowImage | null>(null);
const imageOpen = computed({
  get: () => Boolean(preview.value),
  set: (open: boolean) => {
    if (!open) preview.value = null;
  },
});
const page = ref(1);
const pageSize = ref(20);
const form = reactive({
  boardCharacteristicId: null as number | null,
  desc: '',
  machineModelId: null as number | null,
  name: '',
  note: '',
  processStepId: null as number | null,
  purpose: '',
  role: '',
  sensorIds: [] as Array<string | number>,
});

const isStructure = computed(() => props.section.kind === 'structure');
const typeOptions = computed<SelectOption[]>(() =>
  store
    .dictionaryNames('sensor-type')
    .map((name) => ({ label: name, value: name })),
);
const processStepOptions = computed<SelectOption[]>(() =>
  store.processSteps.map((item) => ({
    label: `${item.layer} · ${item.name}`,
    value: item.id,
  })),
);
const machineModelItems = computed(() =>
  store.dictionaryItems('machine-model'),
);
const machineModelOptions = computed<SelectOption[]>(() =>
  machineModelItems.value.map((item) => ({ label: item.name, value: item.id })),
);
const boardCharacteristicItems = computed(() =>
  store.dictionaryItems('board-characteristic'),
);
const boardCharacteristicOptions = computed<SelectOption[]>(() =>
  boardCharacteristicItems.value.map((item) => ({
    label: item.name,
    value: item.id,
  })),
);
const sensorOptions = computed<SelectOption[]>(() =>
  [...store.sensors]
    .sort((left, right) => {
      if (left.status === right.status) return left.id - right.id;
      return sensorStatusRank(left.status) - sensorStatusRank(right.status);
    })
    .map((item) => ({
      value: item.id,
      label: sensorOptionLabel(item),
    })),
);
const images = computed(() =>
  isStructure.value
    ? store.machineSectionImages(
        props.section.id,
        props.machineName,
        props.processId,
      )
    : [],
);
const items = computed(() =>
  store.machineSectionRows(
    props.section.id,
    props.machineName,
    props.processId,
  ),
);
const hasTabContent = computed(() => items.value.length > 0);
const hasActiveFilters = computed(
  () =>
    Boolean(query.value.trim()) ||
    sensorTypeFilters.value.length > 0 ||
    processStepFilter.value !== null,
);
const filtered = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  return items.value.filter((item) => {
    if (
      isStructure.value &&
      sensorTypeFilters.value.length > 0 &&
      !sensorRecords(item).some((sensor) =>
        sensorTypeFilters.value.includes(sensor.sensorType),
      )
    ) {
      return false;
    }
    if (
      isStructure.value &&
      processStepFilter.value !== null &&
      item.processStepId !== Number(processStepFilter.value)
    ) {
      return false;
    }
    const haystack = isStructure.value
      ? [
          item.role,
          dictionaryLabel(machineModelItems.value, item.machineModelId),
          processStepLabel(item.processStepId),
          dictionaryLabel(
            boardCharacteristicItems.value,
            item.boardCharacteristicId,
          ),
          sensorTypesLabel(item),
          sensorSpecsLabel(item),
          item.purpose,
          item.note,
        ]
      : [item.role, item.name, item.desc, item.note];
    return (
      !value || haystack.join(' ').toLocaleLowerCase('zh-CN').includes(value)
    );
  });
});
const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return buildMachineTableRows(
    filtered.value.slice(start, start + pageSize.value),
    store.sensors,
    isStructure.value,
    store.processSteps,
    machineModelItems.value,
    boardCharacteristicItems.value,
  );
});
const columns = computed<TableColumn<MachineTableRow>[]>(() => {
  const rowSpan = isStructure.value
    ? (row: MachineTableRow) => (row.groupStart ? row.groupSize : 0)
    : undefined;
  const cols: TableColumn<MachineTableRow>[] = isStructure.value
    ? [
        { key: 'role', label: '功能作用', minWidth: 90, rowSpan },
        { key: 'machineModelName', label: '机型', minWidth: 100, rowSpan },
        {
          key: 'processStepName',
          label: '工艺制程',
          minWidth: 110,
          rowSpan,
        },
        {
          key: 'boardCharacteristicName',
          label: '板件特性',
          minWidth: 120,
          rowSpan,
        },
        { key: 'sensorType', label: '传感器类型', minWidth: 100 },
        { key: 'spec', label: '规格', minWidth: 220, ellipsis: true },
        {
          key: 'purpose',
          label: '作用',
          minWidth: 120,
          ellipsis: true,
          rowSpan,
        },
        { key: 'note', label: '备注', minWidth: 96, ellipsis: true, rowSpan },
      ]
    : [
        { key: 'role', label: '注意分类', width: 120 },
        { key: 'name', label: '事项名称', minWidth: 140 },
        { key: 'desc', label: '说明', minWidth: 180, ellipsis: true },
        { key: 'note', label: '备注', minWidth: 120, ellipsis: true },
      ];
  if (writable.value) {
    cols.push({
      key: 'actions',
      label: '操作',
      width: 72,
      fixed: 'end',
      rowSpan,
    });
  }
  return cols;
});

watch(
  () => [props.section.id, props.machineName, props.processId] as const,
  () => {
    query.value = '';
    sensorTypeFilters.value = [];
    processStepFilter.value = null;
    page.value = 1;
    dialogOpen.value = false;
    preview.value = null;
  },
);
watch([query, sensorTypeFilters, processStepFilter, pageSize], () => {
  page.value = 1;
});

function sensorRecords(item: MachineSectionRow): SensorItem[] {
  return (item.sensorIds ?? [])
    .map((id) => store.sensors.find((sensor) => sensor.id === id))
    .filter((item): item is SensorItem => Boolean(item));
}

function resetFilters() {
  query.value = '';
  sensorTypeFilters.value = [];
  processStepFilter.value = null;
  page.value = 1;
}

function processStepLabel(id: number | null) {
  if (id === null) return '';
  const item = store.processSteps.find((candidate) => candidate.id === id);
  return item ? `${item.layer} · ${item.name}` : '';
}

function dictionaryLabel(
  items: Array<{ id: number; name: string }>,
  id: number | null,
) {
  if (id === null) return '';
  return items.find((item) => item.id === id)?.name ?? '';
}

function sensorTypesLabel(item: MachineSectionRow) {
  const types = [
    ...new Set(sensorRecords(item).map((sensor) => sensor.sensorType)),
  ];
  return types.length > 0 ? types.join('、') : item.sensorType || '—';
}

function sensorTypeList(item: MachineTableRow) {
  if (item.sensor) return [item.sensor.sensorType];
  return item.sensorType ? [item.sensorType] : [];
}

function sensorSpecsLabel(item: MachineSectionRow) {
  const records = sensorRecords(item);
  if (records.length === 0) return item.spec || '—';
  return records
    .map(
      (sensor) =>
        `${sensor.brand} ${sensor.model} · ${sensor.spec || '未填写规格'}`,
    )
    .join('\n');
}

function sensorOptionLabel(item: SensorItem) {
  const name = [item.brand, item.model].filter(Boolean).join(' ');
  const title = [item.sensorType, name].filter(Boolean).join(' · ');
  return isSensorStatus(item.status, 'current')
    ? title
    : `${title}（${item.status}）`;
}

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    boardCharacteristicId: null,
    desc: '',
    machineModelId: null,
    name: '',
    note: '',
    processStepId: null,
    purpose: '',
    role: '',
    sensorIds: [],
  });
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: MachineSectionRow) {
  editId.value = item.id;
  Object.assign(form, {
    boardCharacteristicId: item.boardCharacteristicId,
    desc: item.desc,
    machineModelId: item.machineModelId,
    name: item.name,
    note: item.note,
    processStepId: item.processStepId,
    purpose: item.purpose,
    role: item.role,
    sensorIds: [...item.sensorIds],
  });
  dialogOpen.value = true;
}

function saveItem() {
  const result = store.saveMachineSectionRow(
    props.section.id,
    props.machineName,
    {
      desc: form.desc.trim(),
      machineModelId: isStructure.value ? form.machineModelId : null,
      name: form.name.trim(),
      note: form.note.trim(),
      processStepId: isStructure.value ? form.processStepId : null,
      boardCharacteristicId: isStructure.value
        ? form.boardCharacteristicId
        : null,
      purpose: form.purpose.trim(),
      role: form.role.trim(),
      sensorIds: form.sensorIds.map(Number),
    },
    editId.value,
    props.processId,
  );
  if (
    toastResult(result, editId.value ? '记录已更新' : '记录已新增', {
      validation: isStructure.value
        ? '请填写功能作用并选择关联传感器'
        : '请填写注意分类和事项名称',
    })
  ) {
    dialogOpen.value = false;
  }
}

async function deleteItem(item: MachineSectionRow) {
  const label = item.role || item.name;
  const ok = await confirmDelete('删除记录', `确认删除“${label}”吗？`);
  if (!ok) return;
  toastResult(
    store.deleteMachineSectionRow(
      props.section.id,
      props.machineName,
      item.id,
      props.processId,
    ),
    '记录已删除',
  );
}

async function addImages(files: File[]) {
  const next = [...images.value];
  for (const file of files) {
    if (next.length >= 2) break;
    next.push({
      dataUrl: await readDataUrl(file),
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    });
  }
  toastResult(
    store.saveMachineSectionImages(
      props.section.id,
      props.machineName,
      next,
      props.processId,
    ),
    '示意图已更新',
    {
      size: '图片大小不能超过 2 MB',
      type: '仅支持 JPG、PNG 或 WebP 图片',
    },
  );
}

async function removeImage(index: number) {
  const item = images.value[index];
  if (!item) return;
  const ok = await confirmDelete(
    '删除示意图',
    `确认删除“${item.fileName}”吗？`,
  );
  if (!ok) return;
  const next = images.value.filter((_, current) => current !== index);
  toastResult(
    store.saveMachineSectionImages(
      props.section.id,
      props.machineName,
      next,
      props.processId,
    ),
    '示意图已删除',
  );
}
</script>

<template>
  <div
    class="machine-body"
    :class="{ 'machine-body--with-images': isStructure }"
  >
    <div class="selection-panel">
      <div class="selection-toolbar">
        <ATokenField
          v-if="isStructure"
          v-model="sensorTypeFilters"
          class="selection-toolbar__filter"
          :options="typeOptions"
          placeholder="传感器类型"
          :max-visible-tokens="1"
        />
        <ASelect
          v-if="isStructure"
          v-model="processStepFilter"
          class="selection-toolbar__filter"
          :options="processStepOptions"
          placeholder="工艺制程"
          filterable
          clearable
        />
        <ASearchField
          v-model="query"
          class="selection-toolbar__filter"
          :placeholder="
            isStructure
              ? '搜索功能作用、机型、工艺制程、板件特性、传感器类型、规格、作用或备注'
              : '搜索注意分类、事项名称、说明或备注'
          "
        />
        <AFilterResetButton :active="hasActiveFilters" @reset="resetFilters" />
        <AButton v-if="writable" variant="filled" @click="addItem">
          新增
        </AButton>
      </div>
      <ATable
        :columns="columns"
        :rows="tableData"
        row-key="displayId"
        :empty-text="
          query.trim() ||
            sensorTypeFilters.length ||
            processStepFilter !== null
            ? '没有匹配的记录'
            : '暂无记录'
        "
        striped
      >
        <template v-if="isStructure" #cell-sensorType="{ row }">
          <div v-if="sensorTypeList(row).length" class="badge-wrap">
            <ABadge
              v-for="type in sensorTypeList(row)"
              :key="type"
              :label="type"
              tone="blue"
            />
          </div>
          <span v-else>—</span>
        </template>
        <template v-if="isStructure" #cell-spec="{ row }">
          <div class="spec-lines">{{ row.spec || '—' }}</div>
        </template>
        <template #cell-actions="{ row }">
          <div class="table-actions">
            <AIconButton
              :icon="Pencil"
              label="编辑"
              size="small"
              @click="editItem(row.source)"
            />
            <AIconButton
              :icon="Trash2"
              label="删除"
              size="small"
              variant="destructive"
              @click="deleteItem(row.source)"
            />
          </div>
        </template>
      </ATable>
      <APagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="filtered.length"
      />
    </div>
    <aside v-if="isStructure" class="machine-images">
      <h3>结构示意图</h3>
      <AFileDrop
        v-if="writable && hasTabContent && images.length < 2"
        :accept="MACHINE_ROW_IMAGE_RULES.accept"
        :max-bytes="MACHINE_ROW_IMAGE_RULES.maxBytes"
        :extensions="[...MACHINE_ROW_IMAGE_RULES.extensions]"
        :mime-types="[...MACHINE_ROW_IMAGE_RULES.mimeTypes]"
        title="添加图片"
        hint=""
        size-message="图片大小不能超过 2 MB"
        type-message="仅支持 JPG、PNG 或 WebP 图片"
        @files="addImages"
      />
      <p v-else-if="writable && !hasTabContent" class="machine-images__empty">
        请先新增内容后再添加图片
      </p>
      <button
        v-for="(image, index) in images"
        :key="`${image.fileName}-${index}`"
        class="image-card"
        type="button"
        @click="preview = image"
      >
        <img :src="image.dataUrl" :alt="image.fileName">
        <span>{{ image.fileName }}</span>
        <AIconButton
          v-if="writable"
          :icon="Trash2"
          label="删除"
          size="small"
          variant="destructive"
          @click.stop="removeImage(index)"
        />
      </button>
    </aside>
  </div>
  <ASheet
    v-model:open="dialogOpen"
    :title="editId ? '编辑记录' : '新增记录'"
    :width="isStructure ? 640 : 480"
  >
    <AFormGrid v-if="isStructure" :columns="1">
      <AFormRow label="功能作用" required>
        <AField v-model="form.role" :maxlength="80" />
      </AFormRow>
      <AFormRow label="机型" hint="可选；来自“数据字典 → 机型”。">
        <ASelect
          v-model="form.machineModelId"
          :options="machineModelOptions"
          placeholder="选择机型（可选）"
          filterable
          clearable
        />
      </AFormRow>
      <AFormRow
        label="工艺制程"
        hint="可选；来自“制程管理 → 工艺制程”。"
      >
        <ASelect
          v-model="form.processStepId"
          :options="processStepOptions"
          placeholder="选择工艺制程（可选）"
          filterable
          clearable
        />
      </AFormRow>
      <AFormRow
        label="板件特性"
        hint="可选；来自“数据字典 → 板件特性”。"
      >
        <ASelect
          v-model="form.boardCharacteristicId"
          :options="boardCharacteristicOptions"
          placeholder="选择板件特性（可选）"
          filterable
          clearable
        />
      </AFormRow>
      <AFormRow
        label="关联传感器"
        required
        hint="规格和型号来自 Sensor型号；目录替换后这里会自动更新。"
      >
        <ATokenField
          v-model="form.sensorIds"
          :options="sensorOptions"
          filterable
          :max-visible-tokens="2"
          placeholder="按类型、品牌或型号搜索"
        />
      </AFormRow>
      <AFormRow label="作用">
        <ATextArea v-model="form.purpose" :rows="3" :maxlength="500" />
      </AFormRow>
      <AFormRow label="备注">
        <AField v-model="form.note" :maxlength="200" />
      </AFormRow>
    </AFormGrid>
    <AFormGrid v-else :columns="1">
      <AFormRow label="注意分类" required>
        <AField v-model="form.role" :maxlength="80" />
      </AFormRow>
      <AFormRow label="事项名称" required>
        <AField v-model="form.name" :maxlength="80" />
      </AFormRow>
      <AFormRow label="说明">
        <ATextArea v-model="form.desc" :rows="3" :maxlength="500" />
      </AFormRow>
      <AFormRow label="备注">
        <AField v-model="form.note" :maxlength="200" />
      </AFormRow>
    </AFormGrid>
    <template #footer>
      <AButton @click="dialogOpen = false">取消</AButton>
      <AButton variant="filled" @click="saveItem">保存</AButton>
    </template>
  </ASheet>
  <AImageViewer
    v-if="preview"
    v-model:open="imageOpen"
    :src="preview.dataUrl"
    :alt="preview.fileName"
  />
</template>
