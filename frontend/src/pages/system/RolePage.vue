<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { Pencil, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref } from 'vue';

import { api, ApiError, type PermissionInfo, type RbacRole } from '@/api';
import { fieldError } from '@/pages/shared/form';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { confirmDelete } from '@/pages/shared/save-feedback';
import { cellText, rowClick, scrollX, sortBy } from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { message } from 'ant-design-vue';

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
const dirtyGuard = useDirtyGuard(form);

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
const columns = computed<TableColumnType[]>(() => {
  const cols: TableColumnType[] = [
    {
      key: 'code',
      dataIndex: 'code',
      title: '标识',
      width: 140,
      fixed: 'left',
      sorter: sortBy('code'),
    },
    {
      key: 'name',
      dataIndex: 'name',
      title: '名称',
      width: 160,
      sorter: sortBy('name'),
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
  dirtyGuard.markClean();
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
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

async function cancelDialog() {
  if (await dirtyGuard.confirmClose()) {
    dialogOpen.value = false;
  }
}

function activateRole(role: RbacRole) {
  if (writable.value && !isProtected(role)) openEdit(role);
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
  // 字段级错误已经由角色标识/名称输入框下方的红字分别说明，不再用一条
  // 合并的 Toast 复述——两处措辞不一致时，用户不知道该信哪个。
  if (!form.code.trim() || !form.name.trim()) {
    return;
  }
  if (editing.value === null && !/^[a-z][\w:-]*$/i.test(form.code.trim())) {
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
      message.success('角色已创建');
    } else {
      await api.updateRole(editing.value.id, {
        description: form.description.trim() || null,
        name: form.name.trim(),
        permissionIds: form.permissionIds,
      });
      message.success('角色已更新');
    }
    dialogOpen.value = false;
    await loadData();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败');
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
    message.success('角色已删除');
    await loadData();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '删除失败');
  }
}
</script>

<template>
  <section class="selection-page">
    <div class="selection-toolbar role-toolbar">
      <h1 class="visually-hidden">角色管理</h1>
      <a-button v-if="writable" type="primary" @click="openCreate">
        新增角色
      </a-button>
    </div>
    <a-table
      :columns="columns"
      :data-source="roles"
      row-key="id"
      :loading="loading"
      :pagination="false"
      :scroll="{ x: scrollX(columns) }"
      :locale="{ emptyText: '暂无角色' }"
      :custom-row="rowClick(activateRole)"
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
    <a-modal
      :open="dialogOpen"
      :title="editing ? '编辑角色' : '新建角色'"
      :width="560"
      destroy-on-close
      @cancel="cancelDialog"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item
              html-for="role-code"
              label="角色标识"
              required
              v-bind="
                fieldError(
                  validationAttempted && !form.code.trim()
                    ? '请输入角色标识'
                    : validationAttempted &&
                      editing === null &&
                      !/^[a-z][\w:-]*$/i.test(form.code.trim())
                      ? '字母开头，可含字母、数字、冒号、下划线和短横线'
                      : undefined,
                )
              "
            >
              <a-input
                id="role-code"
                v-model:value="form.code"
                :maxlength="64"
                placeholder="如：sensor_admin"
                :disabled="Boolean(editing)"
                allow-clear
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item
              html-for="role-name"
              label="角色名称"
              required
              v-bind="
                fieldError(
                  validationAttempted && !form.name.trim()
                    ? '请输入角色名称'
                    : undefined,
                )
              "
            >
              <a-input
                id="role-name"
                v-model:value="form.name"
                :maxlength="64"
                placeholder="如：Sensor 管理员"
                allow-clear
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item html-for="role-description" label="描述">
              <a-textarea
                id="role-description"
                v-model:value="form.description"
                :rows="2"
                :maxlength="200"
                placeholder="角色用途说明（可选）"
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item
              :label="`权限（已选 ${form.permissionIds.length} / ${permissions.length}）`"
            >
              <div
                v-for="[module, items] in permissionGroups"
                :key="module"
                class="permission-group"
              >
                <a-checkbox
                  class="permission-group__head"
                  :checked="groupState(items) === true"
                  :indeterminate="groupState(items) === 'indeterminate'"
                  @change="toggleGroup(items, $event.target.checked)"
                >
                  {{ module }}
                </a-checkbox>
                <a-row :gutter="[16, 4]">
                  <a-col v-for="item in items" :key="item.id" :xs="24" :sm="12">
                    <a-checkbox
                      :checked="form.permissionIds.includes(item.id)"
                      @change="togglePermission(item.id, $event.target.checked)"
                    >
                      {{ item.name }}
                    </a-checkbox>
                  </a-col>
                </a-row>
              </div>
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <template #footer>
        <a-button @click="cancelDialog">取消</a-button>
        <a-button type="primary" :loading="saving" @click="saveRole">
          保存
        </a-button>
      </template>
    </a-modal>
  </section>
</template>
