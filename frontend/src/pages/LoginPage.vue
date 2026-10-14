<script setup lang="ts">
import { message } from 'ant-design-vue';
import { Lock, User } from 'lucide-vue-next';
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { getStoredToken } from '@/api';
import { safeRedirect } from '@/router/guards';
import { fieldError } from '@/pages/shared/form';
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
  // 登录失效回到登录页时不额外提示，直接让用户重新登录
  usernameField.value?.focus();
});
</script>

<template>
  <div class="login-layout">
    <main class="login-layout__main">
      <a-card class="login__card" :bordered="false">
        <h1 class="visually-hidden">登录感应器选型系统</h1>
        <!-- 只显示系统名称，不放 logo -->
        <p class="login__title" aria-hidden="true">感应器选型</p>

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

<style scoped src="./LoginPage.css"></style>
