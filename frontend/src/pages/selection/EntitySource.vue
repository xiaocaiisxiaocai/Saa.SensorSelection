<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import type { EntityKind } from '@/domain';
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

const props = defineProps<{
  kind: EntityKind;
  selected: string;
  checkedItems?: string[];
}>();

const emit = defineEmits<{
  select: [payload: { category: string; item: string }];
  toggleCheck: [payload: { item: string; checked: boolean }];
}>();

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const groupLabel = computed(() =>
  props.kind === 'customer' ? '区域' : '分类',
);
const itemLabel = computed(() =>
  props.kind === 'customer' ? '客户' : '机型',
);

const groups = computed<SourceGroup[]>(() =>
  store.entityGroups(props.kind).map((group) => ({
    name: group.name,
    items: group.items,
  })),
);

const groupOpen = ref(false);
const itemOpen = ref(false);
const editingGroup = ref<string>();
const editingItem = ref<string>();
const groupForm = reactive({ name: '' });
const itemForm = reactive({ category: '', name: '' });
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
  store
    .entityGroups(props.kind)
    .map((group) => ({ label: group.name, value: group.name })),
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
  editingGroup.value = undefined;
  groupForm.name = '';
  groupOpen.value = true;
}

function openEditGroup(name: string) {
  editingGroup.value = name;
  groupForm.name = name;
  groupOpen.value = true;
}

function openCreateItem(group?: string) {
  editingItem.value = undefined;
  itemForm.category = group || store.entityGroups(props.kind)[0]?.name || '';
  itemForm.name = '';
  itemOpen.value = true;
}

function openEditItem(payload: { group: string; item: string }) {
  editingItem.value = payload.item;
  itemForm.category = payload.group;
  itemForm.name = payload.item;
  itemOpen.value = true;
}

function saveGroup() {
  const result = store.saveEntityGroup(
    props.kind,
    { name: groupForm.name.trim() },
    editingGroup.value,
  );
  if (
    toastResult(result, editingGroup.value ? `${groupLabel.value}已更新` : `${groupLabel.value}已新增`, {
      duplicate: `该${groupLabel.value}已存在`,
      validation: `请填写${groupLabel.value}名称`,
      'not-empty': `请先清空该${groupLabel.value}下的全部${itemLabel.value}`,
    })
  ) {
    groupOpen.value = false;
  }
}

async function removeGroup(name: string) {
  const ok = await confirmDelete(
    `删除${groupLabel.value}`,
    `确认删除“${name}”吗？请先清空其下全部${itemLabel.value}。`,
  );
  if (!ok) return;
  toastResult(store.deleteEntityGroup(props.kind, name), `${groupLabel.value}已删除`, {
    'not-empty': `请先清空该${groupLabel.value}下的全部${itemLabel.value}`,
  });
}

function saveItem() {
  const result = store.saveEntityItem(
    props.kind,
    { category: itemForm.category, name: itemForm.name.trim() },
    editingItem.value,
  );
  if (
    toastResult(result, editingItem.value ? `${itemLabel.value}已更新` : `${itemLabel.value}已新增`, {
      duplicate: `该${itemLabel.value}已存在`,
      validation: `请填写${itemLabel.value}名称并选择${groupLabel.value}`,
      'in-use': `请先清空该${itemLabel.value}下的业务数据`,
    })
  ) {
    itemOpen.value = false;
  }
}

async function removeItem(payload: { group: string; item: string }) {
  const ok = await confirmDelete(
    `删除${itemLabel.value}`,
    `确认删除“${payload.item}”吗？请先清空其下业务数据。`,
  );
  if (!ok) return;
  toastResult(store.deleteEntityItem(props.kind, payload.item), `${itemLabel.value}已删除`, {
    'in-use': `请先清空该${itemLabel.value}下的业务数据`,
  });
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
</script>

<template>
  <div class="entity-source">
    <ASourceList
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

  <ASheet
    v-model:open="groupOpen"
    :title="editingGroup ? `编辑${groupLabel}` : `新建${groupLabel}`"
    :width="420"
  >
    <AFormRow :label="`${groupLabel}名称`" required>
      <AField v-model="groupForm.name" :maxlength="40" />
    </AFormRow>
    <template #footer>
      <AButton @click="groupOpen = false">取消</AButton>
      <AButton variant="filled" @click="saveGroup">保存</AButton>
    </template>
  </ASheet>

  <ASheet
    v-model:open="itemOpen"
    :title="editingItem ? `编辑${itemLabel}` : `新建${itemLabel}`"
    :width="420"
  >
    <AFormRow :label="groupLabel" required>
      <ASelect v-model="itemForm.category" :options="categoryOptions" />
    </AFormRow>
    <AFormRow :label="`${itemLabel}名称`" required>
      <AField v-model="itemForm.name" :maxlength="40" />
    </AFormRow>
    <template #footer>
      <AButton @click="itemOpen = false">取消</AButton>
      <AButton variant="filled" @click="saveItem">保存</AButton>
    </template>
  </ASheet>
  </div>
</template>
