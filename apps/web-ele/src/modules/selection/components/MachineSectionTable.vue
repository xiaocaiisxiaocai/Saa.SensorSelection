<script lang="ts" setup>
import type {
  MachineRowImage,
  MachineSectionItem,
  MachineSectionRow,
} from '../data.js';

import { computed, reactive, ref, watch } from 'vue';

import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElPagination,
  ElTable,
  ElTableColumn,
  ElTooltip,
} from 'element-plus';
import {
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-vue-next';

import { MACHINE_ROW_IMAGE_RULES } from '../data.js';
import { validateMachineRowImage } from '../domain.js';
import { useSelectionStore } from '../store';

const props = defineProps<{
  machineName: string;
  section: MachineSectionItem;
}>();

const store = useSelectionStore();
const dialogOpen = ref(false);
const PREVIEW_ZOOM_MIN = 0.25;
const PREVIEW_ZOOM_MAX = 5;
const PREVIEW_ZOOM_STEP = 0.25;

const previewOpen = ref(false);
const previewDataUrl = ref('');
const previewZoom = ref(1);
const previewOffset = ref({ x: 0, y: 0 });
const previewDragging = ref(false);
const previewDragOrigin = ref({ x: 0, y: 0, ox: 0, oy: 0 });
const editId = ref<number>();
const query = ref('');
const form = reactive({
  role: '',
  sensorType: '',
  spec: '',
  purpose: '',
  name: '',
  desc: '',
  note: '',
});
const formImage = ref<MachineRowImage | null>(null);
const imageTouched = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

const isStructure = computed(() => props.section.kind === 'structure');

const labels = computed(() =>
  isStructure.value
    ? {
        role: '功能作用',
        sensorType: '传感器类型',
        spec: '规格',
        purpose: '作用',
        image: '附加图片',
        note: '备注',
      }
    : {
        role: '注意分类',
        name: '事项名称',
        desc: '说明',
        note: '备注',
      },
);

const searchPlaceholder = computed(() =>
  isStructure.value
    ? '搜索功能作用、传感器类型、规格、作用或备注'
    : '搜索注意分类、事项名称、说明或备注',
);

const items = computed(
  () =>
    store.machineSectionRows(
      props.section.id,
      props.machineName,
    ) as MachineSectionRow[],
);

const filteredItems = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  if (!value) return items.value;
  return items.value.filter((item) => {
    const haystack = isStructure.value
      ? [item.role, item.sensorType, item.spec, item.purpose, item.note]
      : [item.role, item.name, item.desc, item.note];
    return haystack
      .join(' ')
      .toLocaleLowerCase('zh-CN')
      .includes(value);
  });
});

const dialogTitle = computed(() => (editId.value ? '编辑记录' : '新增记录'));

const page = ref(1);
const pageSize = ref(20);
const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredItems.value.slice(start, start + pageSize.value);
});

watch(
  () => [props.section.id, props.machineName],
  () => {
    query.value = '';
    page.value = 1;
    dialogOpen.value = false;
    closePreview();
  },
);

watch(query, () => {
  page.value = 1;
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
    role: '',
    sensorType: '',
    spec: '',
    purpose: '',
    name: '',
    desc: '',
    note: '',
  });
  formImage.value = null;
  imageTouched.value = false;
  if (fileInputRef.value) fileInputRef.value.value = '';
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: MachineSectionRow) {
  editId.value = item.id;
  Object.assign(form, {
    role: item.role,
    sensorType: item.sensorType,
    spec: item.spec,
    purpose: item.purpose,
    name: item.name,
    desc: item.desc,
    note: item.note,
  });
  formImage.value = item.image ?? null;
  imageTouched.value = false;
  if (fileInputRef.value) fileInputRef.value.value = '';
  dialogOpen.value = true;
}

function failureMessage(reason: string) {
  if (reason === 'stale') return '该记录已被其他页面删除，请刷新后重试';
  if (reason === 'storage') return '浏览器本地存储不可用，本次修改未保存';
  if (reason === 'size') return '图片大小不能超过 2 MB';
  if (reason === 'type') return '仅支持 JPG、PNG 或 WebP 图片';
  return '请填写必填项';
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(new Error('read failed')));
    reader.readAsDataURL(file);
  });
}

