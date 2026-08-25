<script setup lang="ts">
import { Pencil, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';

import {
  MACHINE_ROW_IMAGE_RULES,
  type MachineRowImage,
  type MachineSectionItem,
  type MachineSectionRow,
  type SensorItem,
} from '@/domain';
import { readDataUrl } from '@/pages/shared/files';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import {
  buildMachineTableRows,
  type MachineTableRow,
} from './table-rows';
import {
  ABadge,
  AButton,
  AField,
  AFileDrop,
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
  section: MachineSectionItem;
}>();

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));
const dialogOpen = ref(false);
const editId = ref<number>();
const query = ref('');
const sensorTypeFilter = ref<string | null>(null);
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
  desc: '',
  name: '',
  note: '',
  purpose: '',
  role: '',
  sensorIds: [] as Array<string | number>,
});

const isStructure = computed(() => props.section.kind === 'structure');
const typeOptions = computed<SelectOption[]>(() =>
  store.dictionaryNames('sensor-type').map((name) => ({ label: name, value: name })),
);
const sensorOptions = computed<SelectOption[]>(() =>
  [...store.sensors]
    .sort((left, right) => {
      if (left.status === right.status) return left.id - right.id;
      if (left.status === '现用') return -1;
      if (right.status === '现用') return 1;
      return left.status === '备选' ? -1 : 1;
    })
    .map((item) => ({
      value: item.id,
      label: sensorOptionLabel(item),
    })),
);
const images = computed(() =>
  isStructure.value
    ? store.machineSectionImages(props.section.id, props.machineName)
    : [],
);
const items = computed(() =>
  store.machineSectionRows(props.section.id, props.machineName),
);
const filtered = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  return items.value.filter((item) => {
    if (
      isStructure.value &&
      sensorTypeFilter.value &&
      !sensorRecords(item).some(
        (sensor) => sensor.sensorType === sensorTypeFilter.value,
      )
    ) {
      return false;
    }
    const haystack = isStructure.value
      ? [item.role, sensorTypesLabel(item), sensorSpecsLabel(item), item.purpose, item.note]
      : [item.role, item.name, item.desc, item.note];
    return !value || haystack.join(' ').toLocaleLowerCase('zh-CN').includes(value);
  });
});
const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return buildMachineTableRows(
    filtered.value.slice(start, start + pageSize.value),
    store.sensors,
    isStructure.value,
  );
});
const columns = computed<TableColumn<MachineTableRow>[]>(() => {
  const rowSpan = isStructure.value
    ? (row: MachineTableRow) => (row.groupStart ? row.groupSize : 0)
    : undefined;
  const cols: TableColumn<MachineTableRow>[] = isStructure.value
    ? [
        { key: 'role', label: '功能作用', minWidth: 100, rowSpan },
        { key: 'sensorType', label: '传感器类型', minWidth: 110 },
        { key: 'spec', label: '规格', minWidth: 260, ellipsis: true },
        { key: 'purpose', label: '作用', minWidth: 150, ellipsis: true, rowSpan },
        { key: 'note', label: '备注', minWidth: 130, ellipsis: true, rowSpan },
      ]
    : [
        { key: 'role', label: '注意分类', width: 120 },
        { key: 'name', label: '事项名称', minWidth: 140 },
        { key: 'desc', label: '说明', minWidth: 180, ellipsis: true },
        { key: 'note', label: '备注', minWidth: 120, ellipsis: true },
      ];
  if (writable.value) {
    cols.push({ key: 'actions', label: '操作', width: 96, fixed: 'end', rowSpan });
  }
  return cols;
});

watch(
  () => [props.section.id, props.machineName] as const,
  () => {
    query.value = '';
    sensorTypeFilter.value = null;
    page.value = 1;
    dialogOpen.value = false;
    preview.value = null;
  },
);
watch([query, sensorTypeFilter, pageSize], () => {
  page.value = 1;
});

function sensorRecords(item: MachineSectionRow): SensorItem[] {
  return (item.sensorIds ?? [])
    .map((id) => store.sensors.find((sensor) => sensor.id === id))
    .filter((item): item is SensorItem => Boolean(item));
}

function sensorTypesLabel(item: MachineSectionRow) {
  const types = [...new Set(sensorRecords(item).map((sensor) => sensor.sensorType))];
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
  return item.status === '现用' ? title : `${title}（${item.status}）`;
}

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    desc: '',
    name: '',
    note: '',
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
    desc: item.desc,
    name: item.name,
    note: item.note,
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
      name: form.name.trim(),
      note: form.note.trim(),
      purpose: form.purpose.trim(),
      role: form.role.trim(),
      sensorIds: form.sensorIds.map(Number),
    },
    editId.value,
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
    store.deleteMachineSectionRow(props.section.id, props.machineName, item.id),
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
    store.saveMachineSectionImages(props.section.id, props.machineName, next),
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
  const ok = await confirmDelete('删除示意图', `确认删除“${item.fileName}”吗？`);
  if (!ok) return;
  const next = images.value.filter((_, current) => current !== index);
  toastResult(
    store.saveMachineSectionImages(props.section.id, props.machineName, next),
    '示意图已删除',
  );
}
</script>

<template>
  <div class="machine-body" :class="{ 'machine-body--with-images': isStructure }">
    <div class="selection-panel">
      <div class="selection-toolbar">
        <ASelect
          v-if="isStructure"
          v-model="sensorTypeFilter"
          class="selection-toolbar__filter"
          :options="typeOptions"
          placeholder="传感器类型"
          clearable
        />
        <ASearchField
          v-model="query"
          class="selection-toolbar__filter"
          :placeholder="
            isStructure
              ? '搜索功能作用、传感器类型、规格、作用或备注'
              : '搜索注意分类、事项名称、说明或备注'
          "
        />
        <AButton v-if="writable" variant="filled" @click="addItem">新增</AButton>
      </div>
      <ATable
        :columns="columns"
        :rows="tableData"
        row-key="displayId"
        :empty-text="
          query.trim() || sensorTypeFilter ? '没有匹配的记录' : '暂无记录'
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
      <p>一个结构最多 2 张</p>
      <AFileDrop
        v-if="writable && images.length < 2"
        :accept="MACHINE_ROW_IMAGE_RULES.accept"
        :max-bytes="MACHINE_ROW_IMAGE_RULES.maxBytes"
        :extensions="[...MACHINE_ROW_IMAGE_RULES.extensions]"
        :mime-types="[...MACHINE_ROW_IMAGE_RULES.mimeTypes]"
        hint="+ 添加"
        size-message="图片大小不能超过 2 MB"
        type-message="仅支持 JPG、PNG 或 WebP 图片"
        @files="addImages"
      />
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
      <p v-if="images.length === 0">
        暂无示意图。上传后会在此结构下统一展示，不会重复到每个功能行。
      </p>
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
