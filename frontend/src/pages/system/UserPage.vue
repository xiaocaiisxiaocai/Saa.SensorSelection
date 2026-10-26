<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { message } from 'ant-design-vue';
import { KeyRound, Pencil, RotateCcw, Search, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';

import {
  api,
  ApiError,
  type OrgUnitNode,
  type RbacRole,
  type RbacUser,
} from '@/api';
import { formatLocalDateTime } from '@/domain';
import AdminColumnSettingsMenu from '@/pages/shared/AdminColumnSettingsMenu.vue';
import { useManagedTableColumns } from '@/pages/shared/managed-table-columns';
import { confirmDelete } from '@/pages/shared/save-feedback';
import {
  cellText,
  rowClick,
  scrollX,
  useTablePagination,
} from '@/pages/shared/table';
import UserFormDialog from '@/pages/system/user/UserFormDialog.vue';
import UserPasswordDialog from '@/pages/system/user/UserPasswordDialog.vue';
import { useAccess, useAuthStore } from '@/stores/auth';
import { AHighlightText } from '@/ui';

import '../shared/selection-page.css';

const { canWrite } = useAccess();
const auth = useAuthStore();
const writable = computed(() => canWrite('rbac:user:write'));
const loading = ref(false);
const users = ref<RbacUser[]>([]);
const roles = ref<RbacRole[]>([]);
const orgUnits = ref<OrgUnitNode[]>([]);
const query = ref('');
const formDialog = ref<InstanceType<typeof UserFormDialog>>();
const passwordDialog = ref<InstanceType<typeof UserPasswordDialog>>();

const baseColumns = computed<TableColumnType[]>(() => {
  const cols: TableColumnType[] = [
    {
      key: 'username',
      dataIndex: 'username',
      title: '用户名',
      width: 160,
      fixed: 'left',
    },
    {
      key: 'displayName',
      dataIndex: 'displayName',
      title: '显示名',
      width: 140,
    },
    { key: 'roles', dataIndex: 'roles', title: '角色', width: 160 },
    { key: 'org', dataIndex: 'org', title: '所属组织', width: 180 },
    { key: 'status', dataIndex: 'status', title: '状态', width: 88 },
    {
      key: 'createdAt',
      dataIndex: 'createdAt',
      title: '创建时间',
      width: 192,
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
} = useManagedTableColumns('users', () => baseColumns.value);

onMounted(loadData);

async function loadData() {
  loading.value = true;
  try {
    const [userList, roleList, orgList] = await Promise.all([
      api.listUsers(),
      api.listRoles(),
      api.listOrgUnits(),
    ]);
    users.value = userList;
    roles.value = roleList;
    orgUnits.value = orgList;
  } catch (error) {
    message.error(
      error instanceof ApiError ? error.message : '加载用户列表失败',
    );
  } finally {
    loading.value = false;
  }
}

function openEdit(user: RbacUser) {
  formDialog.value?.openEdit(user);
}

function isSelf(user: RbacUser) {
  return Boolean(auth.profile) && auth.profile?.username === user.username;
}

function isLastActiveAdmin(user: RbacUser) {
  if (!user.isActive || !user.roles.some((role) => role.code === 'admin')) {
    return false;
  }
  const activeAdmins = users.value.filter(
    (candidate) =>
      candidate.isActive &&
      candidate.roles.some((role) => role.code === 'admin'),
  );
  return activeAdmins.length <= 1;
}

function deleteBlockedReason(user: RbacUser): string | undefined {
  if (isSelf(user)) return '不能删除当前登录账号';
  if (isLastActiveAdmin(user)) return '至少保留一个启用的系统管理员';
  return undefined;
}

async function removeUser(user: RbacUser) {
  const blockedReason = deleteBlockedReason(user);
  if (blockedReason) {
    message.warning(blockedReason);
    return;
  }
  const ok = await confirmDelete(
    '删除用户',
    `确定删除用户“${user.displayName}（${user.username}）”？此操作不可恢复。`,
  );
  if (!ok) return;
  try {
    await api.deleteUser(user.id);
    message.success('用户已删除');
    await loadData();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '删除失败');
  }
}

function orgPath(user: RbacUser) {
  return user.orgUnit?.path || '—';
}

// 关键字匹配用户名、显示名、角色名和组织路径
const filteredUsers = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase('zh-CN');
  if (!keyword) return users.value;
  return users.value.filter((user) =>
    [
      user.username,
      user.displayName,
      ...user.roles.map((role) => role.name),
      user.orgUnit?.path ?? '',
    ].some((text) => text.toLocaleLowerCase('zh-CN').includes(keyword)),
  );
});

// 分页条始终显示；换关键字回到第一页
const { pagination, onChange: onPageChange } = useTablePagination(
  () => filteredUsers.value.length,
  [() => query.value],
);
</script>

<template>
  <section class="selection-page">
    <div class="selection-toolbar">
      <h1 class="visually-hidden">用户管理</h1>
      <a-input
        v-model:value="query"
        class="selection-toolbar__filter"
        placeholder="搜索用户名、显示名、角色或组织"
        aria-label="搜索用户"
        allow-clear
      >
        <template #prefix><Search :size="14" /></template>
      </a-input>
      <a-button
        type="text"
        :disabled="!query"
        aria-label="重置筛选"
        @click="query = ''"
      >
        <template #icon><RotateCcw :size="14" /></template>
        重置
      </a-button>
      <a-button
        v-if="writable"
        type="primary"
        @click="formDialog?.openCreate()"
      >
        新增用户
      </a-button>
      <AdminColumnSettingsMenu
        :can-manage="canManageColumns"
        :columns="columnOptions"
        :hidden="hiddenColumns"
        :on-set-visible="setColumnVisible"
        :on-show-all="showAllColumns"
      />
    </div>
    <a-table
      :columns="columns"
      :data-source="filteredUsers"
      row-key="id"
      :loading="loading"
      :pagination="pagination"
      :scroll="{ x: scrollX(columns) }"
      :locale="{ emptyText: query.trim() ? '没有匹配的用户' : '暂无用户' }"
      :custom-row="writable ? rowClick(openEdit) : undefined"
      @resize-column="onResizeColumn"
      @change="onPageChange"
    >
      <template #bodyCell="{ column, record: row, text: value }">
        <template v-if="column.key === 'roles'">
          <a-space :size="[4, 4]" wrap>
            <a-tag v-for="role in row.roles" :key="role.id">
              <AHighlightText :text="role.name" :query="query" />
            </a-tag>
          </a-space>
        </template>
        <template v-else-if="column.key === 'org'">
          <AHighlightText :text="orgPath(row)" :query="query" />
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="row.isActive ? 'green' : 'default'">
            {{ row.isActive ? '启用' : '停用' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'createdAt'">
          <span class="user-created-at">{{
            formatLocalDateTime(new Date(row.createdAt))
          }}</span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <a-space :size="4">
            <a-tooltip title="编辑">
              <a-button
                type="text"
                size="small"
                aria-label="编辑"
                @click="openEdit(row)"
              >
                <template #icon><Pencil :size="14" /></template>
              </a-button>
            </a-tooltip>
            <a-tooltip title="重置密码">
              <a-button
                type="text"
                size="small"
                aria-label="重置密码"
                @click="passwordDialog?.open(row)"
              >
                <template #icon><KeyRound :size="14" /></template>
              </a-button>
            </a-tooltip>
            <a-tooltip :title="deleteBlockedReason(row) ?? '删除'">
              <a-button
                type="text"
                size="small"
                danger
                aria-label="删除"
                :disabled="Boolean(deleteBlockedReason(row))"
                @click="removeUser(row)"
              >
                <template #icon><Trash2 :size="14" /></template>
              </a-button>
            </a-tooltip>
          </a-space>
        </template>
        <template v-else>
          <AHighlightText :text="cellText(value)" :query="query" />
        </template>
      </template>
    </a-table>
    <UserFormDialog
      ref="formDialog"
      :roles="roles"
      :org-units="orgUnits"
      @saved="loadData"
    />
    <UserPasswordDialog ref="passwordDialog" />
  </section>
</template>

<style scoped src="./UserPage.css"></style>
