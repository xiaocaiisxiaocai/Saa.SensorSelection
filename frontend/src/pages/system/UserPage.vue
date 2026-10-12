<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { KeyRound, Pencil, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref } from 'vue';

import {
  api,
  ApiError,
  type OrgUnitNode,
  type RbacRole,
  type RbacUser,
} from '@/api';
import { formatLocalDateTime } from '@/domain';
import { toTreeSelectNodes } from '@/pages/system/org-tree';
import { fieldError } from '@/pages/shared/form';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { confirmDelete } from '@/pages/shared/save-feedback';
import {
  cellText,
  rowClick,
  scrollX,
  sortBy,
  useTablePagination,
} from '@/pages/shared/table';
import { useAccess, useAuthStore } from '@/stores/auth';
import { message } from 'ant-design-vue';

import '../shared/selection-page.css';

const { canWrite } = useAccess();
const auth = useAuthStore();
const writable = computed(() => canWrite('rbac:user:write'));
const loading = ref(false);
const users = ref<RbacUser[]>([]);
const roles = ref<RbacRole[]>([]);
const orgUnits = ref<OrgUnitNode[]>([]);
const dialogOpen = ref(false);
const passwordOpen = ref(false);
const editingId = ref<number>();
const passwordUserId = ref<number>();
const saving = ref(false);
const passwordSaving = ref(false);
// 编辑前用户已绑定的角色。表单只支持选一个角色；多角色用户不重新选择时
// 保存要原样保留这些角色，不能提交空数组把角色全部清掉。
const originalRoles = ref<RbacUser['roles']>([]);
const userValidationAttempted = ref(false);
const passwordValidationAttempted = ref(false);
const form = reactive({
  displayName: '',
  isActive: true,
  orgUnitId: null as number | null,
  password: '',
  roleId: null as number | null,
  username: '',
});
const dirtyGuard = useDirtyGuard(form);
const newPassword = ref('');

