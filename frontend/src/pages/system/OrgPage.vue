<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { message } from 'ant-design-vue';
import { Pencil, Plus, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';

import { api, ApiError, type OrgUnitNode } from '@/api';
import AdminColumnSettingsMenu from '@/pages/shared/AdminColumnSettingsMenu.vue';
import { useManagedTableColumns } from '@/pages/shared/managed-table-columns';
import { confirmDelete } from '@/pages/shared/save-feedback';
import {
  cellText,
  PAGINATION_PROPS,
  rowClick,
  scrollX,
} from '@/pages/shared/table';
import OrgFormDialog from '@/pages/system/org/OrgFormDialog.vue';
import {
  buildOrgTree,
  canHaveOrgChildren,
  flattenOrgTree,
  ORG_LEAF_MESSAGE,
  orgDeleteBlockedReason,
} from '@/pages/system/org-tree';
import { useAccess } from '@/stores/auth';

import '../shared/selection-page.css';

const { canWrite } = useAccess();
const writable = computed(() => canWrite('rbac:org:write'));
const loading = ref(false);
const nodes = ref<OrgUnitNode[]>([]);
const selectedId = ref<number | null>(null);
const formDialog = ref<InstanceType<typeof OrgFormDialog>>();

const tree = computed(() => buildOrgTree(nodes.value));
// 表格已按层级展平并用缩进表示上下级；行里不能带 children，
// 否则 antd 会把它当成树形表格，每行都多出一个「+」展开按钮。
const tableRows = computed(() =>
  flattenOrgTree(tree.value).map(
    ({ node: { children: _, ...node }, depth }) => ({
      ...node,
      depth,
    }),
  ),
);
// 按顶级节点整棵分页，子节点不和上级拆到两页
function packOrgPages<T extends { depth: number }>(
  rows: readonly T[],
  pageSize: number,
): T[][] {
  const groups: T[][] = [];
  for (const row of rows) {
    if (row.depth === 0 || groups.length === 0) groups.push([row]);
    else groups[groups.length - 1]?.push(row);
  }
  const pages: T[][] = [];
  let current: T[] = [];
  for (const group of groups) {
    if (current.length > 0 && current.length + group.length > pageSize) {
      pages.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}
const baseColumns = computed<TableColumnType[]>(() => {
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
    cols.push({ key: 'actions', title: '操作', width: 128 });
  }
  return cols;
});
const {
  canManage: canManageColumns,
  columns,
  hidden: hiddenColumns,
  onResizeColumn,
  options: columnOptions,
  setVisible: setColumnVisible,
  showAll: showAllColumns,
} = useManagedTableColumns('org-units', () => baseColumns.value);

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

function activateOrg(node: OrgUnitNode) {
  selectedId.value = node.id;
  if (writable.value) formDialog.value?.openEdit(node);
}

async function removeOrg(node: OrgUnitNode) {
  const ok = await confirmDelete(
    '删除组织',
    `确定删除组织“${node.name}”？此操作不可恢复。`,
  );
  if (!ok) return;
  try {
    await api.deleteOrgUnit(node.id);
    message.success('组织已删除');
    await loadData();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '删除失败');
  }
}

// 分页条始终显示。页码按打包后的页数走，条数仍是全部节点。
const page = ref(1);
const pageSize = ref(20);
const packedRows = computed(() =>
  packOrgPages(tableRows.value, pageSize.value),
);
watch(packedRows, (pages) => {
  if (page.value > pages.length) page.value = Math.max(1, pages.length);
});
const visibleRows = computed(
  () => packedRows.value[page.value - 1] ?? [],
);

function onOrgPageChange(current: number, size: number) {
  if (size !== pageSize.value) {
    pageSize.value = size;
    page.value = 1;
    return;
  }
  page.value = current;
}
</script>

<template>
  <section class="selection-page">
    <div class="selection-toolbar org-toolbar">
      <h1 class="visually-hidden">组织架构</h1>
      <div class="selection-toolbar__actions">
        <AdminColumnSettingsMenu
          :can-manage="canManageColumns"
          :columns="columnOptions"
          :hidden="hiddenColumns"
          :on-set-visible="setColumnVisible"
          :on-show-all="showAllColumns"
        />
        <a-button
          v-if="writable"
          type="primary"
          @click="formDialog?.openCreate(null)"
        >
          新建组织
        </a-button>
      </div>
    </div>
    <a-table
      :columns="columns"
      :data-source="visibleRows"
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
      @resize-column="onResizeColumn"
    >
      <template #bodyCell="{ column, record: row, text: value }">
        <template v-if="column.key === 'name'">
          <span class="org-tree__name" :style="{ '--org-depth': row.depth }">
            {{ row.name }}
          </span>
        </template>
        <template v-else-if="column.key === 'level'">
          <a-tag v-if="row.level">{{ row.level }}</a-tag>
          <span v-else>—</span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <a-space :size="4">
            <a-tooltip
              :title="
                canHaveOrgChildren(row.level) ? '新建子节点' : ORG_LEAF_MESSAGE
              "
            >
              <span class="tooltip-host">
                <a-button
                  type="text"
                  size="small"
                  aria-label="新建子节点"
                  :disabled="!canHaveOrgChildren(row.level)"
                  @click.stop="formDialog?.openCreate(row.id)"
                >
                  <template #icon><Plus :size="14" /></template>
                </a-button>
              </span>
            </a-tooltip>
            <a-tooltip title="编辑">
              <a-button
                type="text"
                size="small"
                aria-label="编辑"
                @click.stop="formDialog?.openEdit(row)"
              >
                <template #icon><Pencil :size="14" /></template>
              </a-button>
            </a-tooltip>
            <a-tooltip :title="orgDeleteBlockedReason(row) ?? '删除'">
              <span class="tooltip-host">
                <a-button
                  type="text"
                  size="small"
                  danger
                  aria-label="删除"
                  :disabled="Boolean(orgDeleteBlockedReason(row))"
                  @click.stop="removeOrg(row)"
                >
                  <template #icon><Trash2 :size="14" /></template>
                </a-button>
              </span>
            </a-tooltip>
          </a-space>
        </template>
        <template v-else>{{ cellText(value) }}</template>
      </template>
    </a-table>
    <a-pagination
      v-bind="PAGINATION_PROPS"
      :current="page"
      :page-size="pageSize"
      :total="Math.max(pageSize, packedRows.length * pageSize)"
      :show-total="() => `共 ${tableRows.length} 条`"
      @change="onOrgPageChange"
    />
    <OrgFormDialog ref="formDialog" :nodes="nodes" @saved="loadData" />
  </section>
</template>

<style scoped src="./OrgPage.css"></style>
