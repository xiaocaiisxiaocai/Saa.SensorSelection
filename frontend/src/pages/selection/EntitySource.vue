<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';

import {
  filterMachineGroups,
  type EntityKind,
  type MachineCatalogKind,
} from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import EntityTree from './EntityTree.vue';

const props = defineProps<{
  kind: EntityKind;
  selected: string;
  /** 当前选中叶子所在的分组；客户目录里区域名会在不同客户下重复，需要它区分 */
  selectedCategory?: string;
  selectedKey?: string;
  checkedItems?: string[];
  machineType?: MachineCatalogKind;
}>();

const emit = defineEmits<{
  select: [
    payload: { category: string; configuration?: string | null; item: string },
  ];
  toggleCheck: [
    payload: {
      category?: string;
      configuration?: string | null;
      item: string;
      checked: boolean;
    },
  ];
}>();

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

// 客户目录是「客户 → 区域」：分组是客户，叶子是区域
const groupLabel = computed(() =>
  props.kind === 'customer' ? '客户' : '分类',
);
const itemLabel = computed(() => (props.kind === 'customer' ? '区域' : '机型'));

/** 客户资料按「客户/区域」存，两级名称里都不能有「/」 */
function nameError(label: string, name: string, attempted: boolean) {
  if (!attempted) return undefined;
  if (!name.trim()) return `请输入${label}名称`;
  if (props.kind === 'customer' && name.includes('/')) {
    return `${label}名称不能包含“/”`;
  }
  return undefined;
}

function isSelectedLeaf(category: string | undefined, item: string) {
  return (
    item === props.selected &&
    (props.selectedCategory === undefined ||
      category === props.selectedCategory)
  );
}

const allMachineGroups = computed(() => store.entityGroups('machine'));
const machineGroups = computed(() =>
  props.machineType
    ? filterMachineGroups(allMachineGroups.value, props.machineType)
    : allMachineGroups.value,
);

const groupOpen = ref(false);
const itemOpen = ref(false);
const configurationOpen = ref(false);
const groupValidationAttempted = ref(false);
const configurationValidationAttempted = ref(false);
const itemValidationAttempted = ref(false);
const editingGroup = ref<string>();
const editingItem = ref<string>();
const editingItemCategory = ref<string>();
const editingItemConfiguration = ref<string | null>();
const editingConfiguration = ref<string>();
const groupForm = reactive({ name: '', sort: 1 });
const configurationForm = reactive({ category: '', name: '', sort: 1 });
const itemForm = reactive({
  category: '',
  configuration: '',
  name: '',
  sort: 1,
});
const groupDirtyGuard = useDirtyGuard(groupForm);
const configurationDirtyGuard = useDirtyGuard(configurationForm);
const itemDirtyGuard = useDirtyGuard(itemForm);
const treeGroups = computed(() =>
  props.kind === 'machine'
    ? machineGroups.value
    : store.entityGroups('customer'),
);
const categoryOptions = computed(() =>
  (props.kind === 'machine'
    ? machineGroups.value
    : store.entityGroups(props.kind)
  ).map((group) => ({ label: group.name, value: group.name })),
);
const configurationOptions = computed(() => [
  { label: '无配置（直接归入分类）', value: '' },
  ...(
    store
      .entityGroups('machine')
      .find((group) => group.name === itemForm.category)?.configurations ?? []
  ).map((configuration) => ({
    label: configuration.name,
    value: configuration.name,
  })),
]);

watch(
  () => itemForm.category,
  () => {
    if (
      itemForm.configuration &&
      !configurationOptions.value.some(
        (option) => option.value === itemForm.configuration,
      )
    ) {
      itemForm.configuration = '';
    }
  },
);

function onSelect(payload: {
  category: string;
  configuration: string | null;
  item: string;
}) {
  emit(
    'select',
    props.kind === 'machine'
      ? payload
      : { category: payload.category, item: payload.item },
  );
}

function openCreateGroup() {
  groupValidationAttempted.value = false;
  editingGroup.value = undefined;
  groupForm.name = '';
  groupForm.sort = store.entityGroups(props.kind).length + 1;
  groupDirtyGuard.markClean();
  groupOpen.value = true;
}

function openEditGroup(name: string) {
  groupValidationAttempted.value = false;
  editingGroup.value = name;
  groupForm.name = name;
  groupForm.sort =
    store.entityGroups(props.kind).findIndex((group) => group.name === name) +
    1;
  groupDirtyGuard.markClean();
  groupOpen.value = true;
}

async function cancelGroupDialog() {
  if (await groupDirtyGuard.confirmClose()) {
    groupOpen.value = false;
  }
}

