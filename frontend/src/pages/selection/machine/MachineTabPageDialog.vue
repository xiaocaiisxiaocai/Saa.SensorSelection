<script setup lang="ts">
import { reactive, ref } from 'vue';

import type { MachineTab, MachineTabPage } from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { notifyResult } from '@/pages/shared/save-feedback';
import { useSelectionStore } from '@/stores/selection';

/**
 * 新建 / 改名二级 Tab；父组件调用 openAdd(tab) / openEdit(tab, page) 打开。
 * 保存成功后发出 saved，带上二级 Tab 的 id，新建时页面据此切过去。
 */
const emit = defineEmits<{ saved: [pageId: number] }>();
const store = useSelectionStore();

const visible = ref(false);
const tab = ref<MachineTab | null>(null);
const editId = ref<number>();
const validationAttempted = ref(false);
const form = reactive({ name: '' });
const dirtyGuard = useDirtyGuard(form);

function show(target: MachineTab, page?: MachineTabPage) {
  validationAttempted.value = false;
  tab.value = target;
  editId.value = page?.id;
  form.name = page?.name ?? '';
  dirtyGuard.markClean();
  visible.value = true;
}

const openAdd = (target: MachineTab) => show(target);
const openEdit = (target: MachineTab, page: MachineTabPage) =>
  show(target, page);

async function cancel() {
  if (await dirtyGuard.confirmClose()) {
    visible.value = false;
  }
}

function save() {
  if (!tab.value) return;
  validationAttempted.value = true;
  if (!form.name.trim()) return;
  const result = store.saveMachineTabPage(
    tab.value.id,
    { name: form.name.trim() },
    editId.value,
  );
  if (
    notifyResult(result, editId.value ? '已改名' : '二级 Tab 已新建', {
      duplicate: `「${tab.value.name}」下已有同名的二级 Tab`,
      stale: '该 Tab 已被删除，请刷新后重试',
    })
  ) {
    visible.value = false;
    if (result.ok) emit('saved', result.item.id);
  }
}

defineExpose({ openAdd, openEdit });
</script>

<template>
  <a-modal
    :open="visible"
    :title="
      editId ? '二级 Tab 改名' : `在「${tab?.name ?? ''}」下新建二级 Tab`
    "
    :width="420"
    destroy-on-close
    @cancel="cancel"
  >
    <a-form layout="vertical" @submit="save">
      <a-form-item
        html-for="machine-tab-page-name"
        label="名称"
        required
        v-bind="
          fieldError(
            validationAttempted && !form.name.trim() ? '请输入名称' : undefined,
          )
        "
      >
        <a-input
          id="machine-tab-page-name"
          v-model:value="form.name"
          :maxlength="40"
          allow-clear
          show-count
          placeholder="如：入料输送（L-RACK）"
        />
      </a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="cancel">取消</a-button>
      <a-button type="primary" @click="save">保存</a-button>
    </template>
  </a-modal>
</template>
