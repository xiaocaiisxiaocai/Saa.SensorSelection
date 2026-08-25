<script setup lang="ts">
import { KeyRound, LogOut } from 'lucide-vue-next';
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { AButton, AField, AFormRow, AMenu, ASheet } from '@/ui';
import { toast } from '@/ui/toast';

const auth = useAuthStore();
const selection = useSelectionStore();
const router = useRouter();

const passwordOpen = ref(false);
const saving = ref(false);
const form = reactive({
  confirmPassword: '',
  currentPassword: '',
  newPassword: '',
});

const menuItems = [
  { id: 'password', label: '修改密码', icon: KeyRound },
  { type: 'separator' as const },
  { id: 'logout', label: '退出登录', icon: LogOut, destructive: true },
];

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
  Object.assign(form, {
    confirmPassword: '',
    currentPassword: '',
    newPassword: '',
  });
  passwordOpen.value = true;
}

async function savePassword() {
  if (!form.currentPassword || !form.newPassword) {
    toast.warning('请输入当前密码和新密码');
    return;
  }
  if (form.newPassword.length < 4) {
    toast.warning('新密码至少 4 位');
    return;
  }
  if (form.newPassword !== form.confirmPassword) {
    toast.warning('两次输入的新密码不一致');
    return;
  }
  if (form.newPassword === form.currentPassword) {
    toast.warning('新密码不能与当前密码相同');
    return;
  }
  saving.value = true;
  try {
    await api.changePassword(form.currentPassword, form.newPassword);
    toast.success('密码已修改');
    passwordOpen.value = false;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '修改失败');
  } finally {
    saving.value = false;
  }
}

async function onSelect(id: string) {
  if (id === 'password') {
    openPassword();
    return;
  }
  if (id !== 'logout') return;
  auth.logout();
  await selection.initBackend();
  await router.replace('/selection/customer');
}
</script>

<template>
  <AMenu
    v-if="auth.isAuthenticated"
    :items="menuItems"
    side="bottom"
    align="end"
    @select="onSelect"
  >
    <template #trigger>
      <button
        class="user-chip user-chip--menu"
        type="button"
        :title="description"
      >
        {{ auth.displayName }}
      </button>
    </template>
  </AMenu>
  <AButton v-else size="small" variant="tinted" @click="goLogin">登录</AButton>
  <ASheet v-model:open="passwordOpen" title="修改密码" :width="420">
    <div class="password-form">
      <AFormRow label="当前密码" required>
        <AField
          v-model="form.currentPassword"
          type="password"
          autocomplete="current-password"
          :maxlength="64"
          :show-count="false"
          placeholder="请输入当前密码"
        />
      </AFormRow>
      <AFormRow label="新密码" required>
        <AField
          v-model="form.newPassword"
          type="password"
          autocomplete="new-password"
          :maxlength="64"
          placeholder="至少 4 位"
        />
      </AFormRow>
      <AFormRow label="确认新密码" required>
        <AField
          v-model="form.confirmPassword"
          type="password"
          autocomplete="new-password"
          :maxlength="64"
          placeholder="再次输入新密码"
        />
      </AFormRow>
    </div>
    <template #footer>
      <AButton @click="passwordOpen = false">取消</AButton>
      <AButton variant="filled" :loading="saving" @click="savePassword">保存</AButton>
    </template>
  </ASheet>
</template>

<style scoped>
.user-chip {
  display: inline-flex;
  align-items: center;
  min-height: var(--control-height-sm);
  padding: var(--space-1) var(--space-3);
  font: var(--text-caption);
  color: var(--label-2);
  background: var(--fill-3);
  border: 0;
  border-radius: var(--radius-pill);
}

.user-chip--menu {
  cursor: pointer;
}

.user-chip--menu:hover {
  background: var(--fill-4);
}

.password-form {
  display: grid;
  gap: var(--space-4);
}

.password-form :deep(.a-form-row) {
  gap: var(--space-3);
}
</style>