function openCreateConfiguration(category?: string) {
  configurationValidationAttempted.value = false;
  const target = category || machineGroups.value[0]?.name || '';
  editingConfiguration.value = undefined;
  configurationForm.category = target;
  configurationForm.name = '';
  configurationForm.sort =
    (machineGroups.value.find((group) => group.name === target)?.configurations
      ?.length ?? 0) + 1;
  configurationDirtyGuard.markClean();
  configurationOpen.value = true;
}

function openEditConfiguration(payload: {
  category: string;
  configuration: string;
}) {
  configurationValidationAttempted.value = false;
  editingConfiguration.value = payload.configuration;
  configurationForm.category = payload.category;
  configurationForm.name = payload.configuration;
  configurationForm.sort =
    (machineGroups.value
      .find((group) => group.name === payload.category)
      ?.configurations?.findIndex(
        (configuration) => configuration.name === payload.configuration,
      ) ?? 0) + 1;
  configurationDirtyGuard.markClean();
  configurationOpen.value = true;
}

async function cancelConfigurationDialog() {
  if (await configurationDirtyGuard.confirmClose()) {
    configurationOpen.value = false;
  }
}

function openCreateItem(
  payload?: string | { category: string; configuration: string | null },
) {
  itemValidationAttempted.value = false;
  editingItem.value = undefined;
  editingItemCategory.value = undefined;
  editingItemConfiguration.value = undefined;
  itemForm.category =
    (typeof payload === 'string' ? payload : payload?.category) ||
    (props.kind === 'machine'
      ? machineGroups.value[0]?.name
      : store.entityGroups(props.kind)[0]?.name) ||
    '';
  itemForm.configuration =
    typeof payload === 'object' ? payload.configuration || '' : '';
  itemForm.name = '';
  const group = store
    .entityGroups(props.kind)
    .find((item) => item.name === itemForm.category);
  const items = itemForm.configuration
    ? group?.configurations?.find(
        (configuration) => configuration.name === itemForm.configuration,
      )?.items
    : group?.items;
  itemForm.sort = (items?.length ?? 0) + 1;
  itemDirtyGuard.markClean();
  itemOpen.value = true;
}

function openEditItem(payload: {
  group?: string;
  category?: string;
  configuration?: string | null;
  item: string;
}) {
  itemValidationAttempted.value = false;
  editingItem.value = payload.item;
  itemForm.category = payload.category || payload.group || '';
  itemForm.configuration = payload.configuration || '';
  editingItemCategory.value = itemForm.category;
  editingItemConfiguration.value = payload.configuration || null;
  itemForm.name = payload.item;
  const group = store
    .entityGroups(props.kind)
    .find((item) => item.name === itemForm.category);
  const items = itemForm.configuration
    ? group?.configurations?.find(
        (configuration) => configuration.name === itemForm.configuration,
      )?.items
    : group?.items;
  itemForm.sort = Math.max(1, (items?.indexOf(payload.item) ?? 0) + 1);
  itemDirtyGuard.markClean();
  itemOpen.value = true;
}

async function cancelItemDialog() {
  if (await itemDirtyGuard.confirmClose()) {
    itemOpen.value = false;
  }
}

function saveGroup() {
  groupValidationAttempted.value = true;
  const previous = editingGroup.value;
  const name = groupForm.name.trim();
  const result = store.saveEntityGroup(
    props.kind,
    {
      name,
      sort: groupForm.sort,
      ...(props.kind === 'machine' && props.machineType
        ? { machineType: props.machineType }
        : {}),
    },
    editingGroup.value,
  );
  if (
    notifyResult(
      result,
      editingGroup.value
        ? `${groupLabel.value}已更新`
        : `${groupLabel.value}已新增`,
      {
        duplicate: `该${groupLabel.value}已存在`,
        'not-empty': `请先清空该${groupLabel.value}下的全部${itemLabel.value}`,
      },
    )
  ) {
    groupOpen.value = false;
    // 改名的正好是当前选中叶子所在的分组：跟着新名字继续选中，别跳回第一个
    if (
      previous &&
      previous !== name &&
      props.selectedCategory !== undefined &&
      previous === props.selectedCategory
    ) {
      emit('select', { category: name, item: props.selected });
    }
  }
}

function saveConfiguration() {
  configurationValidationAttempted.value = true;
  const result = store.saveMachineConfiguration(
    configurationForm.category,
    { name: configurationForm.name.trim(), sort: configurationForm.sort },
    editingConfiguration.value,
  );
  if (
    notifyResult(
      result,
      editingConfiguration.value ? '配置已更新' : '配置已新增',
      { duplicate: '该配置已存在' },
    )
  ) {
    configurationOpen.value = false;
  }
}

