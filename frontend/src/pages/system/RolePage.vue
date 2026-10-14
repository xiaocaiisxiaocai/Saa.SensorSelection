<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { message } from 'ant-design-vue';
import { Pencil, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';

import { api, ApiError, type PermissionInfo, type RbacRole } from '@/api';
import { confirmDelete } from '@/pages/shared/save-feedback';
import {
  cellText,
  rowClick,
  scrollX,
  useTablePagination,
} from '@/pages/shared/table';
import RoleFormDialog from '@/pages/system/role/RoleFormDialog.vue';
import { useAccess } from '@/stores/auth';

import '../shared/selection-page.css';

const { canWrite } = useAccess();
const writable = computed(() => canWrite('rbac:role:write'));
const loading = ref(false);
const roles = ref<RbacRole[]>([]);
const permissions = ref<PermissionInfo[]>([]);
const formDialog = ref<InstanceType<typeof RoleFormDialog>>();

const columns = computed<TableColumnType[]>(() => {
  const cols: TableColumnType[] = [
    {
      key: 'code',
      dataIndex: 'code',
      title: '标识',
      width: 140,
      fixed: 'left',
    },
    {
      key: 'name',
      dataIndex: 'name',
      title: '名称',
      width: 160,
    },
    { key: 'description', dataIndex: 'description', title: '描述', width: 180 },
    { key: 'permissions', dataIndex: 'permissions', title: '权限', width: 240 },
    { key: 'kind', dataIndex: 'kind', title: '类型', width: 100 },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', title: '操作', width: 96, fixed: 'right' });
  }
  return cols;
});

onMounted(loadData);

async function loadData() {
  loading.value = true;
  try {
    const [roleList, permissionList] = await Promise.all([
      api.listRoles(),
      api.listPermissions(),
    ]);
    roles.value = roleList;
    permissions.value = permissionList;
  } catch (error) {
    message.error(
      error instanceof ApiError ? error.message : '加载角色列表失败',
    );
  } finally {
    loading.value = false;
  }
}

function isProtected(role: RbacRole) {
  return role.isSystem || role.code === 'admin';
}

function protectedReason(role: RbacRole) {
  return isProtected(role) ? '系统内置角色，不可修改或删除' : undefined;
}

function openEdit(role: RbacRole) {
  formDialog.value?.openEdit(role);
}

function activateRole(role: RbacRole) {
  if (writable.value && !isProtected(role)) openEdit(role);
}

async function removeRole(role: RbacRole) {
  const ok = await confirmDelete(
    '删除角色',
    `确定删除角色“${role.name}（${role.code}）”？`,
  );
  if (!ok) return;
  try {
    await api.deleteRole(role.id);
    message.success('角色已删除');
    await loadData();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '删除失败');
  }
}

// 分页条始终显示
const { pagination, onChange: onPageChange } = useTablePagination(
  () => roles.value.length,
);
</script>

<template>
  <section class="selection-page">
    <div class="selection-toolbar role-toolbar">
      <h1 class="visually-hidden">角色管理</h1>
      <a-button
        v-if="writable"
        type="primary"
        @click="formDialog?.openCreate()"
      >
        新增角色
      </a-button>
    </div>
    <a-table
      :columns="columns"
      :data-source="roles"
      row-key="id"
      :loading="loading"
      :pagination="pagination"
      :scroll="{ x: scrollX(columns) }"
      :locale="{ emptyText: '暂无角色' }"
      :custom-row="rowClick(activateRole)"
      @change="onPageChange"
    >
      <template #bodyCell="{ column, record: row, text: value }">
        <template v-if="column.key === 'description'">
          {{ value || '—' }}
        </template>
        <template v-else-if="column.key === 'permissions'">
          <a-space :size="[4, 4]" wrap>
            <a-tag v-for="permission in row.permissions" :key="permission.code">
              {{ permission.name }}
            </a-tag>
            <span v-if="row.permissions.length === 0">无权限</span>
          </a-space>
        </template>
        <template v-else-if="column.key === 'kind'">
          <a-tag :color="row.isSystem ? 'purple' : 'default'">
            {{ row.isSystem ? '系统内置' : '自定义' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'actions'">
          <a-space :size="4">
            <a-tooltip :title="protectedReason(row) ?? '编辑'">
              <a-button
                type="text"
                size="small"
                aria-label="编辑"
                :disabled="isProtected(row)"
                @click="openEdit(row)"
              >
                <template #icon><Pencil :size="14" /></template>
              </a-button>
            </a-tooltip>
            <a-tooltip :title="protectedReason(row) ?? '删除'">
              <a-button
                type="text"
                size="small"
                danger
                aria-label="删除"
                :disabled="isProtected(row)"
                @click="removeRole(row)"
              >
                <template #icon><Trash2 :size="14" /></template>
              </a-button>
            </a-tooltip>
          </a-space>
        </template>
        <template v-else>{{ cellText(value) }}</template>
      </template>
    </a-table>
    <RoleFormDialog
      ref="formDialog"
      :permissions="permissions"
      @saved="loadData"
    />
  </section>
</template>