const roleOptions = computed(() =>
  roles.value.map((role) => ({
    value: role.id,
    label: `${role.name}（${role.code}）`,
  })),
);
const hasMultipleOriginalRoles = computed(
  () => editingId.value !== undefined && originalRoles.value.length > 1,
);
const roleHint = computed(() =>
  hasMultipleOriginalRoles.value
    ? `当前绑定多个角色（${originalRoles.value.map((role) => role.name).join('、')}）；不选择则保存时保留原角色，选择后改为该单一角色。`
    : undefined,
);
const orgNodes = computed(() => toTreeSelectNodes(orgUnits.value));
const columns = computed<TableColumnType[]>(() => {
  const cols: TableColumnType[] = [
    {
      key: 'username',
      dataIndex: 'username',
      title: '用户名',
      width: 160,
      fixed: 'left',
      sorter: sortBy('username'),
    },
    {
      key: 'displayName',
      dataIndex: 'displayName',
      title: '显示名',
      width: 140,
      sorter: sortBy('displayName'),
    },
    { key: 'roles', dataIndex: 'roles', title: '角色', width: 160 },
    { key: 'org', dataIndex: 'org', title: '所属组织', width: 180 },
    { key: 'status', dataIndex: 'status', title: '状态', width: 88 },
    {
      key: 'createdAt',
      dataIndex: 'createdAt',
      title: '创建时间',
      width: 192,
      sorter: sortBy('createdAt'),
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

function openCreate() {
  userValidationAttempted.value = false;
  editingId.value = undefined;
  originalRoles.value = [];
  Object.assign(form, {
    displayName: '',
    isActive: true,
    orgUnitId: null,
    password: '',
    roleId: null,
    username: '',
  });
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

function openEdit(user: RbacUser) {
  userValidationAttempted.value = false;
  editingId.value = user.id;
  originalRoles.value = [...user.roles];
  Object.assign(form, {
    displayName: user.displayName,
    isActive: user.isActive,
    orgUnitId: user.orgUnit?.id ?? null,
    password: '',
    roleId: user.roles.length === 1 ? user.roles[0]!.id : null,
    username: user.username,
  });
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

function editedRoleIds(): number[] {
  if (form.roleId !== null) return [Number(form.roleId)];
  return hasMultipleOriginalRoles.value
    ? originalRoles.value.map((role) => role.id)
    : [];
}

async function cancelDialog() {
  if (await dirtyGuard.confirmClose()) {
    dialogOpen.value = false;
  }
}

async function saveUser() {
  if (saving.value) return;
  userValidationAttempted.value = true;
  // 字段级错误已经由用户名/显示名/密码输入框下方的红字分别说明——用一条
  // 合并成一句的 Toast 复述会跟哪个字段实际出错对不上。
  if (!form.username.trim() || !form.displayName.trim()) {
    return;
  }
  if (editingId.value === undefined && form.password.length < 4) {
    return;
  }
  saving.value = true;
  try {
    if (editingId.value === undefined) {
      await api.createUser({
        displayName: form.displayName.trim(),
        isActive: form.isActive,
        orgUnitId: form.orgUnitId,
        password: form.password,
        roleIds: form.roleId === null ? [] : [Number(form.roleId)],
        username: form.username.trim(),
      });
      message.success('用户已创建');
    } else {
      await api.updateUser(editingId.value, {
        displayName: form.displayName.trim(),
        isActive: form.isActive,
        orgUnitId: form.orgUnitId,
        roleIds: editedRoleIds(),
      });
      message.success('用户已更新');
    }
    dialogOpen.value = false;
    await loadData();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

function openPassword(user: RbacUser) {
  passwordValidationAttempted.value = false;
  passwordUserId.value = user.id;
  newPassword.value = '';
  passwordOpen.value = true;
}

async function savePassword() {
  if (!passwordUserId.value || passwordSaving.value) return;
  passwordValidationAttempted.value = true;
  if (newPassword.value.length < 4) {
    message.warning('新密码至少 4 位');
    return;
  }
  passwordSaving.value = true;
  try {
    await api.resetUserPassword(passwordUserId.value, newPassword.value);
    message.success('密码已重置');
    passwordOpen.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : '重置失败');
  } finally {
    passwordSaving.value = false;
  }
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

// 分页条始终显示
const { pagination, onChange: onPageChange } = useTablePagination(
  () => users.value.length,
);
</script>

<template>
  <section class="selection-page">
    <div class="selection-toolbar user-toolbar">
      <h1 class="visually-hidden">用户管理</h1>
      <a-button v-if="writable" type="primary" @click="openCreate">
        新增用户
      </a-button>
    </div>
    <a-table
      :columns="columns"
      :data-source="users"
      row-key="id"
      :loading="loading"
      :pagination="pagination"
      :scroll="{ x: scrollX(columns) }"
      :locale="{ emptyText: '暂无用户' }"
      :custom-row="writable ? rowClick(openEdit) : undefined"
      @change="onPageChange"
    >
      <template #bodyCell="{ column, record: row, text: value }">
        <template v-if="column.key === 'roles'">
          <a-space :size="[4, 4]" wrap>
            <a-tag v-for="role in row.roles" :key="role.id">
              {{ role.name }}
            </a-tag>
          </a-space>
        </template>
        <template v-else-if="column.key === 'org'">{{ orgPath(row) }}</template>
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
                @click="openPassword(row)"
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
        <template v-else>{{ cellText(value) }}</template>
      </template>
    </a-table>
    <a-modal
      :open="dialogOpen"
      :title="editingId ? '编辑用户' : '新建用户'"
      :width="520"
      destroy-on-close
      @cancel="cancelDialog"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item
              html-for="user-username"
              label="用户名"
              required
              v-bind="
                fieldError(
                  userValidationAttempted && !form.username.trim()
                    ? '请输入用户名'
                    : undefined,
                )
              "
            >
              <a-input
                id="user-username"
                v-model:value="form.username"
                :maxlength="64"
                placeholder="登录账号"
                :disabled="Boolean(editingId)"
                allow-clear
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col v-if="!editingId" :span="12">
            <a-form-item
              html-for="user-password"
              label="初始密码"
              required
              v-bind="
                fieldError(
                  userValidationAttempted && form.password.length < 4
                    ? '密码至少 4 位'
                    : undefined,
                )
              "
            >
              <a-input-password
                id="user-password"
                v-model:value="form.password"
                :maxlength="64"
                placeholder="至少 4 位"
                allow-clear
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item
              html-for="user-display-name"
              label="显示名"
              required
              v-bind="
                fieldError(
                  userValidationAttempted && !form.displayName.trim()
                    ? '请输入显示名'
                    : undefined,
                )
              "
            >
              <a-input
                id="user-display-name"
                v-model:value="form.displayName"
                :maxlength="64"
                placeholder="姓名或称呼"
                allow-clear
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item html-for="user-role-id" label="角色" :extra="roleHint">
              <a-select
                id="user-role-id"
                v-model:value="form.roleId"
                :options="roleOptions"
                :placeholder="
                  hasMultipleOriginalRoles ? '保留原有角色' : '请选择一个角色'
                "
                allow-clear
              />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item html-for="user-org-unit-id" label="所属组织">
              <a-tree-select
                id="user-org-unit-id"
                v-model:value="form.orgUnitId"
                :tree-data="orgNodes"
                placeholder="可选择任意层级（支持跳级）"
                tree-default-expand-all
                tree-node-filter-prop="title"
                show-search
                allow-clear
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item html-for="user-is-active" label="启用">
              <a-switch id="user-is-active" v-model:checked="form.isActive" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <template #footer>
        <a-button @click="cancelDialog">取消</a-button>
        <a-button type="primary" :loading="saving" @click="saveUser">
          保存
        </a-button>
      </template>
    </a-modal>
    <a-modal
      :open="passwordOpen"
      title="重置密码"
      :width="420"
      destroy-on-close
      @cancel="passwordOpen = false"
    >
      <a-form layout="vertical">
        <a-form-item
          html-for="user-new-password"
          label="新密码"
          required
          v-bind="
            fieldError(
              passwordValidationAttempted && newPassword.length < 4
                ? '新密码至少 4 位'
                : undefined,
            )
          "
        >
          <a-input-password
            id="user-new-password"
            v-model:value="newPassword"
            :maxlength="64"
            placeholder="至少 4 位"
            allow-clear
          />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="passwordOpen = false">取消</a-button>
        <a-button
          type="primary"
          :loading="passwordSaving"
          @click="savePassword"
        >
          保存
        </a-button>
      </template>
    </a-modal>
  </section>
</template>

<style scoped>
/* 日期和时间拆成两行很难扫读，与操作日志保持一行 */
.user-created-at {
  white-space: nowrap;
}
</style>