async function removeConfiguration(payload: {
  category: string;
  configuration: string;
}) {
  const ok = await confirmDelete(
    '删除配置',
    `确认删除“${payload.configuration}”吗？请先清空其下全部机型。`,
  );
  if (!ok) return;
  notifyResult(
    store.deleteMachineConfiguration(payload.category, payload.configuration),
    '配置已删除',
    { 'not-empty': '请先清空该配置下的全部机型' },
  );
}

async function removeGroup(name: string) {
  const ok = await confirmDelete(
    `删除${groupLabel.value}`,
    `确认删除“${name}”吗？请先清空其下全部${itemLabel.value}。`,
  );
  if (!ok) return;
  notifyResult(
    store.deleteEntityGroup(props.kind, name),
    `${groupLabel.value}已删除`,
    {
      'not-empty': `请先清空该${groupLabel.value}下的全部${itemLabel.value}`,
    },
  );
}

function saveItem() {
  itemValidationAttempted.value = true;
  const previous = editingItem.value;
  const category = itemForm.category;
  const name = itemForm.name.trim();
  const result = store.saveEntityItem(
    props.kind,
    {
      category,
      configuration:
        props.kind === 'machine' ? itemForm.configuration || null : null,
      name,
      previousCategory: editingItemCategory.value,
      previousConfiguration: editingItemConfiguration.value,
      sort: itemForm.sort,
    },
    previous,
  );
  if (
    notifyResult(
      result,
      previous ? `${itemLabel.value}已更新` : `${itemLabel.value}已新增`,
      {
        duplicate: `该${itemLabel.value}已存在`,
        'in-use': `请先清空该${itemLabel.value}下的业务数据`,
      },
    )
  ) {
    itemOpen.value = false;
    // A new row lands in a group that may still be collapsed, and renaming the
    // current selection would otherwise fall back to the first entity.
    if (!previous || isSelectedLeaf(editingItemCategory.value, previous)) {
      emit('select', { category, item: name });
    }
  }
}

async function removeItem(payload: {
  group?: string;
  category?: string;
  configuration?: string | null;
  item: string;
}) {
  const ok = await confirmDelete(
    `删除${itemLabel.value}`,
    `确认删除“${payload.item}”吗？请先清空其下业务数据。`,
  );
  if (!ok) return;
  notifyResult(
    store.deleteEntityItem(
      props.kind,
      payload.item,
      payload.category || payload.group,
      payload.configuration,
    ),
    `${itemLabel.value}已删除`,
    {
      'in-use': `请先清空该${itemLabel.value}下的业务数据`,
    },
  );
}

function onReorderGroups(payload: { oldIndex: number; newIndex: number }) {
  // 机型目录按类型过滤后展示，下标要换算回全部分组里的位置
  const all = store.entityGroups(props.kind);
  const oldName = treeGroups.value[payload.oldIndex]?.name;
  const newName = treeGroups.value[payload.newIndex]?.name;
  if (!oldName || !newName) return;
  const oldIndex = all.findIndex((group) => group.name === oldName);
  const newIndex = all.findIndex((group) => group.name === newName);
  if (oldIndex < 0 || newIndex < 0) return;
  notifyResult(store.reorderEntityGroups(props.kind, oldIndex, newIndex), '');
}

function onReorderConfigurations(payload: {
  category: string;
  oldIndex: number;
  newIndex: number;
}) {
  const configuration = machineGroups.value.find(
    (group) => group.name === payload.category,
  )?.configurations?.[payload.oldIndex];
  if (!configuration) return;

  notifyResult(
    store.saveMachineConfiguration(
      payload.category,
      { name: configuration.name, sort: payload.newIndex + 1 },
      configuration.name,
    ),
    '',
  );
}

function onReorderItems(payload: {
  category: string;
  configuration: string | null;
  oldIndex: number;
  newIndex: number;
}) {
  notifyResult(
    store.reorderEntityItems(
      props.kind,
      payload.category,
      payload.oldIndex,
      payload.newIndex,
      payload.configuration,
    ),
    '',
  );
}
</script>

