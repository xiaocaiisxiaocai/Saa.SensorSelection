<script lang="ts" setup>
import { onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';

import { BasicLayout } from '@vben/layouts';

import { getStoredToken } from '#/modules/selection/api';
import AppHeaderUser from '#/modules/selection/components/AppHeaderUser.vue';
import AppToolbar from '#/modules/selection/components/AppToolbar.vue';
import BackendStatusBanner from '#/modules/selection/components/BackendStatusBanner.vue';
import { useSelectionStore } from '#/modules/selection/store';

const store = useSelectionStore();
const router = useRouter();

onMounted(() => {
  store.ensureBackendInit();
});

// 会话失效（token 存在但已过期/无效）时跳到登录页；
// 匿名态（登出/游客预览，无 token）保持停留在只读预览页，不做强制跳转。
watch(
  () => store.backendStatus,
  (status) => {
    if (
      status === 'unauthorized' &&
      getStoredToken() &&
      router.currentRoute.value.path !== '/login'
    ) {
      router.replace('/login');
    }
  },
);
</script>

<template>
  <BasicLayout>
    <template #header-left-100>
      <AppToolbar />
    </template>
    <template #user-dropdown>
      <AppHeaderUser />
    </template>
  </BasicLayout>
  <BackendStatusBanner />
</template>
