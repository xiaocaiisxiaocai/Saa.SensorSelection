<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';

import {
  ElButton,
  ElCascader,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTooltip,
} from 'element-plus';

import {
  api,
  type OrgUnitNode,
  type RbacRole,
  type RbacUser,
} from '#/modules/selection/api';

import { buildCascaderOptions } from '../org-tree';

const loading = ref(false);
const users = ref<RbacUser[]>([]);
const roles = ref<RbacRole[]>([]);
const orgUnits = ref<OrgUnitNode[]>([]);

const cascaderOptions = computed(() => buildCascaderOptions(orgUnits.value));
const roleOptions = computed(() =>
  roles.value.map((role) => ({
    value: role.id,
    label: `${role.name}（${role.code}）`,
  })),
);

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
    ElMessage.error(
      error instanceof Error ? error.message : '加载用户列表失败',
    );
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

// ---- 新增 / 编辑 ----
const dialogVisible = ref(false);
const editingId = ref<null | number>(null);
const saving = ref(false);
const form = reactive({
  username: '',
  displayName: '',
  password: '',
  isActive: true,
  roleIds: [] as number[],
  orgUnitId: undefined as number | undefined,
});

function openCreate() {
  editingId.value = null;
  Object.assign(form, {
    username: '',
    displayName: '',
    password: '',
    isActive: true,
    roleIds: [],
    orgUnitId: undefined,
  });
  dialogVisible.value = true;
}

function openEdit(user: RbacUser) {
  editingId.value = user.id;
  Object.assign(form, {
    username: user.username,
    displayName: user.displayName,
    password: '',
    isActive: user.isActive,
    roleIds: user.roles.map((role) => role.id),
    orgUnitId: user.orgUnit?.id ?? undefined,
  });
  dialogVisible.value = true;
}

async function submit() {
  if (!form.username.trim() || !form.displayName.trim()) {
    ElMessage.warning('请填写用户名和显示名');
    return;
  }
  if (editingId.value === null && form.password.length < 6) {
    ElMessage.warning('密码至少 6 位');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value === null) {
      await api.createUser({
        username: form.username.trim(),
        password: form.password,
        displayName: form.displayName.trim(),
        isActive: form.isActive,
        roleIds: form.roleIds,
        orgUnitId: form.orgUnitId,
      });
      ElMessage.success('用户已创建');
    } else {
      await api.updateUser(editingId.value, {
        displayName: form.displayName.trim(),
        isActive: form.isActive,
        roleIds: form.roleIds,
        orgUnitId: form.orgUnitId,
      });
      ElMessage.success('用户已更新');
    }
    dialogVisible.value = false;
    await loadData();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

// ---- 重置密码 ----
const resetVisible = ref(false);
const resetTarget = ref<null | RbacUser>(null);
const resetPassword = ref('');
const resetting = ref(false);

function openReset(user: RbacUser) {
  resetTarget.value = user;
  resetPassword.value = '';
  resetVisible.value = true;
}

async function submitReset() {
  if (!resetTarget.value || resetPassword.value.length < 6) {
    ElMessage.warning('新密码至少 6 位');
    return;
  }
  resetting.value = true;
  try {
    await api.resetUserPassword(resetTarget.value.id, resetPassword.value);
    ElMessage.success('密码已重置');
    resetVisible.value = false;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '重置失败');
  } finally {
    resetting.value = false;
  }
}