<template>
  <div class="entity-source" :class="`entity-source--${kind}`">
    <EntityTree
      :groups="treeGroups"
      :selected="selected"
      :selected-key="selectedKey"
      :checked-items="checkedItems"
      :editable="writable"
      :sortable="writable"
      :allow-configurations="kind === 'machine' && machineType !== 'project'"
      :group-label="groupLabel"
      :item-label="itemLabel"
      @select="onSelect"
      @toggle-check="emit('toggleCheck', $event)"
      @create-group="openCreateGroup"
      @edit-group="openEditGroup"
      @delete-group="removeGroup"
      @create-configuration="openCreateConfiguration"
      @edit-configuration="openEditConfiguration"
      @delete-configuration="removeConfiguration"
      @create-item="openCreateItem"
      @edit-item="openEditItem"
      @delete-item="removeItem"
      @reorder-groups="onReorderGroups"
      @reorder-configurations="onReorderConfigurations"
      @reorder-items="onReorderItems"
    />

    <a-modal
      :open="groupOpen"
      :title="editingGroup ? `编辑${groupLabel}` : `新建${groupLabel}`"
      :width="420"
      destroy-on-close
      @cancel="cancelGroupDialog"
    >
      <a-form layout="vertical">
        <a-form-item
          html-for="entity-source-name"
          :label="`${groupLabel}名称`"
          required
          v-bind="
            fieldError(
              nameError(groupLabel, groupForm.name, groupValidationAttempted),
            )
          "
        >
          <a-input
            id="entity-source-name"
            v-model:value="groupForm.name"
            :maxlength="40"
            allow-clear
            show-count
          />
        </a-form-item>
        <a-form-item html-for="entity-source-sort" label="排序" required>
          <a-input-number
            id="entity-source-sort"
            v-model:value="groupForm.sort"
            :min="1"
            :max="
              Math.max(
                1,
                store.entityGroups(kind).length + (editingGroup ? 0 : 1),
              )
            "
            style="width: 100%"
          />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="cancelGroupDialog">取消</a-button>
        <a-button type="primary" @click="saveGroup">保存</a-button>
      </template>
    </a-modal>

    <a-modal
      v-if="kind === 'machine'"
      :open="configurationOpen"
      :title="editingConfiguration ? '编辑配置' : '新建配置'"
      :width="420"
      destroy-on-close
      @cancel="cancelConfigurationDialog"
    >
      <a-form layout="vertical">
        <a-form-item
          html-for="entity-source-category"
          label="分类"
          required
          v-bind="
            fieldError(
              configurationValidationAttempted && !configurationForm.category
                ? '请选择分类'
                : undefined,
            )
          "
        >
          <a-select
            id="entity-source-category"
            v-model:value="configurationForm.category"
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
              configurationValidationAttempted && !configurationForm.name.trim()
                ? '请输入配置名称'
                : undefined,
            )
          "
        >
          <a-input
            id="entity-source-name-2"
            v-model:value="configurationForm.name"
            :maxlength="40"
            allow-clear
            show-count
          />
        </a-form-item>
        <a-form-item html-for="entity-source-sort-2" label="排序" required>
          <a-input-number
            id="entity-source-sort-2"
            v-model:value="configurationForm.sort"
            :min="1"
            style="width: 100%"
          />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="cancelConfigurationDialog">取消</a-button>
        <a-button type="primary" @click="saveConfiguration">保存</a-button>
      </template>
    </a-modal>

    <a-modal
      :open="itemOpen"
      :title="editingItem ? `编辑${itemLabel}` : `新建${itemLabel}`"
      :width="420"
      destroy-on-close
      @cancel="cancelItemDialog"
    >
      <a-form layout="vertical">
        <a-form-item
          html-for="entity-source-category-2"
          :label="groupLabel"
          required
          v-bind="
            fieldError(
              itemValidationAttempted && !itemForm.category
                ? `请选择${groupLabel}`
                : undefined,
            )
          "
        >
          <a-select
            id="entity-source-category-2"
            v-model:value="itemForm.category"
            :options="categoryOptions"
            show-search
            option-filter-prop="label"
          />
        </a-form-item>
        <a-form-item
          v-if="kind === 'machine' && machineType !== 'project'"
          html-for="entity-source-configuration"
          label="配置（可选）"
        >
          <a-select
            id="entity-source-configuration"
            v-model:value="itemForm.configuration"
            :options="configurationOptions"
            show-search
            option-filter-prop="label"
          />
        </a-form-item>
        <a-form-item
          html-for="entity-source-name-3"
          :label="`${itemLabel}名称`"
          required
          v-bind="
            fieldError(
              nameError(itemLabel, itemForm.name, itemValidationAttempted),
            )
          "
        >
          <a-input
            id="entity-source-name-3"
            v-model:value="itemForm.name"
            :maxlength="40"
            allow-clear
            show-count
          />
        </a-form-item>
        <a-form-item html-for="entity-source-sort-3" label="排序" required>
          <a-input-number
            id="entity-source-sort-3"
            v-model:value="itemForm.sort"
            :min="1"
            style="width: 100%"
          />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="cancelItemDialog">取消</a-button>
        <a-button type="primary" @click="saveItem">保存</a-button>
      </template>
    </a-modal>
  </div>
</template>
