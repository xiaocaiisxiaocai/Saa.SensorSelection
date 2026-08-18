<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';

import {
  ElButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTooltip,
} from 'element-plus';

import {
  api,
  type PermissionInfo,
  type RbacRole,
} from '#/modules/selection/api';

const loading = ref(false);
const roles = ref<RbacRole[]>([]);
const permissions = ref<PermissionInfo[]>([]);

const permissionGroups = computed(() => {
  const groups = new Map<string, PermissionInfo[]>();
  for (const permission of permissions.value) {
    const module = permission.module || '其他';
    const list = groups.get(module) ?? [];
    list.push(permission);
    groups.set(module, list);
  }
  return [...groups.entries()];
});

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
    ElMessage.error(
      error instanceof Error ? error.message : '加载角色列表失败',
    );
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

// ---- 新增 / 编辑 ----
const dialogVisible = ref(false);
const editing = ref<null | RbacRole>(null);
const saving = ref(false);
const form = reactive({
  code: '',
  name: '',
  description: '',
  permissionIds: [] as number[],
});

function openCreate() {
  editing.value = null;
  Object.assign(form, {
    code: '',
    name: '',
    description: '',
    permissionIds: [],
  });
  dialogVisible.value = true;
}

function openEdit(role: RbacRole) {
  editing.value = role;
  Object.assign(form, {
    code: role.code,
    name: role.name,
    description: role.description ?? '',
    permissionIds: role.permissions.map((permission) => permission.id),
  });
  dialogVisible.value = true;
}

async function submit() {
  if (!form.code.trim() || !form.name.trim()) {
    ElMessage.warning('请填写角色标识和名称');
    return;
  }
  if (editing.value === null && !/^[a-z][\w:-]*$/i.test(form.code.trim())) {
    ElMessage.warning('角色标识仅允许字母开头，可含字母、数字、: _ -');
    return;
  }
  saving.value = true;
  try {
    if (editing.value === null) {
      await api.createRole({
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        permissionIds: form.permissionIds,
      });
      ElMessage.success('角色已创建');
    } else {
      await api.updateRole(editing.value.id, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        permissionIds: form.permissionIds,
      });
      ElMessage.success('角色已更新');
    }
    dialogVisible.value = false;
    await loadData();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function removeRole(role: RbacRole) {
  try {
    await ElMessageBox.confirm(
      `确定删除角色「${role.name}（${role.code}）」？`,
      '删除角色',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    await api.deleteRole(role.id);
    ElMessage.success('角色已删除');
    await loadData();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}
</script>

<template>
  <div class="rbac-page">
    <div class="rbac-page__toolbar">
      <h2 class="rbac-page__title">角色管理</h2>
      <ElButton type="primary" @click="openCreate">新增角色</ElButton>
    </div>

    <ElTable :data="roles" stripe v-loading="loading">
      <ElTableColumn label="标识" min-width="120" prop="code" />
      <ElTableColumn label="名称" min-width="130" prop="name" />
      <ElTableColumn label="描述" min-width="180" prop="description">
        <template #default="{ row }">
          {{ row.description || '—' }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="权限" min-width="280">
        <template #default="{ row }">
          <ElTag
            v-for="permission in row.permissions"
            :key="permission.code"
            size="small"
            type="info"
          >
            {{ permission.name }}
          </ElTag>
          <span v-if="row.permissions.length === 0" class="rbac-muted">
            无权限
          </span>
        </template>
      </ElTableColumn>
      <ElTableColumn label="类型" width="100">
        <template #default="{ row }">
          <ElTag v-if="row.isSystem" size="small" type="warning">内置</ElTag>
          <span v-else class="rbac-muted">自定义</span>
        </template>
      </ElTableColumn>
      <ElTableColumn fixed="right" label="操作" width="140">
        <template #default="{ row }">
          <template v-if="!row.isSystem">
            <ElButton link type="primary" @click="openEdit(row)">编辑</ElButton>
            <ElButton link type="danger" @click="removeRole(row)">
              删除
            </ElButton>
          </template>
          <ElTooltip v-else content="系统内置角色不可修改">
            <span class="rbac-muted">受保护</span>
          </ElTooltip>
        </template>
      </ElTableColumn>
    </ElTable>

    <!-- 新增 / 编辑 -->
    <ElDialog
      v-model="dialogVisible"
      :close-on-click-modal="false"
      :title="editing === null ? '新增角色' : `编辑角色：${editing.name}`"
      width="520px"
    >
      <ElForm label-position="top">
        <ElFormItem label="角色标识" required>
          <ElInput
            v-model="form.code"
            :disabled="editing !== null"
            maxlength="64"
            placeholder="如：sensor_admin"
          />
        </ElFormItem>
        <ElFormItem label="角色名称" required>
          <ElInput
            v-model="form.name"
            maxlength="64"
            placeholder="如：Sensor 管理员"
          />
        </ElFormItem>
        <ElFormItem label="描述">
          <ElInput
            v-model="form.description"
            maxlength="200"
            placeholder="角色用途说明（可选）"
            type="textarea"
          />
        </ElFormItem>
        <ElFormItem label="权限">
          <div
            v-for="[module, items] in permissionGroups"
            :key="module"
            class="rbac-perm-group"
          >
            <div class="rbac-perm-group__module">{{ module }}</div>
            <ElCheckboxGroup v-model="form.permissionIds">
              <ElCheckbox v-for="item in items" :key="item.id" :value="item.id">
                {{ item.name }}（{{ item.code }}）
              </ElCheckbox>
            </ElCheckboxGroup>
          </div>
          <p class="rbac-hint">
            权限码同时进入登录 token，用于后端接口鉴权与前端菜单/按钮显示。
          </p>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton :loading="saving" type="primary" @click="submit">
          保存
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style src="../rbac.css"></style>
