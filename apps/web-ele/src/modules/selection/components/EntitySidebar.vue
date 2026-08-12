<script lang="ts" setup>
import type { EntityGroup } from '../data.js';
import type { EntityKind } from '../domain.js';

import { computed, reactive, ref, watch } from 'vue';

import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElTooltip,
} from 'element-plus';
import {
  ChevronDown,
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-vue-next';

import { ENTITY_KIND_DEFINITIONS } from '../data.js';
import { useSelectionStore } from '../store';

const props = defineProps<{
  groups: EntityGroup[];
  kind: EntityKind;
  label: string;
  selected: string;
}>();

const emit = defineEmits<{
  select: [payload: { category: string; item: string }];
}>();

const store = useSelectionStore();
const query = ref('');
const groupDialogOpen = ref(false);
const itemDialogOpen = ref(false);
const editingGroupName = ref<string>();
const editingItemName = ref<string>();
const groupForm = reactive({ name: '' });
const itemForm = reactive({ category: '', name: '' });

const kindMeta = computed(
  () =>
    ENTITY_KIND_DEFINITIONS.find((item) => item.kind === props.kind) || {
      groupLabel: '分类',
      label: props.label,
    },
);

const categoryOptions = computed(() => props.groups.map((group) => group.name));

function findSelectedGroup(groups: EntityGroup[], selected: string) {
  return groups.find((group) => group.items.includes(selected))?.name;
}

const initialGroup =
  findSelectedGroup(props.groups, props.selected) || props.groups[0]?.name;
const expanded = ref(new Set(initialGroup ? [initialGroup] : []));

const visibleGroups = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  if (!value) return props.groups;
  return props.groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.toLocaleLowerCase('zh-CN').includes(value) ||
          group.name.toLocaleLowerCase('zh-CN').includes(value),
      ),
    }))
    .filter(
      (group) =>
        group.items.length > 0 ||
        group.name.toLocaleLowerCase('zh-CN').includes(value),
    );
});

watch(query, (value) => {
  if (value.trim()) {
    expanded.value = new Set(visibleGroups.value.map((group) => group.name));
  }
});

watch(
  () => [props.groups, props.selected] as const,
  ([groups, selected]) => {
    const groupName = findSelectedGroup(groups, selected);
    if (!groupName || expanded.value.has(groupName)) return;
    expanded.value = new Set(expanded.value).add(groupName);
  },
);

function toggle(groupName: string) {
  const next = new Set(expanded.value);
  if (next.has(groupName)) next.delete(groupName);
  else next.add(groupName);
  expanded.value = next;
}

function failureMessage(reason: string, target: 'group' | 'item') {
  if (reason === 'duplicate') {
    return target === 'group'
      ? `${kindMeta.value.groupLabel}名称已存在`
      : `${kindMeta.value.label}名称已存在`;
  }
  if (reason === 'not-empty') {
    return target === 'group'
      ? `请先移除该${kindMeta.value.groupLabel}下的全部${kindMeta.value.label}`
      : `请先清空该${kindMeta.value.label}下的全部业务数据后再删除`;
  }
  if (reason === 'storage') return '浏览器本地存储不可用，本次修改未保存';
  if (reason === 'stale') return '该项已被删除，请刷新后重试';
  if (reason === 'validation') return '请填写有效名称';
  return '操作失败，请重试';
}

function openCreateGroup() {
  editingGroupName.value = undefined;
  groupForm.name = '';
  groupDialogOpen.value = true;
}

function openEditGroup(groupName: string, event: Event) {
  event.stopPropagation();
  editingGroupName.value = groupName;
  groupForm.name = groupName;
  groupDialogOpen.value = true;
}

function openCreateItem(category?: string) {
  editingItemName.value = undefined;
  itemForm.name = '';
  itemForm.category =
    category ||
    findSelectedGroup(props.groups, props.selected) ||
    categoryOptions.value[0] ||
    '';
  itemDialogOpen.value = true;
}

function openEditItem(category: string, itemName: string, event: Event) {
  event.stopPropagation();
  editingItemName.value = itemName;
  itemForm.category = category;
  itemForm.name = itemName;
  itemDialogOpen.value = true;
}

