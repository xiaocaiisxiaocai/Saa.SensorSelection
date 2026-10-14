<script setup lang="ts">
import { message } from 'ant-design-vue';
import { computed, reactive, ref } from 'vue';

import { api, type OrgUnitNode } from '@/api';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import {
  allowedOrgLevels,
  canHaveOrgChildren,
  canPlaceOrgLevel,
  collectDescendantLevels,
  defaultChildOrgLevel,
  nextOrgSortOrder,
  ORG_LEAF_MESSAGE,
  ORG_LEVEL_INVERTED_MESSAGE,
} from '@/pages/system/org-tree';

/**
 * 新建 / 编辑组织节点。层级只能比上级低、比下级高（允许跳级）。
 * 父组件调用 openCreate(上级 id) / openEdit(节点)，保存成功后发出 saved。
 */
const props = defineProps<{ nodes: readonly OrgUnitNode[] }>();
const emit = defineEmits<{ saved: [] }>();

const visible = ref(false);
const parentId = ref<null | number>(null);
const editingNode = ref<null | OrgUnitNode>(null);
const validationAttempted = ref(false);
const saving = ref(false);
const form = reactive({
  level: '' as string | null,
  name: '',
  sortOrder: 0,
});
const dirtyGuard = useDirtyGuard(form);

const parentNode = computed(() =>
  props.nodes.find((node) => node.id === parentId.value),
);
const descendantLevels = computed(() =>
  editingNode.value
    ? collectDescendantLevels([...props.nodes], editingNode.value.id)
    : [],
);
// 有下级的组织不能改成课别（课别是最末一级）
const hasChildren = computed(() =>
  editingNode.value
    ? props.nodes.some((node) => node.parentId === editingNode.value?.id)
    : false,
);
const levelAllowed = (level: string | null | undefined) =>
  !hasChildren.value || canHaveOrgChildren(level);
const levelInverted = computed(
  () =>
    !canPlaceOrgLevel(parentNode.value?.level, form.level) ||
    descendantLevels.value.some(
      (level) => !canPlaceOrgLevel(form.level, level),
    ),
);
const levelOptions = computed(() => {
  const parentLevel = parentNode.value?.level;
  const names = new Set(allowedOrgLevels(parentLevel, descendantLevels.value));
  for (const extra of props.nodes.map((node) => node.level)) {
    if (
      extra &&
      canPlaceOrgLevel(parentLevel, extra) &&
      descendantLevels.value.every((item) => canPlaceOrgLevel(extra, item))
    ) {
      names.add(extra);
    }
  }
  for (const name of names) {
    if (!levelAllowed(name)) names.delete(name);
  }
  if (form.level) names.add(form.level);
  return [...names].map((name) => ({ label: name, value: name }));
});

function show(parent: null | number, node: null | OrgUnitNode) {
  validationAttempted.value = false;
  parentId.value = parent;
  editingNode.value = node;
  Object.assign(form, {
    // 新建时层级取上级的下一级、排序排在最后，都还能改
    level: node
      ? node.level
      : defaultChildOrgLevel(
          props.nodes.find((item) => item.id === parent)?.level,
          parent === null,
        ),
    name: node?.name ?? '',
    sortOrder: node ? node.sortOrder : nextOrgSortOrder(props.nodes, parent),
  });
  dirtyGuard.markClean();
  visible.value = true;
}

const openCreate = (parent: null | number) => show(parent, null);
const openEdit = (node: OrgUnitNode) => show(node.parentId, node);

async function cancel() {
  if (await dirtyGuard.confirmClose()) {
    visible.value = false;
  }
}

async function save() {
  validationAttempted.value = true;
  if (!form.name.trim()) {
    message.warning('请输入组织名称');
    return;
  }
  if (!levelAllowed(form.level)) {
    message.warning(ORG_LEAF_MESSAGE);
    return;
  }
  if (levelInverted.value) {
    message.warning(ORG_LEVEL_INVERTED_MESSAGE);
    return;
  }
  saving.value = true;
  try {
    if (!editingNode.value) {
      await api.createOrgUnit({
        level: form.level || null,
        name: form.name.trim(),
        parentId: parentId.value,
        sortOrder: form.sortOrder,
      });
      message.success('组织已创建');
    } else {
      await api.updateOrgUnit(editingNode.value.id, {
        level: form.level || null,
        name: form.name.trim(),
        parentId: editingNode.value.parentId,
        sortOrder: form.sortOrder,
      });
      message.success('组织已更新');
    }
    visible.value = false;
    emit('saved');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

defineExpose({ openCreate, openEdit });
</script>

<template>
  <a-modal
    :open="visible"
    :title="editingNode ? '编辑组织' : '新建组织'"
    :width="480"
    destroy-on-close
    @cancel="cancel"
  >
    <a-form layout="vertical">
      <a-row :gutter="16">
        <a-col :span="24">
          <a-form-item
            html-for="org-name"
            label="组织名称"
            required
            v-bind="
              fieldError(
                validationAttempted && !form.name.trim()
                  ? '请输入组织名称'
                  : undefined,
              )
            "
          >
            <a-input
              id="org-name"
              v-model:value="form.name"
              :maxlength="64"
              placeholder="如：电控事业部"
              allow-clear
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item
            html-for="org-level"
            label="层级"
            v-bind="
              fieldError(
                !validationAttempted
                  ? undefined
                  : !levelAllowed(form.level)
                    ? ORG_LEAF_MESSAGE
                    : levelInverted
                      ? ORG_LEVEL_INVERTED_MESSAGE
                      : undefined,
              )
            "
            extra="事业部 > 部门 > 课别，允许跳级；课别下面不能再有组织"
          >
            <a-select
              id="org-level"
              v-model:value="form.level"
              :options="levelOptions"
              placeholder="选择层级"
              show-search
              option-filter-prop="label"
              allow-clear
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item html-for="org-sort-order" label="同级排序">
            <a-input-number
              id="org-sort-order"
              v-model:value="form.sortOrder"
              :min="0"
              class="full-width"
            />
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
    <template #footer>
      <a-button @click="cancel">取消</a-button>
      <a-button type="primary" :loading="saving" @click="save">保存</a-button>
    </template>
  </a-modal>
</template>
