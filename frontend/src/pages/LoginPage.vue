<script setup lang="ts">
import { Lock, Monitor, Moon, Sun, User } from 'lucide-vue-next';
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { getStoredToken } from '@/api';
import { safeRedirect } from '@/router/guards';
import BrandMark from '@/shell/BrandMark.vue';
import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { useThemeStore } from '@/stores/theme';
import type { ThemePreference } from '@/theme/theme';
import { AButton, AField, AFormRow, toast } from '@/ui';

const auth = useAuthStore();
const selection = useSelectionStore();
const theme = useThemeStore();
const route = useRoute();
const router = useRouter();

const loading = ref(false);
const form = reactive({ username: '', password: '' });
let backendReady: null | Promise<void> = null;

const themeOptions: {
  icon: typeof Sun;
  label: string;
  value: ThemePreference;
}[] = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
];

function targetPath() {
  return safeRedirect(route.query.redirect);
}

async function enter() {
  await router.replace(targetPath());
}

function prepareBackend() {
  backendReady ??= selection.ensureBackendInit();
  return backendReady;
}

async function enterAsGuest() {
  if (loading.value) return;
  auth.clearSession();
  await prepareBackend();
  await enter();
}

async function submit() {
  if (loading.value) return;
  const username = form.username.trim();
  const password = form.password;

  if (!username && !password) {
    toast.warning('请输入用户名和密码');
    return;
  }
  if (!username) {
    toast.warning('请输入用户名');
    return;
  }
  if (!password) {
    toast.warning('请输入密码');
    return;
  }

  loading.value = true;
  try {
    const result = await auth.login(username, password);
    if (!result.ok) {
      toast.error(result.message);
      form.password = '';
      return;
    }
    await prepareBackend();
    await enter();
    toast.success('登录成功');
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const ready = prepareBackend();
  if (!getStoredToken()) return;
  await auth.ensureProfile();
  if (auth.profile) {
    await ready;
    await enter();
  }
});
</script>

<template>
  <div class="login-layout">
    <header class="login-layout__header">
      <div class="theme-switch" role="radiogroup" aria-label="外观主题">
        <button
          v-for="option in themeOptions"
          :key="option.value"
          class="theme-switch__btn"
          type="button"
          role="radio"
          :aria-checked="theme.preference === option.value"
          :aria-label="option.label"
          :title="option.label"
          @click="theme.setPreference(option.value)"
        >
          <component :is="option.icon" :size="16" :stroke-width="1.5" />
        </button>
      </div>
    </header>

    <main class="login-layout__main">
      <section class="login__card">
        <div class="login__brand">
          <BrandMark size="login" />
          <div class="login__headings">
            <h1 class="login__title">感应器选型系统</h1>
            <p class="login__subtitle">Symtek Automation China</p>
          </div>
        </div>

        <form class="login__form" @submit.prevent="submit">
          <AFormRow label="用户名" required>
            <AField
              v-model="form.username"
              :prefix-icon="User"
              autocomplete="username"
              :maxlength="64"
              :clearable="false"
              :disabled="loading"
              placeholder="请输入用户名"
            />
          </AFormRow>
          <AFormRow label="密码" required>
            <AField
              v-model="form.password"
              :prefix-icon="Lock"
              type="password"
              autocomplete="current-password"
              :clearable="false"
              :disabled="loading"
              placeholder="请输入密码"
            />
          </AFormRow>

          <AButton
            variant="filled"
            size="xlarge"
            block
            type="submit"
            :loading="loading"
          >
            登 录
          </AButton>
        </form>

        <p class="login__guest">
          没有账号？
          <button
            class="login__guest-link"
            type="button"
            :disabled="loading"
            @click="enterAsGuest"
          >
            以游客身份预览（只读）
          </button>
        </p>
      </section>
    </main>

    <footer class="login-layout__footer">
      <p>© 2026 Symtek Automation China. 保留所有权利。</p>
    </footer>
  </div>
</template>

<style scoped>
.login-layout {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100dvh;
  padding: var(--space-5);
  background:
    radial-gradient(
      1200px 400px at 20% -10%,
      var(--sys-blue-fill),
      transparent 60%
    ),
    radial-gradient(
      900px 360px at 90% 110%,
      var(--sys-teal-fill),
      transparent 55%
    ),
    var(--bg-window);
}

.login-layout__header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: var(--control-height-lg);
}

.theme-switch {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
  background: var(--fill-4);
  border: 1px solid var(--separator);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(10px);
}

.theme-switch__btn {
  display: grid;
  place-items: center;
  width: var(--control-height-md);
  height: var(--control-height-md);
  color: var(--label-2);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
  transition:
    color var(--dur-1) var(--ease-out),
    background-color var(--dur-1) var(--ease-out);
}

.theme-switch__btn:hover {
  color: var(--label);
  background: var(--fill-3);
}

.theme-switch__btn:active {
  opacity: 0.7;
}

.theme-switch__btn[aria-checked='true'] {
  color: var(--sys-blue);
  background: var(--sys-blue-fill);
}

.login-layout__main {
  display: grid;
  flex: 1;
  place-items: center;
  padding: var(--space-4) 0;
}

.login__card {
  display: grid;
  gap: var(--space-5);
  width: min(100%, 400px);
  padding: var(--space-7) var(--space-6);
  background: var(--bg-elevated);
  border: 1px solid var(--separator);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-3);
}

.login__brand {
  display: grid;
  gap: var(--space-3);
  justify-items: center;
  text-align: center;
}

.login__headings {
  display: grid;
  gap: var(--space-1);
}

.login__title {
  margin: 0;
  font: var(--text-title-2);
  font-weight: 700;
  color: var(--label);
  letter-spacing: var(--tracking-title-2);
}

.login__subtitle {
  margin: 0;
  font: var(--text-caption);
  color: var(--label-2);
  letter-spacing: var(--tracking-caption);
}

.login__form {
  display: grid;
  gap: var(--space-3);
}

.login__guest {
  margin: 0;
  font: var(--text-control);
  color: var(--label-2);
  text-align: center;
}

.login__guest-link {
  padding: 0;
  font: inherit;
  color: var(--sys-blue);
  cursor: pointer;
  background: transparent;
  border: 0;
  transition: opacity var(--dur-1) var(--ease-out);
}

.login__guest-link:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.login__guest-link:hover:not(:disabled) {
  text-decoration: underline;
}

.login-layout__footer {
  padding: var(--space-2) 0;
  font: var(--text-caption);
  color: var(--label-3);
  text-align: center;
}

.login-layout__footer p {
  margin: 0;
}
</style>
