<script setup lang="ts">
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
  ASwitch,
  ATable,
  ATreeSelect,
  type TableColumn,
} from '@/ui';

import '../shared/selection-page.css';

const { canWrite } = useAccess();
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
const newPassword = ref('');

const roleOptions = computed(() =>
  roles.value.map((role) => ({
    value: role.id,
    label: `${role.name}（${role.code}）`,
  })),
);
const orgNodes = computed(() => toTreeSelectNodes(orgUnits.value));
const columns = computed<TableColumn[]>(() => {
  const cols: TableColumn[] = [
    { key: 'username', label: '用户名', minWidth: 120, fixed: 'start' },
    { key: 'displayName', label: '显示名', minWidth: 120 },
    { key: 'roles', label: '角色', minWidth: 160 },
    { key: 'org', label: '所属组织', minWidth: 180 },
    { key: 'status', label: '状态', width: 88 },
    { key: 'createdAt', label: '创建时间', width: 180 },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', label: '操作', width: 128, fixed: 'end' });
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
    toast.error(error instanceof ApiError ? error.message : '加载用户列表失败');
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  userValidationAttempted.value = false;
  editingId.value = undefined;
  Object.assign(form, {
    displayName: '',
    isActive: true,
    orgUnitId: null,
    password: '',
    roleId: null,
    username: '',
  });
  dialogOpen.value = true;
}

function openEdit(user: RbacUser) {
  userValidationAttempted.value = false;
  editingId.value = user.id;
  Object.assign(form, {
    displayName: user.displayName,
    isActive: user.isActive,
    orgUnitId: user.orgUnit?.id ?? null,
    password: '',
    roleId: user.roles.length === 1 ? user.roles[0]!.id : null,
    username: user.username,
  });
  dialogOpen.value = true;
  if (user.roles.length > 1) {
    toast.warning('该用户当前绑定多个角色，请重新选择一个角色');
  }
}

async function saveUser() {
  userValidationAttempted.value = true;
  if (!form.username.trim() || !form.displayName.trim()) {
    toast.warning('请填写用户名和显示名');
    return;
  }
  if (editingId.value === undefined && form.password.length < 4) {
    toast.warning('密码至少 4 位');
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
      toast.success('用户已创建');
    } else {
      await api.updateUser(editingId.value, {
        displayName: form.displayName.trim(),
        isActive: form.isActive,
        orgUnitId: form.orgUnitId,
        roleIds: form.roleId === null ? [] : [Number(form.roleId)],
      });
      toast.success('用户已更新');
    }
    dialogOpen.value = false;
    await loadData();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '保存失败');
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
  if (!passwordUserId.value) return;
  passwordValidationAttempted.value = true;
  if (newPassword.value.length < 4) {
    toast.warning('新密码至少 4 位');
    return;
  }
  try {
    await api.resetUserPassword(passwordUserId.value, newPassword.value);
    toast.success('密码已重置');
    passwordOpen.value = false;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '重置失败');
  }
}

async function removeUser(user: RbacUser) {
  const ok = await confirmDelete(
    '删除用户',
    `确定删除用户“${user.displayName}（${user.username}）”？此操作不可恢复。`,
  );
  if (!ok) return;
  try {
    await api.deleteUser(user.id);
    toast.success('用户已删除');
    await loadData();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '删除失败');
  }
}

function orgPath(user: RbacUser) {
  return user.orgUnit?.path || '—';
}
</script>

<template>
  <section class="selection-page">
    <div class="selection-toolbar">
      <h1 class="docs-heading">用户管理</h1>
      <AButton v-if="writable" variant="filled" @click="openCreate">
        新增用户
      </AButton>
    </div>
    <ATable
      :columns="columns"
      :rows="users"
      row-key="id"
      empty-text="暂无用户"
      :loading="loading"
      striped
    >
      <template #cell-roles="{ row }">
        <div class="badge-wrap">
          <ABadge v-for="role in row.roles" :key="role.id" :label="role.name" />
        </div>
      </template>
      <template #cell-org="{ row }">{{ orgPath(row) }}</template>
      <template #cell-status="{ row }">
        <ABadge
          :label="row.isActive ? '启用' : '停用'"
          :tone="row.isActive ? 'green' : 'neutral'"
        />
      </template>
      <template #cell-createdAt="{ row }">
        {{ formatLocalDateTime(new Date(row.createdAt)) }}
      </template>
      <template #cell-actions="{ row }">
        <div class="table-actions">
          <AIconButton
            :icon="Pencil"
            label="编辑"
            size="small"
            @click="openEdit(row)"
          />
          <AIconButton
            :icon="KeyRound"
            label="重置密码"
            size="small"
            @click="openPassword(row)"
          />
          <AIconButton
            :icon="Trash2"
            label="删除"
            size="small"
            variant="destructive"
            @click="removeUser(row)"
          />
        </div>
      </template>
    </ATable>
    <ASheet
      v-model:open="dialogOpen"
      :title="editingId ? '编辑用户' : '新建用户'"
      :width="520"
    >
      <AFormGrid>
        <AFormRow
          label="用户名"
          required
          :error="
            userValidationAttempted && !form.username.trim()
              ? '请输入用户名'
              : undefined
          "
        >
          <AField
            v-model="form.username"
            :maxlength="64"
            placeholder="登录账号"
            :disabled="Boolean(editingId)"
          />
        </AFormRow>
        <AFormRow
          v-if="!editingId"
          label="初始密码"
          required
          :error="
            userValidationAttempted && form.password.length < 4
              ? '密码至少 4 位'
              : undefined
          "
        >
          <AField
            v-model="form.password"
            type="password"
            :maxlength="64"
            placeholder="至少 4 位"
          />
        </AFormRow>
        <AFormRow
          label="显示名"
          required
          :error="
            userValidationAttempted && !form.displayName.trim()
              ? '请输入显示名'
              : undefined
          "
        >
          <AField
            v-model="form.displayName"
            :maxlength="64"
            placeholder="姓名或称呼"
          />
        </AFormRow>
        <AFormRow label="角色">
          <ASelect
            v-model="form.roleId"
            :options="roleOptions"
            placeholder="请选择一个角色"
            clearable
          />
        </AFormRow>
        <AFormRow label="所属组织" wide>
          <ATreeSelect
            v-model="form.orgUnitId"
            :nodes="orgNodes"
            placeholder="可选择任意层级（支持跳级）"
          />
        </AFormRow>
        <AFormRow label="启用">
          <ASwitch v-model="form.isActive" />
        </AFormRow>
      </AFormGrid>
      <template #footer>
        <AButton @click="dialogOpen = false">取消</AButton>
        <AButton variant="filled" :loading="saving" @click="saveUser">
          保存
        </AButton>
      </template>
    </ASheet>
    <ASheet v-model:open="passwordOpen" title="重置密码" :width="420">
      <AFormRow
        label="新密码"
        required
        :error="
          passwordValidationAttempted && newPassword.length < 4
            ? '新密码至少 4 位'
            : undefined
        "
      >
        <AField
          v-model="newPassword"
          type="password"
          :maxlength="64"
          placeholder="至少 4 位"
        />
      </AFormRow>
      <template #footer>
        <AButton @click="passwordOpen = false">取消</AButton>
        <AButton variant="filled" @click="savePassword">保存</AButton>
      </template>
    </ASheet>
  </section>
</template>
