<script setup lang="ts">
import { message } from 'ant-design-vue';
import { ref } from 'vue';

import { api, type RbacUser } from '@/api';
import { fieldError } from '@/pages/shared/form';

/** 管理员给用户重置密码；父组件调用 open(user) 打开 */
const visible = ref(false);
const userId = ref<number>();
const accountLabel = ref('');
const saving = ref(false);
const validationAttempted = ref(false);
const newPassword = ref('');

function open(user: RbacUser) {
  validationAttempted.value = false;
  userId.value = user.id;
  accountLabel.value =
    user.displayName && user.displayName !== user.username
      ? `${user.displayName}（${user.username}）`
      : user.username;
  newPassword.value = '';
  visible.value = true;
}

function cancel() {
  if (saving.value) return;
  visible.value = false;
}

async function save() {
  if (!userId.value || saving.value) return;
  validationAttempted.value = true;
  if (newPassword.value.length < 4) return;
  saving.value = true;
  try {
    await api.resetUserPassword(userId.value, newPassword.value);
    message.success('密码已重置');
    visible.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : '重置失败');
  } finally {
    saving.value = false;
  }
}

defineExpose({ open });
</script>

<template>
  <a-modal
    :open="visible"
    :title="accountLabel ? `重置 ${accountLabel} 的密码` : '重置密码'"
    :width="420"
    :mask-closable="!saving"
    :keyboard="!saving"
    :closable="!saving"
    destroy-on-close
    @cancel="cancel"
  >
    <a-form layout="vertical">
      <a-form-item
        html-for="user-new-password"
        label="新密码"
        required
        v-bind="
          fieldError(
            validationAttempted && newPassword.length < 4
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
      <a-button :disabled="saving" @click="cancel">取消</a-button>
      <a-button type="primary" :loading="saving" @click="save">保存</a-button>
    </template>
  </a-modal>
</template>
