<script setup lang="ts">
import { message } from 'ant-design-vue';
import { reactive, ref } from 'vue';

import { api, type PermissionInfo, type RbacRole } from '@/api';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { fieldError } from '@/pages/shared/form';

import RolePermissionPicker from './RolePermissionPicker.vue';

/** 新建 / 编辑角色及其权限；父组件调用 openCreate() / openEdit()，保存成功后发出 saved */
defineProps<{ permissions: readonly PermissionInfo[] }>();
const emit = defineEmits<{ saved: [] }>();

const CODE_PATTERN = /^[a-z][\w:-]*$/i;

const visible = ref(false);
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

function show(role: RbacRole | null) {
  validationAttempted.value = false;
  editing.value = role;
  Object.assign(form, {
    code: role?.code ?? '',
    description: role?.description ?? '',
    name: role?.name ?? '',
    permissionIds: role ? role.permissions.map((item) => item.id) : [],
  });
  dirtyGuard.markClean();
  visible.value = true;
}

const openCreate = () => show(null);
const openEdit = (role: RbacRole) => show(role);

function codeError() {
  if (!validationAttempted.value) return undefined;
  if (!form.code.trim()) return '请输入角色标识';
  if (editing.value === null && !CODE_PATTERN.test(form.code.trim())) {
    return '字母开头，可含字母、数字、冒号、下划线和短横线';
  }
  return undefined;
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
  // 字段级错误已经由角色标识/名称输入框下方的红字分别说明，不再用一条
  // 合并的 Toast 复述——两处措辞不一致时，用户不知道该信哪个。
  if (codeError() || !form.name.trim()) {
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
    :title="editing ? '编辑角色' : '新增角色'"
    :width="560"
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
            html-for="role-code"
            label="角色标识"
            required
            v-bind="fieldError(codeError())"
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
            <RolePermissionPicker
              v-model="form.permissionIds"
              :permissions="permissions"
            />
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
