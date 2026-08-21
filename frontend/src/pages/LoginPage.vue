<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { getStoredToken } from '@/api';
import { safeRedirect } from '@/router/guards';
import BrandMark from '@/shell/BrandMark.vue';
import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { AButton, AField, AFormRow, toast } from '@/ui';

const auth = useAuthStore();
const selection = useSelectionStore();
const route = useRoute();
const router = useRouter();

const loading = ref(false);
const form = reactive({ username: '', password: '' });

function targetPath() {
  return safeRedirect(route.query.redirect);
}

async function enter() {
  await router.replace(targetPath());
}

async function enterAsGuest() {
  auth.clearSession();
  await selection.initBackend();
  await enter();
}

async function submit() {
  if (loading.value) return;
  if (!form.username.trim() || !form.password) {
    toast.warning('请输入用户名和密码');
    return;
  }
  loading.value = true;
  try {
    const result = await auth.login(form.username, form.password);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success('登录成功');
    await selection.initBackend();
    await enter();
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (!getStoredToken()) return;
  await auth.ensureProfile();
  if (auth.profile) await enter();
});
</script>

<template>
  <main class="login">
    <section class="login__card">
      <div class="login__brand">
        <BrandMark size="login" />
        <h1>感应器选型软件</h1>
        <p>Symtek Automation China · Sensor Selection</p>
      </div>
      <form class="login__form" @submit.prevent="submit">
        <AFormRow label="用户名" required>
          <AField
            v-model="form.username"
            autocomplete="username"
            :maxlength="64"
            placeholder="请输入用户名"
          />
        </AFormRow>
        <AFormRow label="密码" required>
          <AField
            v-model="form.password"
            type="password"
            autocomplete="current-password"
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
        <button class="login__guest-link" type="button" @click="enterAsGuest">
          以游客身份预览（只读）
        </button>
      </p>
    </section>
  </main>
</template>

<style scoped>
.login {
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: var(--space-7);
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

.login__card {
  display: grid;
  gap: var(--space-6);
  width: min(100%, 400px);
  padding: var(--space-8) var(--space-7);
  background: var(--bg-elevated);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-3);
}

.login__brand {
  display: grid;
  gap: var(--space-3);
  justify-items: center;
  text-align: center;
}

h1 {
  margin: 0;
  font: var(--text-title-1);
  letter-spacing: var(--tracking-title-1);
}

.login__brand p {
  margin: 0;
  font: var(--text-caption);
  color: var(--label-2);
  letter-spacing: var(--tracking-caption);
}

.login__form {
  display: grid;
  gap: var(--space-4);
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
}

.login__guest-link:hover {
  text-decoration: underline;
}
</style>
