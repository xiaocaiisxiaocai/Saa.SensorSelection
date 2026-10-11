<script setup lang="ts">
import { message } from 'ant-design-vue';
import { Lock, User } from 'lucide-vue-next';
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { getStoredToken } from '@/api';
import { safeRedirect } from '@/router/guards';
import { fieldError } from '@/pages/shared/form';
import BrandMark from '@/shell/BrandMark.vue';
import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

const auth = useAuthStore();
const selection = useSelectionStore();
const route = useRoute();
const router = useRouter();

const loading = ref(false);
const validationAttempted = ref(false);
const form = reactive({ username: '', password: '' });
const usernameError = computed(() =>
  validationAttempted.value && !form.username.trim()
    ? '请输入用户名'
    : undefined,
);
const passwordError = computed(() =>
  validationAttempted.value && !form.password ? '请输入密码' : undefined,
);
// 登录失败的原因（用户名或密码错误等）单独用一条常驻提示展示，不跟“必填”
// 校验共用同一行——否则清空密码后 usernameError/passwordError 会立刻把
// 真正的失败原因顶替掉，用户看到的会是一句误导性的“请输入密码”。
// 只在下一次提交时清掉它（submit 开头），不用输入监听器清——那样会跟
// “登录失败后自动清空密码框”这个动作打架，把刚设好的错误立刻冲掉。
const loginError = ref<string | null>(null);
const usernameField = ref<{ focus: () => void } | null>(null);
const passwordField = ref<{ focus: () => void } | null>(null);
let backendReady: null | Promise<void> = null;

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
  loginError.value = null;
  validationAttempted.value = true;
  const username = form.username.trim();
  const password = form.password;

  // 字段级错误已经由用户名/密码输入框下方的红字说明，不再额外弹一条说法
  // 不完全一样的提示。
  if (!username || !password) {
    return;
  }

  loading.value = true;
  try {
    const result = await auth.login(username, password);
    if (!result.ok) {
      // 用失败原因常驻展示，不用“必填”提示顶替；密码清空后重新聚焦，
      // 方便直接重试。字段在 loading 期间是 disabled 的，disabled 的
      // 输入框接不到焦点，所以要先解除 loading 再 focus。
      loginError.value = result.message;
      validationAttempted.value = false;
      form.password = '';
      loading.value = false;
      await nextTick();
      passwordField.value?.focus();
      return;
    }
    await prepareBackend();
    await enter();
    message.success('登录成功');
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const ready = prepareBackend();
  if (!getStoredToken()) {
    loginError.value = null;
    // 没有已登录态需要静默跳转时，才把焦点交给用户名框，避免抢在跳转前抖一下。
    usernameField.value?.focus();
    return;
  }
  await auth.ensureProfile();
  if (auth.profile) {
    await ready;
    await enter();
    return;
  }
  // 带着 token 来到登录页却换不回身份，说明这次是「做着做着被踢出来」——
  // 账号被停用/删除、或 token 过期。不说明原因的话，用户只会看到自己突然
  // 回到了登录页，完全不知道发生了什么。
  if (auth.sessionExpired) {
    loginError.value =
      '登录已失效，请重新登录（账号可能已被停用或长时间未操作）';
  }
  usernameField.value?.focus();
});
</script>

<template>
  <div class="login-layout">
    <main class="login-layout__main">
      <a-card class="login__card" :bordered="false">
        <div class="login__brand">
          <BrandMark size="login" />
          <h1 class="login__title">感应器选型系统</h1>
          <a-typography-text type="secondary">
            Symtek Automation China
          </a-typography-text>
        </div>

        <a-alert
          v-if="loginError"
          class="login__error"
          type="error"
          show-icon
          :message="loginError"
        />

        <a-form layout="vertical" @submit="submit">
          <a-form-item
            html-for="login-username"
            label="用户名"
            required
            v-bind="fieldError(usernameError)"
          >
            <a-input
              id="login-username"
              ref="usernameField"
              v-model:value="form.username"
              size="large"
              autocomplete="username"
              :maxlength="64"
              :disabled="loading"
              placeholder="请输入用户名"
            >
              <template #prefix><User :size="16" /></template>
            </a-input>
          </a-form-item>
          <a-form-item
            html-for="login-password"
            label="密码"
            required
            v-bind="fieldError(passwordError)"
          >
            <a-input-password
              id="login-password"
              ref="passwordField"
              v-model:value="form.password"
              size="large"
              autocomplete="current-password"
              :disabled="loading"
              placeholder="请输入密码"
            >
              <template #prefix><Lock :size="16" /></template>
            </a-input-password>
          </a-form-item>
          <a-form-item>
            <a-button
              type="primary"
              size="large"
              block
              html-type="submit"
              :loading="loading"
            >
              登录
            </a-button>
          </a-form-item>
        </a-form>

        <div class="login__guest">
          <a-typography-text type="secondary">没有账号？</a-typography-text>
          <a-button type="link" :disabled="loading" @click="enterAsGuest">
            以游客身份预览（只读）
          </a-button>
        </div>
      </a-card>
    </main>

    <footer class="login-layout__footer">
      © 2026 Symtek Automation China. 保留所有权利。
    </footer>
  </div>
</template>

<style scoped>
.login-layout {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  padding: var(--space-5);
  background: var(--color-bg-layout);
}

.login-layout__main {
  display: grid;
  flex: 1;
  place-items: center;
}

.login__card {
  width: min(100%, 400px);
  box-shadow: var(--box-shadow-tertiary);
}

.login__brand {
  display: grid;
  gap: var(--space-3);
  justify-items: center;
  margin-bottom: var(--space-7);
  text-align: center;
}

.login__title {
  margin: 0;
  font: var(--font-heading-4);
  color: var(--color-text);
}

.login__error {
  margin-bottom: var(--space-7);
}

.login__guest {
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-layout__footer {
  font: var(--font-sm);
  color: var(--color-text-tertiary);
  text-align: center;
}
</style>
