<script setup lang="ts">
import { Pencil, Plus, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref } from 'vue';

import { api, ApiError, type OrgUnitNode } from '@/api';
import {
  allowedOrgLevels,
  buildOrgTree,
  canPlaceOrgLevel,
  collectDescendantLevels,
  flattenOrgTree,
  ORG_LEVEL_INVERTED_MESSAGE,
} from '@/pages/system/org-tree';
import { confirmDelete } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { toast } from '@/ui/toast';
import {
  ABadge,
  AButton,
  AField,
  AFormGrid,
  AFormRow,
  AIconButton,
  ASelect,
  ASheet,
  AStepper,
  ATable,
  type TableColumn,
} from '@/ui';

import '../shared/selection-page.css';

const { canWrite } = useAccess();
const writable = computed(() => canWrite('rbac:org:write'));
const loading = ref(false);
const nodes = ref<OrgUnitNode[]>([]);
const selectedId = ref<number | null>(null);
const dialogOpen = ref(false);
const dialogParent = ref<null | number>(null);
const editingNode = ref<null | OrgUnitNode>(null);
const saving = ref(false);
const form = reactive({
  level: '' as string | null,
  name: '',
  sortOrder: 0,
});

const tree = computed(() => buildOrgTree(nodes.value));
const tableRows = computed(() =>
  flattenOrgTree(tree.value).map(({ node, depth }) => ({ ...node, depth })),
);
const columns = computed<TableColumn[]>(() => {
  const cols: TableColumn[] = [
    { key: 'name', label: '名称', minWidth: 220, align: 'start' },
    { key: 'level', label: '层级', width: 100 },
    { key: 'childCount', label: '子节点', width: 88 },
    { key: 'userCount', label: '人数', width: 72 },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', label: '操作', width: 128, fixed: 'end' });
  }
  return cols;
});
const parentNode = computed(() =>
  nodes.value.find((node) => node.id === dialogParent.value),
);
const descendantLevels = computed(() =>
  editingNode.value
    ? collectDescendantLevels(nodes.value, editingNode.value.id)
    : [],
);
const levelOptions = computed(() => {
  const parentLevel = parentNode.value?.level;
  const names = new Set(allowedOrgLevels(parentLevel, descendantLevels.value));
  for (const extra of nodes.value.map((node) => node.level)) {
    if (
      extra &&
      canPlaceOrgLevel(parentLevel, extra) &&
      descendantLevels.value.every((item) => canPlaceOrgLevel(extra, item))
    ) {
      names.add(extra);
    }
  }
  if (form.level) names.add(form.level);
  return [...names].map((name) => ({ label: name, value: name }));
});

onMounted(loadData);

async function loadData() {
  loading.value = true;
  try {
    nodes.value = await api.listOrgUnits();
    if (
      selectedId.value &&
      !nodes.value.some((node) => node.id === selectedId.value)
    ) {
      selectedId.value = null;
    }
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : '加载组织架构失败');
  } finally {
    loading.value = false;
  }
}

function openCreate(parentId: null | number) {
  dialogParent.value = parentId;
  editingNode.value = null;
  Object.assign(form, { level: null, name: '', sortOrder: 0 });
  dialogOpen.value = true;
}

function openEdit(node: OrgUnitNode) {
  dialogParent.value = node.parentId;
  editingNode.value = node;
  Object.assign(form, {
    level: node.level,
    name: node.name,
    sortOrder: node.sortOrder,
  });
  dialogOpen.value = true;
}

async function saveOrg() {
  if (!form.name.trim()) {
    toast.warning('请输入组织名称');
    return;
  }
  if (
    !canPlaceOrgLevel(parentNode.value?.level, form.level) ||
    descendantLevels.value.some(
      (level) => !canPlaceOrgLevel(form.level, level),
    )
  ) {
    toast.warning(ORG_LEVEL_INVERTED_MESSAGE);
    return;
  }
  saving.value = true;
  try {
    if (!editingNode.value) {
      await api.createOrgUnit({
        level: form.level || null,
        name: form.name.trim(),
        parentId: dialogParent.value,
        sortOrder: form.sortOrder,
      });
      toast.success('组织已创建');
    } else {
      await api.updateOrgUnit(editingNode.value.id, {
        level: form.level || null,
        name: form.name.trim(),
        parentId: editingNode.value.parentId,
        sortOrder: form.sortOrder,
      });
      toast.success('组织已更新');
    }
    dialogOpen.value = false;
    await loadData();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function removeOrg(node: OrgUnitNode) {
  const ok = await confirmDelete('删除组织', `确定删除组织“${node.name}”？`);
  if (!ok) return;
  try {
    await api.deleteOrgUnit(node.id);
    toast.success('组织已删除');
    await loadData();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '删除失败');
  }
}
</script>

<template>
  <section class="selection-page">
    <div class="selection-toolbar">
      <h1 class="docs-heading">组织架构</h1>
      <AButton v-if="writable" variant="filled" @click="openCreate(null)">
        新建组织
      </AButton>
    </div>
    <ATable
      v-model:selected-key="selectedId"
      :columns="columns"
      :rows="tableRows"
      row-key="id"
      empty-text="暂无组织"
      :loading="loading"
      striped
    >
      <template #cell-name="{ row }">
        <span
          class="org-tree__name"
          :style="{ paddingInlineStart: `calc(${row.depth} * var(--space-5))` }"
        >
          {{ row.name }}
        </span>
      </template>
      <template #cell-level="{ row }">
        <ABadge v-if="row.level" :label="row.level" />
        <span v-else>—</span>
      </template>
      <template #cell-actions="{ row }">
        <div class="table-actions">
          <AIconButton
            :icon="Plus"
            label="新建子节点"
            size="small"
            @click.stop="openCreate(row.id)"
          />
          <AIconButton
            :icon="Pencil"
            label="编辑"
            size="small"
            @click.stop="openEdit(row)"
          />
          <AIconButton
            :icon="Trash2"
            label="删除"
            size="small"
            variant="destructive"
            @click.stop="removeOrg(row)"
          />
        </div>
      </template>
    </ATable>
    <ASheet
      v-model:open="dialogOpen"
      :title="editingNode ? '编辑组织' : '新建组织'"
      :width="480"
    >
      <AFormGrid :columns="1">
        <AFormRow label="组织名称" required>
          <AField v-model="form.name" :maxlength="64" placeholder="如：电控事业部" />
        </AFormRow>
        <AFormRow
          label="层级"
          hint="事业部 > 部门 > 课别，允许跳级"
        >
          <ASelect
            v-model="form.level"
            :options="levelOptions"
            filterable
            clearable
            placeholder="选择层级"
          />
        </AFormRow>
        <AFormRow label="同级排序">
          <AStepper v-model="form.sortOrder" :min="0" />
        </AFormRow>
      </AFormGrid>
      <template #footer>
        <AButton @click="dialogOpen = false">取消</AButton>
        <AButton variant="filled" :loading="saving" @click="saveOrg">保存</AButton>
      </template>
    </ASheet>
  </section>
</template>
