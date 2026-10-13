<script setup lang="ts">
import { reactive, ref } from 'vue';

import type { MachineCatalogKind, MachineSectionKind } from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { notifyResult } from '@/pages/shared/save-feedback';
import { useSelectionStore } from '@/stores/selection';

/**
 * 新增 / 编辑机型 Tab（当前目录共用）；父组件调用 openAdd() / openEdit() 打开。
 * 保存成功后发出 saved，带上 Tab id，新建时页面据此切到新 Tab。
 */
const props = defineProps<{ catalog: MachineCatalogKind }>();
const emit = defineEmits<{ saved: [tabId: number] }>();
const store = useSelectionStore();

const KIND_OPTIONS = [
  { label: '结构', value: 'structure' },
  { label: '机型注意事项', value: 'notes' },
];

const visible = ref(false);
const editId = ref<number>();
const validationAttempted = ref(false);
const form = reactive({
  kind: 'structure' as MachineSectionKind,
  name: '',
  sort: 1,
});
const dirtyGuard = useDirtyGuard(form);

function show(id: number | undefined, values: typeof form) {
  validationAttempted.value = false;
  editId.value = id;
  Object.assign(form, values);
  dirtyGuard.markClean();
  visible.value = true;
}

function openAdd(sort: number) {
  show(undefined, { kind: 'structure', name: '', sort });
}

function openEdit(section: {
  id: number;
  kind: MachineSectionKind;
  name: string;
  sort: number;
}) {
  show(section.id, {
    kind: section.kind,
    name: section.name,
    sort: section.sort,
  });
}

async function cancel() {
  if (await dirtyGuard.confirmClose()) {
    visible.value = false;
  }
}

function save() {
  validationAttempted.value = true;
  const result = store.saveMachineTab(
    props.catalog,
    { kind: form.kind, name: form.name.trim(), sort: form.sort },
    editId.value,
  );
  if (
    notifyResult(result, editId.value ? 'Tab 已更新' : 'Tab 已新增', {
      duplicate: '该 Tab 名称已存在',
      'not-empty': '该 Tab 下的二级 Tab 已有内容，不能修改类型',
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
    :title="editId ? '编辑 Tab' : '新增 Tab'"
    :width="420"
    destroy-on-close
    @cancel="cancel"
  >
    <a-form layout="vertical">
      <a-row :gutter="16">
        <a-col :span="24">
          <a-form-item
            html-for="machine-name-2"
            label="Tab 名称"
            required
            v-bind="
              fieldError(
                validationAttempted && !form.name.trim()
                  ? '请输入 Tab 名称'
                  : undefined,
              )
            "
          >
            <a-input
              id="machine-name-2"
              v-model:value="form.name"
              :maxlength="40"
              allow-clear
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item html-for="machine-kind" label="Tab 类型" required>
            <a-select
              id="machine-kind"
              v-model:value="form.kind"
              :options="KIND_OPTIONS"
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item html-for="machine-sort-2" label="排序">
            <a-input-number
              id="machine-sort-2"
              v-model:value="form.sort"
              :min="1"
              class="full-width"
            />
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
    <template #footer>
      <a-button @click="cancel">取消</a-button>
      <a-button type="primary" @click="save">保存</a-button>
    </template>
  </a-modal>
</template>
