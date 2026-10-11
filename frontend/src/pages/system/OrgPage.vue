<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
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
import { fieldError } from '@/pages/shared/form';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { confirmDelete } from '@/pages/shared/save-feedback';
import { cellText, rowClick, scrollX } from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { message } from 'ant-design-vue';

import '../shared/selection-page.css';

const { canWrite } = useAccess();
const writable = computed(() => canWrite('rbac:org:write'));
const loading = ref(false);
const nodes = ref<OrgUnitNode[]>([]);
const selectedId = ref<number | null>(null);
const dialogOpen = ref(false);
const dialogParent = ref<null | number>(null);
const editingNode = ref<null | OrgUnitNode>(null);
const validationAttempted = ref(false);
const saving = ref(false);
const form = reactive({
  level: '' as string | null,
  name: '',
  sortOrder: 0,
});
const dirtyGuard = useDirtyGuard(form);

const tree = computed(() => buildOrgTree(nodes.value));
const tableRows = computed(() =>
  flattenOrgTree(tree.value).map(({ node, depth }) => ({ ...node, depth })),
);
const columns = computed<TableColumnType[]>(() => {
  const cols: TableColumnType[] = [
    {
      key: 'name',
      dataIndex: 'name',
      title: '名称',
      width: 220,
      align: 'left',
      fixed: 'left',
    },
    { key: 'level', dataIndex: 'level', title: '层级', width: 100 },
    // 计数列右对齐：表格已启用等宽数字，右对齐才能逐位比较大小。
    {
      key: 'childCount',
      dataIndex: 'childCount',
      title: '子节点',
      width: 88,
      align: 'center',
    },
    {
      key: 'userCount',
      dataIndex: 'userCount',
      title: '人数',
      width: 72,
      align: 'center',
    },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', title: '操作', width: 128, fixed: 'right' });
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
    message.error(
      error instanceof ApiError ? error.message : '加载组织架构失败',
    );
  } finally {
    loading.value = false;
  }
}

function openCreate(parentId: null | number) {
  validationAttempted.value = false;
  dialogParent.value = parentId;
  editingNode.value = null;
  Object.assign(form, { level: null, name: '', sortOrder: 0 });
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

function activateOrg(node: OrgUnitNode) {
  selectedId.value = node.id;
  if (writable.value) openEdit(node);
}

function openEdit(node: OrgUnitNode) {
  validationAttempted.value = false;
  dialogParent.value = node.parentId;
  editingNode.value = node;
  Object.assign(form, {
    level: node.level,
    name: node.name,
    sortOrder: node.sortOrder,
  });
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

async function cancelDialog() {
  if (await dirtyGuard.confirmClose()) {
    dialogOpen.value = false;
  }
}

async function saveOrg() {
  validationAttempted.value = true;
  if (!form.name.trim()) {
    message.warning('请输入组织名称');
    return;
  }
  if (
    !canPlaceOrgLevel(parentNode.value?.level, form.level) ||
    descendantLevels.value.some((level) => !canPlaceOrgLevel(form.level, level))
  ) {
    message.warning(ORG_LEVEL_INVERTED_MESSAGE);
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
    dialogOpen.value = false;
    await loadData();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function removeOrg(node: OrgUnitNode) {
  const ok = await confirmDelete('删除组织', `确定删除组织“${node.name}”？`);
  if (!ok) return;
  try {
    await api.deleteOrgUnit(node.id);
    message.success('组织已删除');
    await loadData();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '删除失败');
  }
}
</script>

<template>
  <section class="selection-page">
    <div class="selection-toolbar org-toolbar">
      <h1 class="visually-hidden">组织架构</h1>
      <a-button v-if="writable" type="primary" @click="openCreate(null)">
        新建组织
      </a-button>
    </div>
    <a-table
      :columns="columns"
      :data-source="tableRows"
      :row-class-name="
        (row: OrgUnitNode) =>
          row.id === selectedId ? 'ant-table-row-selected' : ''
      "
      row-key="id"
      :loading="loading"
      :pagination="false"
      :scroll="{ x: scrollX(columns) }"
      :locale="{ emptyText: '暂无组织' }"
      :custom-row="rowClick(activateOrg)"
    >
      <template #bodyCell="{ column, record: row, text: value }">
        <template v-if="column.key === 'name'">
          <span
            class="org-tree__name"
            :style="{
              paddingInlineStart: `calc(${row.depth} * var(--space-5))`,
            }"
          >
            {{ row.name }}
          </span>
        </template>
        <template v-else-if="column.key === 'level'">
          <a-tag v-if="row.level">{{ row.level }}</a-tag>
          <span v-else>—</span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <a-space :size="4">
            <a-tooltip title="新建子节点">
              <a-button
                type="text"
                size="small"
                aria-label="新建子节点"
                @click.stop="openCreate(row.id)"
              >
                <template #icon><Plus :size="14" /></template>
              </a-button>
            </a-tooltip>
            <a-tooltip title="编辑">
              <a-button
                type="text"
                size="small"
                aria-label="编辑"
                @click.stop="openEdit(row)"
              >
                <template #icon><Pencil :size="14" /></template>
              </a-button>
            </a-tooltip>
            <a-tooltip title="删除">
              <a-button
                type="text"
                size="small"
                danger
                aria-label="删除"
                @click.stop="removeOrg(row)"
              >
                <template #icon><Trash2 :size="14" /></template>
              </a-button>
            </a-tooltip>
          </a-space>
        </template>
        <template v-else>{{ cellText(value) }}</template>
      </template>
    </a-table>
    <a-modal
      :open="dialogOpen"
      :title="editingNode ? '编辑组织' : '新建组织'"
      :width="480"
      destroy-on-close
      @cancel="cancelDialog"
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
                  validationAttempted &&
                    (!canPlaceOrgLevel(parentNode?.level, form.level) ||
                      descendantLevels.some(
                        (level) => !canPlaceOrgLevel(form.level, level),
                      ))
                    ? ORG_LEVEL_INVERTED_MESSAGE
                    : undefined,
                )
              "
              extra="事业部 > 部门 > 课别，允许跳级"
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
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <template #footer>
        <a-button @click="cancelDialog">取消</a-button>
        <a-button type="primary" :loading="saving" @click="saveOrg">
          保存
        </a-button>
      </template>
    </a-modal>
  </section>
</template>
