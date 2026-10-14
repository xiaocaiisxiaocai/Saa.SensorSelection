<script setup lang="ts">
import { message } from 'ant-design-vue';
import { computed, reactive, ref } from 'vue';

import { api, type OrgUnitNode } from '@/api';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import {
  nextOrgSortOrder,
  ORG_LEVELS,
  ORG_PARENT_LEVEL_MISSING_MESSAGE,
  orgLevelUnder,
} from '@/pages/system/org-tree';

/**
 * 新建 / 编辑组织节点。层级必须逐级（事业部 > 部门 > 课别），由所在位置决定，
 * 只显示不让选；新建时同级排序自动排在最后，编辑时才能改。
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
  name: '',
  sortOrder: 0,
});
const dirtyGuard = useDirtyGuard(form);

const level = computed(() =>
  orgLevelUnder(
    props.nodes.find((node) => node.id === parentId.value)?.level,
    parentId.value === null,
  ),
);
const NAME_EXAMPLES: Record<string, string> = {
  事业部: '如：电控事业部',
  部门: '如：标准件组',
  课别: '如：选型课',
};
const LEVEL_HINT = ORG_LEVELS.join(' > ') + '，逐级设置，由所在位置决定';

function show(parent: null | number, node: null | OrgUnitNode) {
  validationAttempted.value = false;
  parentId.value = parent;
  editingNode.value = node;
  Object.assign(form, {
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
  if (!level.value) {
    message.warning(ORG_PARENT_LEVEL_MISSING_MESSAGE);
    return;
  }
  saving.value = true;
  try {
    if (!editingNode.value) {
      await api.createOrgUnit({
        level: level.value,
        name: form.name.trim(),
        parentId: parentId.value,
        sortOrder: form.sortOrder,
      });
      message.success('组织已创建');
    } else {
      await api.updateOrgUnit(editingNode.value.id, {
        level: level.value,
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
              :placeholder="NAME_EXAMPLES[level ?? ''] ?? '组织名称'"
              allow-clear
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item label="层级" :extra="LEVEL_HINT">
            <a-tag v-if="level">{{ level }}</a-tag>
            <span v-else class="org-form__level-missing">
              {{ ORG_PARENT_LEVEL_MISSING_MESSAGE }}
            </span>
          </a-form-item>
        </a-col>
        <a-col v-if="editingNode" :span="24">
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

<style scoped src="./OrgFormDialog.css"></style>
