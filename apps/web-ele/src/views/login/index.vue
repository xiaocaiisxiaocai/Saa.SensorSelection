<script lang="ts" setup>
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { ElButton, ElForm, ElFormItem, ElInput, ElMessage } from 'element-plus';

import { getStoredToken, storeToken } from '#/modules/selection/api';
import { useSelectionStore } from '#/modules/selection/store';

defineOptions({ name: 'LoginView' });

const store = useSelectionStore();
const route = useRoute();
const router = useRouter();

const loading = ref(false);
const form = reactive({ username: '', password: '' });

/** 登录/游客进入后的落点（支持 ?redirect= 回跳，默认客户管理）。 */
function enter(guest = false) {
  // 游客进入前清除残留 token（如失效 token），避免守卫再次重定向回登录页
  if (guest) storeToken(null);
  const redirect =
    typeof route.query.redirect === 'string' && route.query.redirect
      ? route.query.redirect
      : '/selection/customer';
  router.replace(redirect);
}

async function submit() {
  if (loading.value) return;
  if (!form.username.trim() || !form.password) {
    ElMessage.warning('请输入用户名和密码');
    return;
  }
  loading.value = true;
  try {
    const result = await store.login(form.username, form.password);
    if (!result.ok) {
      ElMessage.error(result.message || '登录失败');
      return;
    }
    ElMessage.success('登录成功');
    enter();
  } finally {
    loading.value = false;
  }
}

/** 已持有有效 token（如刷新 /login 页）→ 直接回到业务首页，不显示登录表单。 */
onMounted(async () => {
  if (!getStoredToken()) return;
  await store.ensureProfile();
  if (store.profile) enter();
});
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <div class="login-brand__logo">SAA</div>
        <h1>感应器选型软件</h1>
        <p>Symtek Automation China · Sensor Selection</p>
      </div>
      <ElForm class="login-form" label-position="top" @submit.prevent="submit">
        <ElFormItem label="用户名" required>
          <ElInput
            v-model="form.username"
            autocomplete="username"
            maxlength="64"
            placeholder="请输入用户名"
            size="large"
          />
        </ElFormItem>
        <ElFormItem label="密码" required>
          <ElInput
            v-model="form.password"
            autocomplete="current-password"
            placeholder="请输入密码"
            show-password
            size="large"
            type="password"
            @keyup.enter="submit"
          />
        </ElFormItem>
        <ElButton
          :loading="loading"
          class="login-form__submit"
          size="large"
          type="primary"
          @click="submit"
        >
          登 录
        </ElButton>
      </ElForm>
      <div class="login-guest">
        没有账号？
        <button class="login-guest__link" type="button" @click="enter(true)">
          以游客身份预览（只读）
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: radial-gradient(
      1200px 600px at 15% 10%,
      rgb(15 118 110 / 14%),
      transparent 60%
    ),
    radial-gradient(
      900px 500px at 90% 90%,
      rgb(37 99 235 / 12%),
      transparent 60%
    ),
    hsl(var(--background-deep));
}

.login-card {
  width: min(400px, 100%);
  padding: 40px 36px 32px;
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  background: hsl(var(--card));
  box-shadow: 0 18px 50px rgb(15 23 42 / 10%);
}

.login-brand {
  margin-bottom: 28px;
  text-align: center;
}

.login-brand__logo {
  display: grid;
  width: 56px;
  height: 56px;
  margin: 0 auto 14px;
  place-items: center;
  border-radius: 14px;
  background: linear-gradient(135deg, #0f766e, #1d4ed8);
  color: #fff;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 1px;
}

.login-brand h1 {
  margin: 0;
  color: hsl(var(--foreground));
  font-size: 20px;
  letter-spacing: 2px;
}

.login-brand p {
  margin: 8px 0 0;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}

.login-form__submit {
  width: 100%;
  margin-top: 6px;
  letter-spacing: 4px;
}

.login-guest {
  margin-top: 18px;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  text-align: center;
}

.login-guest__link {
  padding: 0;
  border: 0;
  background: transparent;
  color: hsl(var(--primary));
  cursor: pointer;
  font: inherit;
}

.login-guest__link:hover {
  text-decoration: underline;
}
</style>
