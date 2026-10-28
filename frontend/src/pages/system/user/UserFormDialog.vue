<script setup lang="ts">
import { message } from 'ant-design-vue';
import { computed, reactive, ref } from 'vue';

import { api, type OrgUnitNode, type RbacRole, type RbacUser } from '@/api';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';
import { toTreeSelectNodes } from '@/pages/system/org-tree';

/** 新建 / 编辑用户；父组件调用 openCreate() / openEdit()，保存成功后发出 saved */
const props = defineProps<{
  roles: readonly RbacRole[];
  orgUnits: readonly OrgUnitNode[];
}>();
const emit = defineEmits<{ saved: [] }>();

const visible = ref(false);
const editingId = ref<number>();
/** 这名用户是仅存的启用系统管理员，不能停用，也不能改掉管理员角色 */
const protectAdmin = ref(false);
const saving = ref(false);
// 编辑前用户已绑定的角色。表单只支持选一个角色；多角色用户不重新选择时
// 保存要原样保留这些角色，不能提交空数组把角色全部清掉。
const originalRoles = ref<RbacUser['roles']>([]);
const validationAttempted = ref(false);
const form = reactive({
  displayName: '',
  isActive: true,
  orgUnitId: null as number | null,
  password: '',
  roleId: null as number | null,
  username: '',
});
const dirtyGuard = useDirtyGuard(form);

const roleOptions = computed(() =>
  props.roles.map((role) => ({
    value: role.id,
    label: `${role.name}（${role.code}）`,
  })),
);
const hasMultipleOriginalRoles = computed(
  () => editingId.value !== undefined && originalRoles.value.length > 1,
);
const roleHint = computed(() => {
  if (protectAdmin.value) return '至少保留一个启用的系统管理员';
  return hasMultipleOriginalRoles.value
    ? `当前绑定多个角色（${originalRoles.value.map((role) => role.name).join('、')}）；不选择则保存时保留原角色，选择后改为该单一角色。`
    : undefined;
});
const orgNodes = computed(() => toTreeSelectNodes([...props.orgUnits]));

function show(user: RbacUser | undefined, lockAdmin = false) {
  validationAttempted.value = false;
  protectAdmin.value = lockAdmin;
  editingId.value = user?.id;
  originalRoles.value = user ? [...user.roles] : [];
  Object.assign(form, {
    displayName: user?.displayName ?? '',
    isActive: user?.isActive ?? true,
    orgUnitId: user?.orgUnit?.id ?? null,
    password: '',
    roleId: user?.roles.length === 1 ? user.roles[0]!.id : null,
    username: user?.username ?? '',
  });
  dirtyGuard.markClean();
  visible.value = true;
}

const openCreate = () => show(undefined);
const openEdit = (user: RbacUser, lockAdmin = false) => show(user, lockAdmin);

function editedRoleIds(): number[] {
  if (form.roleId !== null) return [Number(form.roleId)];
  return hasMultipleOriginalRoles.value
    ? originalRoles.value.map((role) => role.id)
    : [];
}

async function cancel() {
  if (saving.value) return;
  if (await dirtyGuard.confirmClose()) {
    visible.value = false;
  }
}

async function save() {
  if (saving.value) return;
  validationAttempted.value = true;
  // 字段级错误已经由用户名/显示名/密码输入框下方的红字分别说明——用一条
  // 合并成一句的 Toast 复述会跟哪个字段实际出错对不上。
  if (!form.username.trim() || !form.displayName.trim()) {
    return;
  }
  if (editingId.value === undefined && form.password.length < 4) {
    return;
  }
  if (protectAdmin.value) {
    form.isActive = true;
    const adminRoleId = props.roles.find((role) => role.code === 'admin')?.id;
    if (adminRoleId !== undefined && form.roleId !== adminRoleId) {
      form.roleId = hasMultipleOriginalRoles.value ? null : adminRoleId;
    }
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
    visible.value = false;
    emit('saved');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

defineExpose({ openCreate, openEdit });
</script>

<template>
  <a-modal
    :open="visible"
    :title="editingId ? '编辑用户' : '新增用户'"
    :width="520"
    :mask-closable="!saving"
    :keyboard="!saving"
    :closable="!saving"
    destroy-on-close
    @cancel="cancel"
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
                validationAttempted && !form.username.trim()
                  ? '请输入用户名'
                  : undefined,
              )
            "
          >
            <a-tooltip :title="editingId ? '用户名创建后不能修改' : undefined">
              <span class="tooltip-host">
                <a-input
                  id="user-username"
                  v-model:value="form.username"
                  :maxlength="64"
                  placeholder="登录账号"
                  :disabled="Boolean(editingId)"
                  allow-clear
                  show-count
                />
              </span>
            </a-tooltip>
          </a-form-item>
        </a-col>
        <a-col v-if="!editingId" :span="12">
          <a-form-item
            html-for="user-password"
            label="初始密码"
            required
            v-bind="
              fieldError(
                validationAttempted && form.password.length < 4
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
                validationAttempted && !form.displayName.trim()
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
              :disabled="protectAdmin"
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
              placeholder="可选，事业部、部门或课别都可以"
              tree-default-expand-all
              tree-node-filter-prop="title"
              show-search
              allow-clear
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item html-for="user-is-active" label="启用">
            <a-tooltip
              :title="protectAdmin ? '至少保留一个启用的系统管理员' : undefined"
            >
              <span class="tooltip-host">
                <a-switch
                  id="user-is-active"
                  v-model:checked="form.isActive"
                  :disabled="protectAdmin"
                />
              </span>
            </a-tooltip>
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
    <template #footer>
      <a-button :disabled="saving" @click="cancel">取消</a-button>
      <a-button type="primary" :loading="saving" @click="save">保存</a-button>
    </template>
  </a-modal>
</template>