async function handleImageChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  const check = validateMachineRowImage(file.name, file.type, file.size);
  if (!check.ok) {
    ElMessage.error(failureMessage(check.reason));
    return;
  }

  let dataUrl = '';
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch {
    ElMessage.error('图片读取失败，请重试');
    return;
  }

  formImage.value = {
    dataUrl,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  };
  imageTouched.value = true;
}

function clearImage() {
  formImage.value = null;
  imageTouched.value = true;
  if (fileInputRef.value) fileInputRef.value.value = '';
}

const previewScalePercent = computed(
  () => `${Math.round(previewZoom.value * 100)}%`,
);

const previewImageStyle = computed(() => ({
  transform: `translate(${previewOffset.value.x}px, ${previewOffset.value.y}px) scale(${previewZoom.value})`,
}));

function resetPreviewView() {
  previewZoom.value = 1;
  previewOffset.value = { x: 0, y: 0 };
}

function clampPreviewZoom(next: number) {
  return Math.min(
    PREVIEW_ZOOM_MAX,
    Math.max(PREVIEW_ZOOM_MIN, Number(next.toFixed(2))),
  );
}

function setPreviewZoom(next: number) {
  previewZoom.value = clampPreviewZoom(next);
  if (previewZoom.value <= 1) {
    previewOffset.value = { x: 0, y: 0 };
  }
}

function zoomPreviewIn() {
  setPreviewZoom(previewZoom.value + PREVIEW_ZOOM_STEP);
}

function zoomPreviewOut() {
  setPreviewZoom(previewZoom.value - PREVIEW_ZOOM_STEP);
}

function onPreviewWheel(event: WheelEvent) {
  event.preventDefault();
  const delta = event.deltaY > 0 ? -PREVIEW_ZOOM_STEP : PREVIEW_ZOOM_STEP;
  setPreviewZoom(previewZoom.value + delta);
}

function onPreviewPointerDown(event: PointerEvent) {
  if (previewZoom.value <= 1) return;
  previewDragging.value = true;
  previewDragOrigin.value = {
    x: event.clientX,
    y: event.clientY,
    ox: previewOffset.value.x,
    oy: previewOffset.value.y,
  };
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(
    event.pointerId,
  );
}

function onPreviewPointerMove(event: PointerEvent) {
  if (!previewDragging.value) return;
  previewOffset.value = {
    x: previewDragOrigin.value.ox + (event.clientX - previewDragOrigin.value.x),
    y: previewDragOrigin.value.oy + (event.clientY - previewDragOrigin.value.y),
  };
}

function onPreviewPointerUp(event: PointerEvent) {
  if (!previewDragging.value) return;
  previewDragging.value = false;
  (event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(
    event.pointerId,
  );
}

function openPreview(dataUrl: string) {
  previewDataUrl.value = dataUrl;
  resetPreviewView();
  previewOpen.value = true;
}

function closePreview() {
  previewOpen.value = false;
  previewDataUrl.value = '';
  previewDragging.value = false;
  resetPreviewView();
}

function saveItem() {
  const payload: Partial<MachineSectionRow> = {
    role: form.role.trim(),
    sensorType: form.sensorType.trim(),
    spec: form.spec.trim(),
    purpose: form.purpose.trim(),
    name: form.name.trim(),
    desc: form.desc.trim(),
    note: form.note.trim(),
  };

  if (isStructure.value && imageTouched.value) {
    if (formImage.value) {
      const check = validateMachineRowImage(
        formImage.value.fileName,
        formImage.value.mimeType,
        formImage.value.size,
      );
      if (!check.ok) {
        ElMessage.error(failureMessage(check.reason));
        return;
      }
      payload.image = formImage.value;
    } else {
      payload.image = null;
    }
  }

  const result = store.saveMachineSectionRow(
    props.section.id,
    props.machineName,
    payload,
    editId.value,
  );
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }
  dialogOpen.value = false;
  ElMessage.success(editId.value ? '记录已更新' : '记录已新增');
}