// ---- 删除 ----
async function removeUser(user: RbacUser) {
  try {
    await ElMessageBox.confirm(
      `确定删除用户「${user.displayName}（${user.username}）」？此操作不可恢复。`,
      '删除用户',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    await api.deleteUser(user.id);
    ElMessage.success('用户已删除');
    await loadData();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}
</script>

<template>
  <div class="rbac-page">
    <div class="rbac-page__toolbar">
      <h2 class="rbac-page__title">用户管理</h2>
      <ElButton type="primary" @click="openCreate">新增用户</ElButton>
    </div>

    <ElTable :data="users" stripe v-loading="loading">
      <ElTableColumn label="用户名" min-width="120" prop="username" />
      <ElTableColumn label="显示名" min-width="120" prop="displayName" />
      <ElTableColumn label="角色" min-width="180">
        <template #default="{ row }">
          <template v-if="row.roles.length > 0">
            <ElTag v-for="role in row.roles" :key="role.code" size="small">
              {{ role.name }}
            </ElTag>
          </template>
          <span v-else class="rbac-muted">未分配</span>
        </template>
      </ElTableColumn>
      <ElTableColumn label="所属组织" min-width="200">
        <template #default="{ row }">
          <ElTooltip
            v-if="row.orgUnit"
            :content="row.orgUnit.path"
            placement="top"
          >
            <span>{{ row.orgUnit.name }}</span>
          </ElTooltip>
          <span v-else class="rbac-muted">未分配</span>
        </template>
      </ElTableColumn>
      <ElTableColumn label="状态" width="90">
        <template #default="{ row }">
          <ElTag :type="row.isActive ? 'success' : 'info'" size="small">
            {{ row.isActive ? '启用' : '停用' }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="创建时间" prop="createdAt" width="170">
        <template #default="{ row }">
          {{ new Date(row.createdAt).toLocaleString() }}
        </template>
      </ElTableColumn>
      <ElTableColumn fixed="right" label="操作" width="210">
        <template #default="{ row }">
          <ElButton link type="primary" @click="openEdit(row)">编辑</ElButton>
          <ElButton link type="warning" @click="openReset(row)">
            重置密码
          </ElButton>
          <ElButton link type="danger" @click="removeUser(row)">删除</ElButton>
        </template>
      </ElTableColumn>
    </ElTable>

    <!-- 新增 / 编辑 -->
    <ElDialog
      v-model="dialogVisible"
      :close-on-click-modal="false"
      :title="editingId === null ? '新增用户' : `编辑用户：${form.username}`"
      width="480px"
    >
      <ElForm label-position="top">
        <ElFormItem label="用户名" required>
          <ElInput
            v-model="form.username"
            :disabled="editingId !== null"
            maxlength="64"
            placeholder="登录账号"
          />
        </ElFormItem>
        <ElFormItem v-if="editingId === null" label="初始密码" required>
          <ElInput
            v-model="form.password"
            maxlength="64"
            placeholder="至少 6 位"
            show-password
            type="password"
          />
        </ElFormItem>
        <ElFormItem label="显示名" required>
          <ElInput
            v-model="form.displayName"
            maxlength="64"
            placeholder="姓名或称呼"
          />
        </ElFormItem>
        <ElFormItem label="角色">
          <ElSelect
            v-model="form.roleIds"
            clearable
            multiple
            placeholder="可多选角色"
            style="width: 100%"
          >
            <ElOption
              v-for="role in roleOptions"
              :key="role.value"
              :label="role.label"
              :value="role.value"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="所属组织">
          <ElCascader
            v-model="form.orgUnitId"
            :options="cascaderOptions"
            check-strictly
            clearable
            placeholder="可选择任意层级（支持跳级）"
            style="width: 100%"
          />
        </ElFormItem>
        <ElFormItem label="启用">
          <ElSwitch v-model="form.isActive" />
          <span class="rbac-hint">停用后该账号无法登录</span>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton :loading="saving" type="primary" @click="submit">
          保存
        </ElButton>
      </template>
    </ElDialog>

    <!-- 重置密码 -->
    <ElDialog
      v-model="resetVisible"
      :close-on-click-modal="false"
      :title="`重置密码：${resetTarget?.displayName ?? ''}`"
      width="400px"
    >
      <ElForm label-position="top">
        <ElFormItem label="新密码" required>
          <ElInput
            v-model="resetPassword"
            maxlength="64"
            placeholder="至少 6 位"
            show-password
            type="password"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="resetVisible = false">取消</ElButton>
        <ElButton :loading="resetting" type="primary" @click="submitReset">
          确认重置
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style src="../rbac.css"></style>
