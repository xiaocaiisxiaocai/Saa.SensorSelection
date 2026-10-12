<script setup lang="ts">
import { Pencil, Trash2 } from 'lucide-vue-next';
import { reactive, ref } from 'vue';

import type { MachineProcessItem } from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import { useSelectionStore } from '@/stores/selection';

/** 「管理制程」对话框：列出制程，新增 / 编辑 / 删除；父组件调用 open() 打开 */
const emit = defineEmits<{ deleted: [processId: number] }>();
const store = useSelectionStore();

const visible = ref(false);
const editId = ref<number>();
const validationAttempted = ref(false);
const form = reactive({ name: '', sort: 1 });
const dirtyGuard = useDirtyGuard(form);

function resetForm() {
  validationAttempted.value = false;
  editId.value = undefined;
  Object.assign(form, { name: '', sort: store.machineProcesses.length + 1 });
}

function open() {
  resetForm();
  dirtyGuard.markClean();
  visible.value = true;
}

async function edit(item: MachineProcessItem) {
  if (editId.value === item.id) return;
  // 表单里有未保存的输入（新增草稿或正在编辑的另一条）时，切换前先确认，
  // 不静默覆盖。
  const ok = await dirtyGuard.confirmDiscard(
    '切换到编辑其他制程后，本次输入的内容不会被保存。',
  );
  if (!ok) return;
  validationAttempted.value = false;
  editId.value = item.id;
  Object.assign(form, { name: item.name, sort: item.sort });
  dirtyGuard.markClean();
}

async function close() {
  if (await dirtyGuard.confirmClose()) {
    visible.value = false;
  }
}

function save() {
  validationAttempted.value = true;
  const result = store.saveMachineProcess(
    { name: form.name.trim(), sort: form.sort },
    editId.value,
  );
  if (
    notifyResult(result, editId.value ? '制程已更新' : '制程已新增', {
      duplicate: '该制程名称已存在',
      stale: '该制程已被删除，请刷新后重试',
    })
  ) {
    resetForm();
    dirtyGuard.markClean();
  }
}

async function remove(item: MachineProcessItem) {
  const ok = await confirmDelete(
    '删除制程',
    `确认删除“${item.name}”吗？请先清空该制程下全部机型的 Tab 和内容。`,
  );
  if (!ok) return;
  const deleted = notifyResult(
    store.deleteMachineProcess(item.id),
    '制程已删除',
    {
      validation: '默认制程不能删除',
      'not-empty': '请先清空该制程下全部机型的 Tab、内容和示意图',
      stale: '该制程已被删除，请刷新后重试',
    },
  );
  if (!deleted) return;
  // 删掉的正是表单里正在编辑的制程：表单退回“新增制程”，否则再保存会
  // 指向一条已不存在的记录。
  if (editId.value === item.id) {
    resetForm();
    dirtyGuard.markClean();
  }
  emit('deleted', item.id);
}

defineExpose({ open });
</script>

<template>
  <a-modal
    :open="visible"
    title="管理制程"
    :width="520"
    destroy-on-close
    @cancel="close"
  >
    <a-list
      class="machine-process-list"
      :data-source="store.machineProcesses"
      size="small"
      bordered
    >
      <template #renderItem="{ item }">
        <a-list-item>
          <a-list-item-meta
            :title="item.name"
            :description="item.locked ? undefined : `排序 ${item.sort}`"
          />
          <template #actions>
            <a-tooltip title="编辑制程">
              <a-button
                type="text"
                size="small"
                aria-label="编辑制程"
                @click="edit(item)"
              >
                <template #icon><Pencil :size="14" /></template>
              </a-button>
            </a-tooltip>
            <a-tooltip v-if="!item.locked" title="删除制程">
              <a-button
                type="text"
                size="small"
                danger
                aria-label="删除制程"
                @click="remove(item)"
              >
                <template #icon><Trash2 :size="14" /></template>
              </a-button>
            </a-tooltip>
          </template>
        </a-list-item>
      </template>
    </a-list>
    <div class="machine-process-form">
      <a-divider orientation="left">
        {{ editId ? '编辑制程' : '新增制程' }}
      </a-divider>
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item
              html-for="machine-name"
              label="制程名称"
              required
              v-bind="
                fieldError(
                  validationAttempted && !form.name.trim()
                    ? '请输入制程名称'
                    : undefined,
                )
              "
            >
              <a-input
                id="machine-name"
                v-model:value="form.name"
                :maxlength="40"
                placeholder="例如：制程2"
                allow-clear
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item html-for="machine-sort" label="排序">
              <a-input-number
                id="machine-sort"
                v-model:value="form.sort"
                :min="1"
                class="full-width"
              />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <div class="machine-process-form__actions">
        <a-button v-if="editId" @click="resetForm">取消编辑</a-button>
        <a-button type="primary" @click="save">
          {{ editId ? '保存修改' : '新增制程' }}
        </a-button>
      </div>
    </div>
    <template #footer>
      <a-button @click="close">完成</a-button>
    </template>
  </a-modal>
</template>

<style scoped src="./MachineProcessDialog.css"></style>
