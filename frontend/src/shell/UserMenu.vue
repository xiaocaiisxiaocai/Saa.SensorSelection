<script setup lang="ts">
import { message } from 'ant-design-vue';
import { ChevronDown, KeyRound, LogOut } from 'lucide-vue-next';
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { api } from '@/api';
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

async function savePassword() {
  validationAttempted.value = true;
  if (!form.currentPassword || !form.newPassword) {
    message.warning('请输入当前密码和新密码');
    return;
  }
  if (form.newPassword.length < 4) {
    message.warning('新密码至少 4 位');
    return;
  }
  if (form.newPassword !== form.confirmPassword) {
    message.warning('两次输入的新密码不一致');
    return;
  }
  if (form.newPassword === form.currentPassword) {
    message.warning('新密码不能与当前密码相同');
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
  <a-modal
    :open="passwordOpen"
    title="修改密码"
    :width="420"
    destroy-on-close
    @cancel="passwordOpen = false"
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
      <a-button @click="passwordOpen = false">取消</a-button>
      <a-button type="primary" :loading="saving" @click="savePassword">
        保存
      </a-button>
    </template>
  </a-modal>
</template>

<style scoped>
.user-menu__trigger {
  display: inline-flex;
  gap: var(--space-3);
  align-items: center;
  max-width: 14rem;
}

.user-menu__avatar {
  flex-shrink: 0;
  color: var(--color-text-light-solid);
  background: var(--color-primary);
}

.user-menu__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu__profile {
  max-width: 18rem;
  white-space: normal;
}

@media (width < 560px) {
  .user-menu__name {
    display: none;
  }
}
</style>
