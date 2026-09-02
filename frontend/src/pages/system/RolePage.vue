<script setup lang="ts">
import { Pencil, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref } from 'vue';

import { api, ApiError, type PermissionInfo, type RbacRole } from '@/api';
import { confirmDelete } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { toast } from '@/ui/toast';
import {
  ABadge,
  AButton,
  ACheckbox,
  AField,
  AFormGrid,
  AFormRow,
  AIconButton,
  ASheet,
  ATable,
  ATextArea,
  type TableColumn,
} from '@/ui';

import '../shared/selection-page.css';

const { canWrite } = useAccess();
const writable = computed(() => canWrite('rbac:role:write'));
const loading = ref(false);
const roles = ref<RbacRole[]>([]);
const permissions = ref<PermissionInfo[]>([]);
const dialogOpen = ref(false);
const editing = ref<null | RbacRole>(null);
const saving = ref(false);
const validationAttempted = ref(false);
const form = reactive({
  code: '',
  description: '',
  name: '',
  permissionIds: [] as number[],
});

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
const columns = computed<TableColumn[]>(() => {
  const cols: TableColumn[] = [
    { key: 'code', label: '标识', minWidth: 120 },
    { key: 'name', label: '名称', minWidth: 130 },
    { key: 'description', label: '描述', minWidth: 180 },
    { key: 'permissions', label: '权限', minWidth: 240 },
    { key: 'kind', label: '类型', width: 100 },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', label: '操作', width: 96, fixed: 'end' });
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
    toast.error(error instanceof ApiError ? error.message : '加载角色列表失败');
  } finally {
    loading.value = false;
  }
}

function isProtected(role: RbacRole) {
  return role.isSystem || role.code === 'admin';
}

function groupState(items: PermissionInfo[]) {
  const selected = items.filter((item) =>
    form.permissionIds.includes(item.id),
  ).length;
  if (selected === 0) return false;
  if (selected === items.length) return true;
  return 'indeterminate' as const;
}

function toggleGroup(items: PermissionInfo[], checked: boolean) {
  const ids = new Set(form.permissionIds);
  for (const item of items) {
    if (checked) ids.add(item.id);
    else ids.delete(item.id);
  }
  form.permissionIds = [...ids];
}

function openCreate() {
  validationAttempted.value = false;
  editing.value = null;
  Object.assign(form, {
    code: '',
    description: '',
    name: '',
    permissionIds: [],
  });
  dialogOpen.value = true;
}

function openEdit(role: RbacRole) {
  validationAttempted.value = false;
  editing.value = role;
  Object.assign(form, {
    code: role.code,
    description: role.description ?? '',
    name: role.name,
    permissionIds: role.permissions.map((item) => item.id),
  });
  dialogOpen.value = true;
}

function togglePermission(id: number, checked: boolean) {
  if (checked) {
    if (!form.permissionIds.includes(id)) form.permissionIds.push(id);
    return;
  }
  form.permissionIds = form.permissionIds.filter((item) => item !== id);
}

async function saveRole() {
  validationAttempted.value = true;
  if (!form.code.trim() || !form.name.trim()) {
    toast.warning('请填写角色标识和名称');
    return;
  }
  if (editing.value === null && !/^[a-z][\w:-]*$/i.test(form.code.trim())) {
    toast.warning('角色标识仅允许字母开头，可含字母、数字、: _ -');
    return;
  }
  saving.value = true;
  try {
    if (editing.value === null) {
      await api.createRole({
        code: form.code.trim(),
        description: form.description.trim() || null,
        name: form.name.trim(),
        permissionIds: form.permissionIds,
      });
      toast.success('角色已创建');
    } else {
      await api.updateRole(editing.value.id, {
        description: form.description.trim() || null,
        name: form.name.trim(),
        permissionIds: form.permissionIds,
      });
      toast.success('角色已更新');
    }
    dialogOpen.value = false;
    await loadData();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function removeRole(role: RbacRole) {
  const ok = await confirmDelete(
    '删除角色',
    `确定删除角色“${role.name}（${role.code}）”？`,
  );
  if (!ok) return;
  try {
    await api.deleteRole(role.id);
    toast.success('角色已删除');
    await loadData();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '删除失败');
  }
}
</script>

<template>
  <section class="selection-page">
    <div class="selection-toolbar">
      <h1 class="docs-heading">角色管理</h1>
      <AButton v-if="writable" variant="filled" @click="openCreate">
        新增角色
      </AButton>
    </div>
    <ATable
      :columns="columns"
      :rows="roles"
      row-key="id"
      empty-text="暂无角色"
      :loading="loading"
      striped
    >
      <template #cell-description="{ value }">{{ value || '—' }}</template>
      <template #cell-permissions="{ row }">
        <div class="badge-wrap">
          <ABadge
            v-for="permission in row.permissions"
            :key="permission.code"
            :label="permission.name"
          />
          <span v-if="row.permissions.length === 0">无权限</span>
        </div>
      </template>
      <template #cell-kind="{ row }">
        <ABadge
          :label="row.isSystem ? '系统内置' : '自定义'"
          :tone="row.isSystem ? 'orange' : 'neutral'"
        />
      </template>
      <template #cell-actions="{ row }">
        <div v-if="!isProtected(row)" class="table-actions">
          <AIconButton
            :icon="Pencil"
            label="编辑"
            size="small"
            @click="openEdit(row)"
          />
          <AIconButton
            :icon="Trash2"
            label="删除"
            size="small"
            variant="destructive"
            @click="removeRole(row)"
          />
        </div>
      </template>
    </ATable>
    <ASheet
      v-model:open="dialogOpen"
      :title="editing ? '编辑角色' : '新建角色'"
      :width="560"
    >
      <AFormGrid>
        <AFormRow
          label="角色标识"
          required
          :error="
            validationAttempted && !form.code.trim()
              ? '请输入角色标识'
              : validationAttempted &&
                editing === null &&
                !/^[a-z][\w:-]*$/i.test(form.code.trim())
                ? '字母开头，可含字母、数字、冒号、下划线和短横线'
                : undefined
          "
        >
          <AField
            v-model="form.code"
            :maxlength="64"
            placeholder="如：sensor_admin"
            :disabled="Boolean(editing)"
          />
        </AFormRow>
        <AFormRow
          label="角色名称"
          required
          :error="
            validationAttempted && !form.name.trim()
              ? '请输入角色名称'
              : undefined
          "
        >
          <AField
            v-model="form.name"
            :maxlength="64"
            placeholder="如：Sensor 管理员"
          />
        </AFormRow>
        <AFormRow label="描述" wide>
          <ATextArea
            v-model="form.description"
            :rows="2"
            :maxlength="200"
            placeholder="角色用途说明（可选）"
          />
        </AFormRow>
        <div class="permission-panel">
          <div class="permission-panel__header">
            <span class="permission-panel__label">权限</span>
            <span class="permission-panel__count">
              已选 {{ form.permissionIds.length }} / {{ permissions.length }}
            </span>
          </div>
          <section
            v-for="[module, items] in permissionGroups"
            :key="module"
            class="permission-group"
          >
            <label class="permission-group__head checkbox-field">
              <ACheckbox
                :model-value="groupState(items)"
                @update:model-value="toggleGroup(items, $event === true)"
              />
              {{ module }}
            </label>
            <div class="permission-group__items">
              <label
                v-for="item in items"
                :key="item.id"
                class="permission-item"
              >
                <ACheckbox
                  :model-value="form.permissionIds.includes(item.id)"
                  @update:model-value="
                    togglePermission(item.id, $event === true)
                  "
                />
                {{ item.name }}
              </label>
            </div>
          </section>
        </div>
      </AFormGrid>
      <template #footer>
        <AButton @click="dialogOpen = false">取消</AButton>
        <AButton variant="filled" :loading="saving" @click="saveRole">
          保存
        </AButton>
      </template>
    </ASheet>
  </section>
</template>