function saveGroup() {
  const result = store.saveEntityGroup(
    props.kind,
    { name: groupForm.name.trim() },
    editingGroupName.value,
  );
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason, 'group'));
    return;
  }
  ElMessage.success(
    editingGroupName.value
      ? `${kindMeta.value.groupLabel}已更新`
      : `${kindMeta.value.groupLabel}已新增`,
  );
  groupDialogOpen.value = false;
  if (result.item?.name) {
    expanded.value = new Set(expanded.value).add(result.item.name);
  }
}

function saveItem() {
  const result = store.saveEntityItem(
    props.kind,
    {
      category: itemForm.category,
      name: itemForm.name.trim(),
    },
    editingItemName.value,
  );
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason, 'item'));
    return;
  }
  ElMessage.success(
    editingItemName.value
      ? `${kindMeta.value.label}已更新`
      : `${kindMeta.value.label}已新增`,
  );
  itemDialogOpen.value = false;
  if (result.item) {
    expanded.value = new Set(expanded.value).add(result.item.category);
    emit('select', {
      category: result.item.category,
      item: result.item.name,
    });
  }
}

async function removeGroup(groupName: string, event: Event) {
  event.stopPropagation();
  const group = props.groups.find((item) => item.name === groupName);
  if (!group) return;
  if (group.items.length > 0) {
    ElMessage.warning(
      `请先移除该${kindMeta.value.groupLabel}下的全部${kindMeta.value.label}`,
    );
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确认删除${kindMeta.value.groupLabel}“${groupName}”吗？`,
      `删除${kindMeta.value.groupLabel}`,
      {
        cancelButtonText: '取消',
        confirmButtonText: '删除',
        type: 'warning',
      },
    );
  } catch {
    return;
  }
  const result = store.deleteEntityGroup(props.kind, groupName);
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason, 'group'));
    return;
  }
  ElMessage.success(`${kindMeta.value.groupLabel}已删除`);
}

async function removeItem(category: string, itemName: string, event: Event) {
  event.stopPropagation();
  if (store.entityHasData(props.kind, itemName)) {
    ElMessage.warning(
      `请先清空该${kindMeta.value.label}下的全部业务数据后再删除`,
    );
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确认删除${kindMeta.value.label}“${itemName}”吗？`,
      `删除${kindMeta.value.label}`,
      {
        cancelButtonText: '取消',
        confirmButtonText: '删除',
        type: 'warning',
      },
    );
  } catch {
    return;
  }
  const result = store.deleteEntityItem(props.kind, itemName);
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason, 'item'));
    return;
  }
  ElMessage.success(`${kindMeta.value.label}已删除`);
  if (props.selected === itemName) {
    const fallback =
      props.groups
        .flatMap((group) =>
          group.items
            .filter((item) => item !== itemName)
            .map((item) => ({ category: group.name, item })),
        )
        .find(Boolean) ||
      (category
        ? { category, item: '' }
        : { category: props.groups[0]?.name || '', item: '' });
    if (fallback.item) emit('select', fallback);
  }
}
</script>

