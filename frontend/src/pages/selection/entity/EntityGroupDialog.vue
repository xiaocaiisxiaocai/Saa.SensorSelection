<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import type { EntityKind, MachineCatalogKind } from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { notifyResult } from '@/pages/shared/save-feedback';
import { useSelectionStore } from '@/stores/selection';

import { entityLabels, entityNameError } from './entity-labels';

/** 新建 / 编辑目录分组（客户或机型分类）；父组件调用 openCreate() / openEdit() */
const props = defineProps<{
  kind: EntityKind;
  machineType?: MachineCatalogKind;
}>();
const emit = defineEmits<{ renamed: [previous: string, name: string] }>();

const store = useSelectionStore();
const labels = computed(() => entityLabels(props.kind));
const visible = ref(false);
const editing = ref<string>();
const validationAttempted = ref(false);
const form = reactive({ name: '', sort: 1 });
const dirtyGuard = useDirtyGuard(form);
const groupCount = computed(() => store.entityGroups(props.kind).length);

function show(name: string | undefined, sort: number) {
  validationAttempted.value = false;
  editing.value = name;
  form.name = name ?? '';
  form.sort = sort;
  dirtyGuard.markClean();
  visible.value = true;
}

function openCreate() {
  show(undefined, groupCount.value + 1);
}

function openEdit(name: string) {
  const index = store
    .entityGroups(props.kind)
    .findIndex((group) => group.name === name);
  show(name, index + 1);
}

async function cancel() {
  if (await dirtyGuard.confirmClose()) {
    visible.value = false;
  }
}

function save() {
  validationAttempted.value = true;
  const previous = editing.value;
  const name = form.name.trim();
  const { group, item } = labels.value;
  const result = store.saveEntityGroup(
    props.kind,
    {
      name,
      sort: form.sort,
      ...(props.kind === 'machine' && props.machineType
        ? { machineType: props.machineType }
        : {}),
    },
    previous,
  );
  if (
    notifyResult(result, previous ? `${group}已更新` : `${group}已新增`, {
      duplicate: `该${group}已存在`,
      'not-empty': `请先清空该${group}下的全部${item}`,
    })
  ) {
    visible.value = false;
    if (previous && previous !== name) emit('renamed', previous, name);
  }
}

defineExpose({ openCreate, openEdit });
</script>

<template>
  <a-modal
    :open="visible"
    :title="editing ? `编辑${labels.group}` : `新建${labels.group}`"
    :width="420"
    destroy-on-close
    @cancel="cancel"
  >
    <a-form layout="vertical">
      <a-form-item
        html-for="entity-source-name"
        :label="`${labels.group}名称`"
        required
        v-bind="
          fieldError(
            entityNameError(kind, labels.group, form.name, validationAttempted),
          )
        "
      >
        <a-input
          id="entity-source-name"
          v-model:value="form.name"
          :maxlength="40"
          allow-clear
          show-count
        />
      </a-form-item>
      <a-form-item html-for="entity-source-sort" label="排序" required>
        <a-input-number
          id="entity-source-sort"
          v-model:value="form.sort"
          :min="1"
          :max="Math.max(1, groupCount + (editing ? 0 : 1))"
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
