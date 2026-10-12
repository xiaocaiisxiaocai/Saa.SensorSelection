<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import type { MachineCatalogKind } from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { notifyResult } from '@/pages/shared/save-feedback';
import { useSelectionStore } from '@/stores/selection';

import { visibleEntityGroups } from './entity-labels';

/** 新建 / 编辑机型分类下的「配置」；父组件调用 openCreate() / openEdit() */
const props = defineProps<{ machineType?: MachineCatalogKind }>();

const store = useSelectionStore();
const visible = ref(false);
const editing = ref<string>();
const validationAttempted = ref(false);
const form = reactive({ category: '', name: '', sort: 1 });
const dirtyGuard = useDirtyGuard(form);

const groups = computed(() =>
  visibleEntityGroups(
    store.entityGroups('machine'),
    'machine',
    props.machineType,
  ),
);
const categoryOptions = computed(() =>
  groups.value.map((group) => ({ label: group.name, value: group.name })),
);
const configurationsOf = (category: string) =>
  groups.value.find((group) => group.name === category)?.configurations ?? [];

function show(category: string, name: string | undefined, sort: number) {
  validationAttempted.value = false;
  editing.value = name;
  Object.assign(form, { category, name: name ?? '', sort });
  dirtyGuard.markClean();
  visible.value = true;
}

function openCreate(category?: string) {
  const target = category || groups.value[0]?.name || '';
  show(target, undefined, configurationsOf(target).length + 1);
}

function openEdit(payload: { category: string; configuration: string }) {
  const index = configurationsOf(payload.category).findIndex(
    (configuration) => configuration.name === payload.configuration,
  );
  show(payload.category, payload.configuration, index + 1);
}

async function cancel() {
  if (await dirtyGuard.confirmClose()) {
    visible.value = false;
  }
}

function save() {
  validationAttempted.value = true;
  const result = store.saveMachineConfiguration(
    form.category,
    { name: form.name.trim(), sort: form.sort },
    editing.value,
  );
  if (
    notifyResult(result, editing.value ? '配置已更新' : '配置已新增', {
      duplicate: '该配置已存在',
    })
  ) {
    visible.value = false;
  }
}

defineExpose({ openCreate, openEdit });
</script>

<template>
  <a-modal
    :open="visible"
    :title="editing ? '编辑配置' : '新建配置'"
    :width="420"
    destroy-on-close
    @cancel="cancel"
  >
    <a-form layout="vertical">
      <a-form-item
        html-for="entity-source-category"
        label="分类"
        required
        v-bind="
          fieldError(
            validationAttempted && !form.category ? '请选择分类' : undefined,
          )
        "
      >
        <a-select
          id="entity-source-category"
          v-model:value="form.category"
          :options="categoryOptions"
          show-search
          option-filter-prop="label"
        />
      </a-form-item>
      <a-form-item
        html-for="entity-source-name-2"
        label="配置名称"
        required
        v-bind="
          fieldError(
            validationAttempted && !form.name.trim()
              ? '请输入配置名称'
              : undefined,
          )
        "
      >
        <a-input
          id="entity-source-name-2"
          v-model:value="form.name"
          :maxlength="40"
          allow-clear
          show-count
        />
      </a-form-item>
      <a-form-item html-for="entity-source-sort-2" label="排序" required>
        <a-input-number
          id="entity-source-sort-2"
          v-model:value="form.sort"
          :min="1"
          class="full-width"
        />
      </a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="cancel">取消</a-button>
      <a-button type="primary" @click="save">保存</a-button>
    </template>
  </a-modal>
</template>
