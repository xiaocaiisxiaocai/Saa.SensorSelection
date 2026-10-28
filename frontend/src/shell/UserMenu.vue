<script setup lang="ts">
import { message } from 'ant-design-vue';
import { ChevronDown, Columns3, KeyRound, LogOut } from 'lucide-vue-next';
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { api } from '@/api';
import {
  hasCustomColumnWidths,
  resetColumnWidths,
} from '@/pages/shared/column-widths';
import { fieldError } from '@/pages/shared/form';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const passwordOpen = ref(false);
const saving = ref(false);
const validationAttempted = ref(false);
const form = reactive({
  confirmPassword: '',
  currentPassword: '',
  newPassword: '',
});

// 拖过表格列宽后，用户名 / 「登录」左边出现恢复入口（登录与否一致）
const canResetWidths = computed(() => hasCustomColumnWidths());

function resetWidths() {
  // 拖过的表格列宽只记在本机浏览器，这里一次全部恢复
  resetColumnWidths();
  message.success('已恢复所有表格的默认列宽');
}

const avatarText = computed(() => auth.displayName.trim().slice(0, 1) || '?');

const description = computed(() => {
  const roles =
    auth.profile?.roles.map((role) => role.name).join('、') || '未分配角色';
  const org = auth.profile?.orgUnit?.path;
  return org ? `${roles} · 组织：${org}` : roles;
});

function goLogin() {
  router.push('/login');
}

function openPassword() {
  validationAttempted.value = false;
  Object.assign(form, {
    confirmPassword: '',
    currentPassword: '',
    newPassword: '',
  });
  passwordOpen.value = true;
}

function closePassword() {
  if (saving.value) return;
  passwordOpen.value = false;
}

async function savePassword() {
  if (saving.value) return;
  validationAttempted.value = true;
  if (
    !form.currentPassword ||
    form.newPassword.length < 4 ||
    form.newPassword !== form.confirmPassword ||
    form.newPassword === form.currentPassword
  ) {
    return;
  }
  saving.value = true;
  try {
    await api.changePassword(form.currentPassword, form.newPassword);
    message.success('密码已修改');
    passwordOpen.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : '修改失败');
  } finally {
    saving.value = false;
  }
}

async function onMenuClick({ key: id }: { key: string | number }) {
  if (id === 'password') {
    openPassword();
    return;
  }
  if (id !== 'logout') return;
  auth.logout();
  await router.replace('/selection/customer');
}
</script>

<template>
  <a-space :size="4">
    <a-tooltip v-if="canResetWidths" title="恢复默认列宽">
      <a-button type="text" aria-label="恢复默认列宽" @click="resetWidths">
        <template #icon><Columns3 :size="16" /></template>
      </a-button>
    </a-tooltip>
    <a-dropdown
      v-if="auth.isAuthenticated"
      placement="bottomRight"
      :trigger="['click']"
    >
      <a-button class="user-menu__trigger" type="text" :title="description">
        <a-avatar class="user-menu__avatar" size="small">
          {{ avatarText }}
        </a-avatar>
        <span class="user-menu__name">{{ auth.displayName }}</span>
        <ChevronDown :size="14" />
      </a-button>
      <template #overlay>
        <a-menu @click="onMenuClick">
          <a-menu-item key="profile" disabled class="user-menu__profile">
            {{ description }}
          </a-menu-item>
          <a-menu-divider />
          <a-menu-item key="password">
            <template #icon><KeyRound :size="14" /></template>
            修改密码
          </a-menu-item>
          <a-menu-item key="logout" danger>
            <template #icon><LogOut :size="14" /></template>
            退出登录
          </a-menu-item>
        </a-menu>
      </template>
    </a-dropdown>
    <a-button v-else type="primary" @click="goLogin">登录</a-button>
  </a-space>
  <a-modal
    :open="passwordOpen"
    title="修改密码"
    :width="420"
    :mask-closable="!saving"
    :keyboard="!saving"
    :closable="!saving"
    destroy-on-close
    @cancel="closePassword"
  >
    <a-form layout="vertical">
      <a-form-item
        html-for="user-menu-current-password"
        label="当前密码"
        required
        v-bind="
          fieldError(
            validationAttempted && !form.currentPassword
              ? '请输入当前密码'
              : undefined,
          )
        "
      >
        <a-input-password
          id="user-menu-current-password"
          v-model:value="form.currentPassword"
          autocomplete="current-password"
          :maxlength="64"
          placeholder="请输入当前密码"
          allow-clear
        />
      </a-form-item>
      <a-form-item
        html-for="user-menu-new-password"
        label="新密码"
        required
        v-bind="
          fieldError(
            validationAttempted && form.newPassword.length < 4
              ? '新密码至少 4 位'
              : validationAttempted &&
                form.newPassword === form.currentPassword &&
                form.newPassword
                ? '新密码不能与当前密码相同'
                : undefined,
          )
        "
      >
        <a-input-password
          id="user-menu-new-password"
          v-model:value="form.newPassword"
          autocomplete="new-password"
          :maxlength="64"
          placeholder="至少 4 位"
          allow-clear
        />
      </a-form-item>
      <a-form-item
        html-for="user-menu-confirm-password"
        label="确认新密码"
        required
        v-bind="
          fieldError(
            validationAttempted && form.confirmPassword !== form.newPassword
              ? '两次输入的新密码不一致'
              : undefined,
          )
        "
      >
        <a-input-password
          id="user-menu-confirm-password"
          v-model:value="form.confirmPassword"
          autocomplete="new-password"
          :maxlength="64"
          placeholder="再次输入新密码"
          allow-clear
        />
      </a-form-item>
    </a-form>
    <template #footer>
      <a-button :disabled="saving" @click="closePassword">取消</a-button>
      <a-button type="primary" :loading="saving" @click="savePassword">
        保存
      </a-button>
    </template>
  </a-modal>
</template>

<style scoped src="./UserMenu.css"></style>
