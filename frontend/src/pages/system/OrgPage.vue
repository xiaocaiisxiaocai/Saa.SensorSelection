<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { message } from 'ant-design-vue';
import { Pencil, Plus, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';

import { api, ApiError, type OrgUnitNode } from '@/api';
import { confirmDelete } from '@/pages/shared/save-feedback';
import {
  cellText,
  rowClick,
  scrollX,
  useTablePagination,
} from '@/pages/shared/table';
import OrgFormDialog from '@/pages/system/org/OrgFormDialog.vue';
import { buildOrgTree, flattenOrgTree } from '@/pages/system/org-tree';
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

// 分页条始终显示
const { pagination, onChange: onPageChange } = useTablePagination(
  () => tableRows.value.length,
);
</script>

<template>
  <section class="selection-page">
    <div class="selection-toolbar org-toolbar">
      <h1 class="visually-hidden">组织架构</h1>
      <a-button
        v-if="writable"
        type="primary"
        @click="formDialog?.openCreate(null)"
      >
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
      :pagination="pagination"
      :scroll="{ x: scrollX(columns) }"
      :locale="{ emptyText: '暂无组织' }"
      :custom-row="rowClick(activateOrg)"
      @change="onPageChange"
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
            <a-tooltip title="新建子节点">
              <a-button
                type="text"
                size="small"
                aria-label="新建子节点"
                @click.stop="formDialog?.openCreate(row.id)"
              >
                <template #icon><Plus :size="14" /></template>
              </a-button>
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
    <OrgFormDialog ref="formDialog" :nodes="nodes" @saved="loadData" />
  </section>
</template>

<style scoped src="./OrgPage.css"></style>
