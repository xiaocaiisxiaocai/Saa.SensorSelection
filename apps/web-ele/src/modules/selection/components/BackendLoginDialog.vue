<script lang="ts" setup>
import { computed, reactive, ref } from 'vue';

import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
} from 'element-plus';

import { useSelectionStore } from '../store';

const store = useSelectionStore();

const visible = computed(() => store.backendStatus === 'unauthorized');
const loading = ref(false);
const form = reactive({ username: '', password: '' });

async function submit() {
  if (loading.value) return;
  loading.value = true;
  try {
    const result = await store.login(form.username, form.password);
    if (!result.ok) {
      ElMessage.error(result.message || '登录失败');
      return;
    }
    ElMessage.success('登录成功');
    form.password = '';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <ElDialog
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :model-value="visible"
    :show-close="false"
    append-to-body
    title="登录 Symtek 选型系统"
    width="380px"
  >
    <ElForm label-position="top" @submit.prevent="submit">
      <ElFormItem label="用户名" required>
        <ElInput
          v-model="form.username"
          autocomplete="username"
          maxlength="64"
          placeholder="请输入用户名"
        />
      </ElFormItem>
      <ElFormItem label="密码" required>
        <ElInput
          v-model="form.password"
          autocomplete="current-password"
          placeholder="请输入密码"
          show-password
          type="password"
          @keyup.enter="submit"
        />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton :loading="loading" type="primary" @click="submit">
        登 录
      </ElButton>
    </template>
  </ElDialog>
</template>