async function deleteItem(item: MachineSectionRow) {
  const label = item.sensorType || item.name || item.role;
  try {
    await ElMessageBox.confirm(`确认删除“${label}”吗？`, '删除记录', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  const result = store.deleteMachineSectionRow(
    props.section.id,
    props.machineName,
    item.id,
  );
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }
  ElMessage.success('记录已删除');
}
</script>

<template>
  <section class="data-section">
    <div class="data-section__toolbar">
      <span>
        {{
          query.trim()
            ? `匹配 ${filteredItems.length} / 共 ${items.length} 条`
            : `${items.length} 条记录`
        }}
      </span>
      <div class="data-section__actions">
        <label class="tab-search">
          <Search :size="16" aria-hidden="true" />
          <input
            v-model="query"
            aria-label="搜索记录"
            :placeholder="searchPlaceholder"
            type="search"
          />
          <button
            v-if="query"
            aria-label="清除搜索"
            class="icon-button"
            title="清除搜索"
            type="button"
            @click="query = ''"
          >
            <X :size="15" aria-hidden="true" />
          </button>
        </label>
        <ElButton type="primary" @click="addItem">
          <Plus :size="15" aria-hidden="true" />
          新增
        </ElButton>
      </div>
    </div>

    <div class="table-scroll">
      <ElTable
        :data="tableData"
        :empty-text="query.trim() ? '没有匹配的记录' : '暂无记录'"
        row-key="id"
      >
        <template v-if="isStructure">
          <ElTableColumn :label="labels.role" min-width="120" prop="role" />
          <ElTableColumn
            :label="labels.sensorType"
            min-width="140"
            prop="sensorType"
          />
          <ElTableColumn :label="labels.spec" min-width="140" prop="spec" />
          <ElTableColumn
            :label="labels.purpose"
            min-width="160"
            prop="purpose"
          />
          <ElTableColumn :label="labels.image" min-width="100">
            <template #default="scope">
              <button
                v-if="scope.row.image?.dataUrl"
                aria-label="预览附加图片"
                class="machine-row-thumb-button"
                type="button"
                @click="openPreview(scope.row.image.dataUrl)"
              >
                <img
                  :src="scope.row.image.dataUrl"
                  alt=""
                  class="machine-row-thumb"
                />
              </button>
              <span v-else>—</span>
            </template>
          </ElTableColumn>
          <ElTableColumn :label="labels.note" min-width="150" prop="note" />
        </template>
        <template v-else>
          <ElTableColumn :label="labels.role" min-width="120" prop="role" />
          <ElTableColumn :label="labels.name" min-width="180" prop="name" />
          <ElTableColumn :label="labels.desc" min-width="260" prop="desc" />
          <ElTableColumn :label="labels.note" min-width="150" prop="note" />
        </template>
        <ElTableColumn fixed="right" label="操作" width="104">
          <template #default="scope">
            <div class="table-actions">
              <ElTooltip content="编辑" placement="top">
                <ElButton aria-label="编辑" circle @click="editItem(scope.row)">
                  <Pencil :size="15" aria-hidden="true" />
                </ElButton>
              </ElTooltip>
              <ElTooltip content="删除" placement="top">
                <ElButton
                  aria-label="删除"
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
    </div>

    <div v-if="filteredItems.length > pageSize" class="table-pagination">
      <ElPagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[20, 50, 100]"
        :total="filteredItems.length"
        background
        layout="total, sizes, prev, pager, next"
      />
    </div>

    <ElDialog
      v-model="dialogOpen"
      :title="dialogTitle"
      width="520px"
      @closed="resetForm"
      @keyup.enter="saveItem"
    >
      <ElForm label-position="top" @submit.prevent="saveItem">
        <template v-if="isStructure">
          <div class="form-grid">
            <ElFormItem :label="labels.role" required>
              <ElInput v-model="form.role" maxlength="80" />
            </ElFormItem>
            <ElFormItem :label="labels.sensorType" required>
              <ElInput v-model="form.sensorType" maxlength="80" />
            </ElFormItem>
          </div>
          <ElFormItem :label="labels.spec">
            <ElInput v-model="form.spec" maxlength="200" />
          </ElFormItem>
          <ElFormItem :label="labels.purpose">
            <ElInput
              v-model="form.purpose"
              :rows="3"
              maxlength="500"
              type="textarea"
            />
          </ElFormItem>
          <ElFormItem :label="labels.image">
            <div class="machine-row-image-field">
              <input
                ref="fileInputRef"
                :accept="MACHINE_ROW_IMAGE_RULES.accept"
                type="file"
                @change="handleImageChange"
              />
              <div v-if="formImage?.dataUrl" class="machine-row-image-preview">
                <img
                  :src="formImage.dataUrl"
                  alt=""
                  class="machine-row-thumb"
                />
                <span class="machine-row-image-name">{{
                  formImage.fileName
                }}</span>
                <ElButton size="small" @click="clearImage">清除</ElButton>
              </div>
            </div>
          </ElFormItem>
          <ElFormItem :label="labels.note">
            <ElInput v-model="form.note" maxlength="200" />
          </ElFormItem>
        </template>
        <template v-else>
          <div class="form-grid">
            <ElFormItem :label="labels.role" required>
              <ElInput v-model="form.role" maxlength="80" />
            </ElFormItem>
            <ElFormItem :label="labels.name" required>
              <ElInput v-model="form.name" maxlength="80" />
            </ElFormItem>
          </div>
          <ElFormItem :label="labels.desc">
            <ElInput
              v-model="form.desc"
              :rows="3"
              maxlength="500"
              type="textarea"
            />
          </ElFormItem>
          <ElFormItem :label="labels.note">
            <ElInput v-model="form.note" maxlength="200" />
          </ElFormItem>
        </template>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogOpen = false">取消</ElButton>
        <ElButton type="primary" @click="saveItem">
          <Save :size="15" aria-hidden="true" />
          保存
        </ElButton>
      </template>
    </ElDialog>

    <ElDialog
      v-model="previewOpen"
      class="machine-row-preview-dialog"
      title="附加图片预览"
      width="860px"
      @closed="closePreview"
    >
      <div class="machine-row-preview-shell">
        <div class="machine-row-preview-toolbar">
          <span>滚轮缩放 · 放大后可拖拽平移</span>
          <div class="machine-row-preview-toolbar__zoom">
            <ElTooltip content="缩小" placement="top">
              <ElButton
                :disabled="previewZoom <= PREVIEW_ZOOM_MIN"
                aria-label="缩小"
                circle
                size="small"
                @click="zoomPreviewOut"
              >
                <Minus :size="14" aria-hidden="true" />
              </ElButton>
            </ElTooltip>
            <strong>{{ previewScalePercent }}</strong>
            <ElTooltip content="放大" placement="top">
              <ElButton
                :disabled="previewZoom >= PREVIEW_ZOOM_MAX"
                aria-label="放大"
                circle
                size="small"
                @click="zoomPreviewIn"
              >
                <Plus :size="14" aria-hidden="true" />
              </ElButton>
            </ElTooltip>
            <ElTooltip content="重置缩放" placement="top">
              <ElButton
                aria-label="重置缩放"
                circle
                size="small"
                @click="resetPreviewView"
              >
                <RotateCcw :size="14" aria-hidden="true" />
              </ElButton>
            </ElTooltip>
          </div>
        </div>
        <div
          :class="{ 'is-draggable': previewZoom > 1 }"
          class="machine-row-preview-viewport"
          @pointercancel="onPreviewPointerUp"
          @pointerdown="onPreviewPointerDown"
          @pointermove="onPreviewPointerMove"
          @pointerup="onPreviewPointerUp"
          @wheel.prevent="onPreviewWheel"
        >
          <img
            v-if="previewDataUrl"
            :src="previewDataUrl"
            :style="previewImageStyle"
            alt=""
            class="machine-row-preview-image"
            draggable="false"
          />
        </div>
      </div>
    </ElDialog>
  </section>
</template>