<template>
  <aside :aria-label="`${props.label}列表`" class="entity-sidebar">
    <label class="entity-filter">
      <Search :size="16" aria-hidden="true" />
      <input
        v-model="query"
        :aria-label="`搜索${props.label}`"
        :placeholder="`搜索${props.label}...`"
        type="search"
      />
      <button
        v-if="query"
        aria-label="清除筛选"
        class="icon-button"
        title="清除筛选"
        type="button"
        @click="query = ''"
      >
        <X :size="15" aria-hidden="true" />
      </button>
    </label>

    <div class="entity-sidebar__actions">
      <ElTooltip :content="`新建${kindMeta.groupLabel}`" placement="top">
        <ElButton size="small" @click="openCreateGroup">
          <FolderPlus :size="14" aria-hidden="true" />
          {{ kindMeta.groupLabel }}
        </ElButton>
      </ElTooltip>
      <ElTooltip :content="`新建${kindMeta.label}`" placement="top">
        <ElButton
          :disabled="categoryOptions.length === 0"
          size="small"
          type="primary"
          @click="openCreateItem()"
        >
          <Plus :size="14" aria-hidden="true" />
          {{ kindMeta.label }}
        </ElButton>
      </ElTooltip>
    </div>

    <div v-if="visibleGroups.length > 0" class="entity-groups">
      <section
        v-for="group in visibleGroups"
        :key="group.name"
        class="entity-group"
      >
        <div class="entity-group__header">
          <button
            :aria-expanded="expanded.has(group.name)"
            class="entity-group__toggle"
            type="button"
            @click="toggle(group.name)"
          >
            <ChevronDown
              :class="{ 'is-collapsed': !expanded.has(group.name) }"
              :size="15"
              aria-hidden="true"
            />
            <span>{{ group.name }}</span>
            <span class="entity-group__count">{{ group.items.length }}</span>
          </button>
          <div class="entity-group__actions">
            <ElTooltip :content="`新建${kindMeta.label}`" placement="top">
              <button
                :aria-label="`在该${kindMeta.groupLabel}下新建${kindMeta.label}`"
                class="icon-button"
                type="button"
                @click.stop="openCreateItem(group.name)"
              >
                <Plus :size="13" aria-hidden="true" />
              </button>
            </ElTooltip>
            <ElTooltip content="编辑" placement="top">
              <button
                :aria-label="`编辑${kindMeta.groupLabel}`"
                class="icon-button"
                type="button"
                @click="openEditGroup(group.name, $event)"
              >
                <Pencil :size="13" aria-hidden="true" />
              </button>
            </ElTooltip>
            <ElTooltip content="删除" placement="top">
              <button
                :aria-label="`删除${kindMeta.groupLabel}`"
                class="icon-button"
                type="button"
                @click="removeGroup(group.name, $event)"
              >
                <Trash2 :size="13" aria-hidden="true" />
              </button>
            </ElTooltip>
          </div>
        </div>
        <div v-show="expanded.has(group.name)" class="entity-group__items">
          <div
            v-for="item in group.items"
            :key="item"
            class="entity-group__item"
          >
            <button
              :aria-current="selected === item ? 'page' : undefined"
              :class="{ active: selected === item }"
              type="button"
              @click="emit('select', { category: group.name, item })"
            >
              {{ item }}
            </button>
            <div class="entity-group__actions">
              <ElTooltip content="编辑" placement="top">
                <button
                  :aria-label="`编辑${kindMeta.label}`"
                  class="icon-button"
                  type="button"
                  @click="openEditItem(group.name, item, $event)"
                >
                  <Pencil :size="13" aria-hidden="true" />
                </button>
              </ElTooltip>
              <ElTooltip content="删除" placement="top">
                <button
                  :aria-label="`删除${kindMeta.label}`"
                  class="icon-button"
                  type="button"
                  @click="removeItem(group.name, item, $event)"
                >
                  <Trash2 :size="13" aria-hidden="true" />
                </button>
              </ElTooltip>
            </div>
          </div>
        </div>
      </section>
    </div>
    <div v-else class="entity-empty">
      {{
        query.trim()
          ? `没有匹配“${query.trim()}”的结果`
          : `暂无${kindMeta.label}，请先新建${kindMeta.groupLabel}`
      }}
    </div>

    <ElDialog
      v-model="groupDialogOpen"
      :title="
        editingGroupName
          ? `编辑${kindMeta.groupLabel}`
          : `新建${kindMeta.groupLabel}`
      "
      width="420px"
      @closed="groupForm.name = ''"
    >
      <ElForm label-position="top" @submit.prevent="saveGroup">
        <ElFormItem :label="`${kindMeta.groupLabel}名称`" required>
          <ElInput
            v-model="groupForm.name"
            maxlength="40"
            placeholder="例如：华东"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="groupDialogOpen = false">取消</ElButton>
        <ElButton type="primary" @click="saveGroup">保存</ElButton>
      </template>
    </ElDialog>

    <ElDialog
      v-model="itemDialogOpen"
      :title="
        editingItemName ? `编辑${kindMeta.label}` : `新建${kindMeta.label}`
      "
      width="420px"
      @closed="Object.assign(itemForm, { category: '', name: '' })"
    >
      <ElForm label-position="top" @submit.prevent="saveItem">
        <ElFormItem :label="`所属${kindMeta.groupLabel}`" required>
          <ElSelect v-model="itemForm.category" class="w-full">
            <ElOption
              v-for="option in categoryOptions"
              :key="option"
              :label="option"
              :value="option"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem :label="`${kindMeta.label}名称`" required>
          <ElInput
            v-model="itemForm.name"
            maxlength="40"
            placeholder="例如：景旺"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="itemDialogOpen = false">取消</ElButton>
        <ElButton type="primary" @click="saveItem">保存</ElButton>
      </template>
    </ElDialog>
  </aside>
</template>
