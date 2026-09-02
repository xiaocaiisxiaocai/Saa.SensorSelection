<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';

import {
  filterMachineGroups,
  type EntityKind,
  type MachineCatalogKind,
} from '@/domain';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import {
  AButton,
  AField,
  AFormRow,
  ASelect,
  ASheet,
  ASourceList,
  AStepper,
  type SourceGroup,
} from '@/ui';
import {
  MACHINE_SOURCE_LIST_DEFAULT_WIDTH,
  MACHINE_SOURCE_LIST_MAX_WIDTH,
  MACHINE_SOURCE_LIST_MIN_WIDTH,
  SOURCE_LIST_DEFAULT_WIDTH,
  SOURCE_LIST_MAX_WIDTH,
  SOURCE_LIST_MIN_WIDTH,
} from '@/ui/source-list';
import MachineSourceList from './machine/MachineSourceList.vue';

const props = defineProps<{
  kind: EntityKind;
  selected: string;
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

const groupLabel = computed(() =>
  props.kind === 'customer' ? '区域' : '分类',
);
const itemLabel = computed(() => (props.kind === 'customer' ? '客户' : '机型'));

const groups = computed<SourceGroup[]>(() =>
  store.entityGroups(props.kind).map((group) => ({
    name: group.name,
    items: group.items,
  })),
);
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
const listMinWidth = computed(() =>
  props.kind === 'machine'
    ? MACHINE_SOURCE_LIST_MIN_WIDTH
    : SOURCE_LIST_MIN_WIDTH,
);
const listMaxWidth = computed(() =>
  props.kind === 'machine'
    ? MACHINE_SOURCE_LIST_MAX_WIDTH
    : SOURCE_LIST_MAX_WIDTH,
);
const listDefaultWidth = computed(() =>
  props.kind === 'machine'
    ? MACHINE_SOURCE_LIST_DEFAULT_WIDTH
    : SOURCE_LIST_DEFAULT_WIDTH,
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

function movedIndex(prev: string[], next: string[]) {
  const newIndex = next.findIndex((name, index) => name !== prev[index]);
  if (newIndex < 0) return null;
  const item = next[newIndex];
  if (!item) return null;
  const oldIndex = prev.indexOf(item);
  if (oldIndex < 0 || oldIndex === newIndex) return null;
  return { oldIndex, newIndex };
}

function openCreateGroup() {
  groupValidationAttempted.value = false;
  editingGroup.value = undefined;
  groupForm.name = '';
  groupForm.sort = store.entityGroups(props.kind).length + 1;
  groupOpen.value = true;
}

function openEditGroup(name: string) {
  groupValidationAttempted.value = false;
  editingGroup.value = name;
  groupForm.name = name;
  groupForm.sort =
    store.entityGroups(props.kind).findIndex((group) => group.name === name) +
    1;
  groupOpen.value = true;
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
  configurationOpen.value = true;
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
  itemOpen.value = true;
}

function saveGroup() {
  groupValidationAttempted.value = true;
  const result = store.saveEntityGroup(
    props.kind,
    {
      name: groupForm.name.trim(),
      sort: groupForm.sort,
      ...(props.kind === 'machine' && props.machineType
        ? { machineType: props.machineType }
        : {}),
    },
    editingGroup.value,
  );
  if (
    toastResult(
      result,
      editingGroup.value
        ? `${groupLabel.value}已更新`
        : `${groupLabel.value}已新增`,
      {
        duplicate: `该${groupLabel.value}已存在`,
        validation: `请填写${groupLabel.value}名称`,
        'not-empty': `请先清空该${groupLabel.value}下的全部${itemLabel.value}`,
      },
    )
  ) {
    groupOpen.value = false;
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
    toastResult(
      result,
      editingConfiguration.value ? '配置已更新' : '配置已新增',
      {
        duplicate: '该配置已存在',
        validation: '请填写配置名称并选择分类',
      },
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
  toastResult(
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
  toastResult(
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
    toastResult(
      result,
      previous ? `${itemLabel.value}已更新` : `${itemLabel.value}已新增`,
      {
        duplicate: `该${itemLabel.value}已存在`,
        validation: `请填写${itemLabel.value}名称并选择${groupLabel.value}`,
        'in-use': `请先清空该${itemLabel.value}下的业务数据`,
      },
    )
  ) {
    itemOpen.value = false;
    // A new row lands in a group that may still be collapsed, and renaming the
    // current selection would otherwise fall back to the first entity.
    if (!previous || previous === props.selected) {
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
  toastResult(
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

function onReorderGroups(names: string[]) {
  const current = store.entityGroups(props.kind).map((group) => group.name);
  const move = movedIndex(current, names);
  if (!move) return;
  toastResult(
    store.reorderEntityGroups(props.kind, move.oldIndex, move.newIndex),
    '',
  );
}

function onReorderItems(payload: { group: string; items: string[] }) {
  const current =
    store.entityGroups(props.kind).find((group) => group.name === payload.group)
      ?.items ?? [];
  const move = movedIndex(current, payload.items);
  if (!move) return;
  toastResult(
    store.reorderEntityItems(
      props.kind,
      payload.group,
      move.oldIndex,
      move.newIndex,
    ),
    '',
  );
}

function onReorderMachineGroups(payload: {
  oldIndex: number;
  newIndex: number;
}) {
  const oldName = machineGroups.value[payload.oldIndex]?.name;
  const newName = machineGroups.value[payload.newIndex]?.name;
  if (!oldName || !newName) return;
  const oldIndex = allMachineGroups.value.findIndex(
    (group) => group.name === oldName,
  );
  const newIndex = allMachineGroups.value.findIndex(
    (group) => group.name === newName,
  );
  if (oldIndex < 0 || newIndex < 0) return;
  toastResult(store.reorderEntityGroups('machine', oldIndex, newIndex), '');
}

function onReorderMachineConfigurations(payload: {
  category: string;
  oldIndex: number;
  newIndex: number;
}) {
  const configuration = machineGroups.value.find(
    (group) => group.name === payload.category,
  )?.configurations?.[payload.oldIndex];
  if (!configuration) return;

  toastResult(
    store.saveMachineConfiguration(
      payload.category,
      { name: configuration.name, sort: payload.newIndex + 1 },
      configuration.name,
    ),
    '',
  );
}

function onReorderMachineItems(payload: {
  category: string;
  configuration: string | null;
  oldIndex: number;
  newIndex: number;
}) {
  toastResult(
    store.reorderEntityItems(
      'machine',
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
  <div class="entity-source">
    <ASourceList
      v-if="kind === 'customer'"
      :groups="groups"
      :selected="selected"
      :checked-items="checkedItems"
      :editable="writable"
      :sortable="writable"
      :group-label="groupLabel"
      :item-label="itemLabel"
      :min-width="listMinWidth"
      :max-width="listMaxWidth"
      :default-width="listDefaultWidth"
      :storage-key="`selection:source-list-width:${kind}:v4`"
      @select="emit('select', { category: $event.group, item: $event.item })"
      @toggle-check="emit('toggleCheck', $event)"
      @create-group="openCreateGroup"
      @edit-group="openEditGroup"
      @delete-group="removeGroup"
      @create-item="openCreateItem"
      @edit-item="openEditItem"
      @delete-item="removeItem"
      @reorder-groups="onReorderGroups"
      @reorder-items="onReorderItems"
    />
    <MachineSourceList
      v-else
      :groups="machineGroups"
      :selected="selected"
      :selected-key="selectedKey"
      :checked-items="checkedItems"
      :editable="writable"
      :sortable="writable"
      :allow-configurations="machineType !== 'project'"
      :min-width="listMinWidth"
      :max-width="listMaxWidth"
      :default-width="listDefaultWidth"
      :storage-key="`selection:source-list-width:${kind}:v5`"
      @select="emit('select', $event)"
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
      @reorder-groups="onReorderMachineGroups"
      @reorder-configurations="onReorderMachineConfigurations"
      @reorder-items="onReorderMachineItems"
    />

    <ASheet
      v-model:open="groupOpen"
      :title="editingGroup ? `编辑${groupLabel}` : `新建${groupLabel}`"
      :width="420"
    >
      <AFormRow
        :label="`${groupLabel}名称`"
        required
        :error="
          groupValidationAttempted && !groupForm.name.trim()
            ? `请输入${groupLabel}名称`
            : undefined
        "
      >
        <AField v-model="groupForm.name" :maxlength="40" />
      </AFormRow>
      <AFormRow label="排序" required>
        <AStepper
          v-model="groupForm.sort"
          :min="1"
          :max="
            Math.max(
              1,
              store.entityGroups(kind).length + (editingGroup ? 0 : 1),
            )
          "
        />
      </AFormRow>
      <template #footer>
        <AButton @click="groupOpen = false">取消</AButton>
        <AButton variant="filled" @click="saveGroup">保存</AButton>
      </template>
    </ASheet>

    <ASheet
      v-if="kind === 'machine'"
      v-model:open="configurationOpen"
      :title="editingConfiguration ? '编辑配置' : '新建配置'"
      :width="420"
    >
      <AFormRow
        label="分类"
        required
        :error="
          configurationValidationAttempted && !configurationForm.category
            ? '请选择分类'
            : undefined
        "
      >
        <ASelect
          v-model="configurationForm.category"
          :options="categoryOptions"
        />
      </AFormRow>
      <AFormRow
        label="配置名称"
        required
        :error="
          configurationValidationAttempted && !configurationForm.name.trim()
            ? '请输入配置名称'
            : undefined
        "
      >
        <AField v-model="configurationForm.name" :maxlength="40" />
      </AFormRow>
      <AFormRow label="排序" required>
        <AStepper v-model="configurationForm.sort" :min="1" />
      </AFormRow>
      <template #footer>
        <AButton @click="configurationOpen = false">取消</AButton>
        <AButton variant="filled" @click="saveConfiguration">保存</AButton>
      </template>
    </ASheet>

    <ASheet
      v-model:open="itemOpen"
      :title="editingItem ? `编辑${itemLabel}` : `新建${itemLabel}`"
      :width="420"
    >
      <AFormRow
        :label="groupLabel"
        required
        :error="
          itemValidationAttempted && !itemForm.category
            ? `请选择${groupLabel}`
            : undefined
        "
      >
        <ASelect v-model="itemForm.category" :options="categoryOptions" />
      </AFormRow>
      <AFormRow
        v-if="kind === 'machine' && machineType !== 'project'"
        label="配置（可选）"
      >
        <ASelect
          v-model="itemForm.configuration"
          :options="configurationOptions"
        />
      </AFormRow>
      <AFormRow
        :label="`${itemLabel}名称`"
        required
        :error="
          itemValidationAttempted && !itemForm.name.trim()
            ? `请输入${itemLabel}名称`
            : undefined
        "
      >
        <AField v-model="itemForm.name" :maxlength="40" />
      </AFormRow>
      <AFormRow label="排序" required>
        <AStepper v-model="itemForm.sort" :min="1" />
      </AFormRow>
      <template #footer>
        <AButton @click="itemOpen = false">取消</AButton>
        <AButton variant="filled" @click="saveItem">保存</AButton>
      </template>
    </ASheet>
  </div>
</template>
