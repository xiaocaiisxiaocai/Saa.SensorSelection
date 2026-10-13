<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';

import type { EntityKind, MachineCatalogKind } from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { notifyResult } from '@/pages/shared/save-feedback';
import { useSelectionStore } from '@/stores/selection';

import {
  entityLabels,
  entityNameError,
  visibleEntityGroups,
} from './entity-labels';

/**
 * 新建 / 编辑目录叶子（客户的区域或机型）；父组件调用 openCreate() / openEdit()。
 * 保存成功后发出 saved，父组件据此决定是否跟着选中。
 */
const props = defineProps<{
  kind: EntityKind;
  machineType?: MachineCatalogKind;
}>();
const emit = defineEmits<{
  saved: [
    payload: {
      category: string;
      name: string;
      /** 编辑前的名称与分组；新建时为空 */
      previous?: string;
      previousCategory?: string;
    },
  ];
}>();

const store = useSelectionStore();
const labels = computed(() => entityLabels(props.kind));
const allowConfigurations = computed(
  () => props.kind === 'machine' && props.machineType !== 'project',
);
const visible = ref(false);
const editing = ref<string>();
const editingCategory = ref<string>();
const editingConfiguration = ref<string | null>();
const validationAttempted = ref(false);
const form = reactive({ category: '', configuration: '', name: '', sort: 1 });
const dirtyGuard = useDirtyGuard(form);

const groups = computed(() =>
  visibleEntityGroups(
    store.entityGroups(props.kind),
    props.kind,
    props.machineType,
  ),
);
const categoryOptions = computed(() =>
  groups.value.map((group) => ({ label: group.name, value: group.name })),
);
const configurationOptions = computed(() => [
  { label: '无配置（直接归入分类）', value: '' },
  ...(
    store.entityGroups('machine').find((group) => group.name === form.category)
      ?.configurations ?? []
  ).map((configuration) => ({
    label: configuration.name,
    value: configuration.name,
  })),
]);

// 换了分类，原来选的配置不在新分类下就清掉
watch(
  () => form.category,
  () => {
    if (
      form.configuration &&
      !configurationOptions.value.some(
        (option) => option.value === form.configuration,
      )
    ) {
      form.configuration = '';
    }
  },
);

/** 分组（或分组下某个配置）里现有的叶子 */
function siblings(category: string, configuration: string) {
  const group = store
    .entityGroups(props.kind)
    .find((item) => item.name === category);
  return (
    (configuration
      ? group?.configurations?.find((item) => item.name === configuration)
          ?.items
      : group?.items) ?? []
  );
}

function openCreate(
  payload?: string | { category: string; configuration: string | null },
) {
  validationAttempted.value = false;
  editing.value = undefined;
  editingCategory.value = undefined;
  editingConfiguration.value = undefined;
  form.category =
    (typeof payload === 'string' ? payload : payload?.category) ||
    groups.value[0]?.name ||
    '';
  form.configuration =
    typeof payload === 'object' ? payload.configuration || '' : '';
  form.name = '';
  form.sort = siblings(form.category, form.configuration).length + 1;
  dirtyGuard.markClean();
  visible.value = true;
}

function openEdit(payload: {
  group?: string;
  category?: string;
  configuration?: string | null;
  item: string;
}) {
  validationAttempted.value = false;
  editing.value = payload.item;
  form.category = payload.category || payload.group || '';
  form.configuration = payload.configuration || '';
  editingCategory.value = form.category;
  editingConfiguration.value = payload.configuration || null;
  form.name = payload.item;
  form.sort = Math.max(
    1,
    siblings(form.category, form.configuration).indexOf(payload.item) + 1,
  );
  dirtyGuard.markClean();
  visible.value = true;
}

async function cancel() {
  if (await dirtyGuard.confirmClose()) {
    visible.value = false;
  }
}

function save() {
  validationAttempted.value = true;
  const previous = editing.value;
  const category = form.category;
  const name = form.name.trim();
  const { item } = labels.value;
  const result = store.saveEntityItem(
    props.kind,
    {
      category,
      configuration:
        props.kind === 'machine' ? form.configuration || null : null,
      name,
      previousCategory: editingCategory.value,
      previousConfiguration: editingConfiguration.value,
      sort: form.sort,
    },
    previous,
  );
  if (
    notifyResult(result, previous ? `${item}已更新` : `${item}已新增`, {
      duplicate: `该${item}已存在`,
      'in-use': `请先清空该${item}下的业务数据`,
      'not-empty': `所选位置已有二级 Tab，不能再添加${item}`,
    })
  ) {
    visible.value = false;
    emit('saved', {
      category,
      name,
      previous,
      previousCategory: editingCategory.value,
    });
  }
}

defineExpose({ openCreate, openEdit });
</script>

<template>
  <a-modal
    :open="visible"
    :title="editing ? `编辑${labels.item}` : `新建${labels.item}`"
    :width="420"
    destroy-on-close
    @cancel="cancel"
  >
    <a-form layout="vertical">
      <a-form-item
        html-for="entity-source-category-2"
        :label="labels.group"
        required
        v-bind="
          fieldError(
            validationAttempted && !form.category
              ? `请选择${labels.group}`
              : undefined,
          )
        "
      >
        <a-select
          id="entity-source-category-2"
          v-model:value="form.category"
          :options="categoryOptions"
          show-search
          option-filter-prop="label"
        />
      </a-form-item>
      <a-form-item
        v-if="allowConfigurations"
        html-for="entity-source-configuration"
        label="配置（可选）"
      >
        <a-select
          id="entity-source-configuration"
          v-model:value="form.configuration"
          :options="configurationOptions"
          show-search
          option-filter-prop="label"
        />
      </a-form-item>
      <a-form-item
        html-for="entity-source-name-3"
        :label="`${labels.item}名称`"
        required
        v-bind="
          fieldError(
            entityNameError(kind, labels.item, form.name, validationAttempted),
          )
        "
      >
        <a-input
          id="entity-source-name-3"
          v-model:value="form.name"
          :maxlength="40"
          allow-clear
          show-count
        />
      </a-form-item>
      <a-form-item html-for="entity-source-sort-3" label="排序" required>
        <a-input-number
          id="entity-source-sort-3"
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
